import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { LoginSettingsService } from '../../login-settings/login-settings.service';
import { clientIp } from '../../../common/net/client-ip';
import { isIpAllowed } from '../../../common/net/cidr';
import { API_GLOBAL_PREFIX_PATH } from '../../../common/config/api-routes';

/**
 * IP 許可リスト遮断ガード（set-0025 P1 + set-0034 hardening）。login-settings の IP 許可リストが
 * 1 件以上設定されている時、リスト外 IP からの全リクエストを 403 IP_NOT_ALLOWED で遮断する。認証境界より
 * 前で弾くため未認証リクエストにも効く（APP_GUARD 配列の先頭に登録し ThrottlerGuard より前で評価）。
 *
 * - 空リスト = 制限なし（全許可）。自己ロックアウト防止のため "空＝全許可" を guard 側で明示扱いする
 *   （isIpAllowed は空配列で false を返すため、ここで length===0 を先に救う）。
 * - EXEMPT: /health（死活確認）＋ OIDC バックチャネル（server-to-server・後述）。
 * - IP 取得不能（clientIp が空文字）はリスト非空なら isIpAllowed が false → 拒否側に倒す（fail-secure）。
 * - DB 例外は素通しせず AllExceptionsFilter に委ねる（fail-open で制限を無効化しない）。
 * - set-0034: 許可リストは TTL キャッシュ（15s）で取得し毎リクエスト DB 取得を避ける。遮断時は warn ログ。
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private static readonly GLOBAL_PREFIX = API_GLOBAL_PREFIX_PATH;

  /** 許可リスト取得の TTL キャッシュ（set-0034）。反映遅延 ≤15s は許容（operational-policy §9）。 */
  private static readonly CIDR_CACHE_TTL_MS = 15_000;

  /**
   * 遮断から除外する path（prefix 剥がし後の厳密な前方一致）。`base` 完全一致 or `base/...` のみ除外し
   * 部分文字列一致（includes）は使わない（MfaEnforcementGuard と同じ穴を作らない方式）。
   * - /health = DB readiness 同居の死活確認（@SkipThrottle 済の運用 probe）
   * - /oidc/{token,me,jwks,.well-known} = OIDC バックチャネル（set-0034）。RP（reference）が server-to-server
   *   で叩く経路で、発信 IP は利用者ブラウザ IP と別系統のため許可リストに乗らない。いずれもエンドポイント
   *   自身の認証を持つ（token=client_secret / me=bearer access token / jwks・.well-known=公開情報）ので
   *   IP 制限を外しても認可境界は崩れない。一方フロントチャネル（/oidc/auth・/auth/interaction＝利用者
   *   ブラウザ）は除外せず IP 制限を適用する（SSO 利用者も許可 IP 内＝ネットワーク境界の既定方針）。
   */
  private static readonly EXEMPT_BASES = [
    '/health',
    '/oidc/token',
    '/oidc/me',
    '/oidc/jwks',
    '/oidc/.well-known',
  ];

  private readonly logger = new Logger(IpAllowlistGuard.name);

  /** APP_GUARD はシングルトンのためインスタンスキャッシュがリクエスト間で持続する。 */
  private cidrCache: { value: string[]; expiresAt: number } | null = null;

  /**
   * 取得中の DB 問い合わせ Promise（set-0037 cache stampede 抑制）。TTL 失効後の最初の cache miss が
   * これを保持し、完了までに来た同時 miss は同じ Promise に相乗りする（getIpWhitelistCidrs は1回）。
   * 完了・失敗いずれでも null へ戻す（例外はキャッシュせず次回 miss で再取得＝既存方針維持）。
   */
  private cidrInflight: Promise<string[]> | null = null;

  constructor(private readonly loginSettings: LoginSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    // 除外 path（死活確認 / OIDC バックチャネル）は IP 制限と無関係に常に通す。
    const raw = (req.path || req.url || '').split('?')[0];
    const path = raw.startsWith(IpAllowlistGuard.GLOBAL_PREFIX)
      ? raw.slice(IpAllowlistGuard.GLOBAL_PREFIX.length)
      : raw;
    if (IpAllowlistGuard.EXEMPT_BASES.some((b) => path === b || path.startsWith(`${b}/`))) {
      return true;
    }

    const cidrs = await this.getCidrsCached();
    if (cidrs.length === 0) return true; // 制限なし（空＝全許可・自己ロックアウト防止）

    const ip = clientIp(req);
    if (isIpAllowed(ip, cidrs)) return true;

    // 遮断ログ（warn・operational-policy §2 ログ方針）。IP / endpoint のみ（秘匿情報は出さない）。
    // path は外部入力。CR/LF を除去しログ行偽装（log injection / CWE-117）を防ぐ（http-exception.filter と同方式）。
    const safePath = path.replace(/[\r\n]/g, '');
    this.logger.warn(`IP_NOT_ALLOWED: ${req.method ?? '?'} ${safePath} from ${ip || '(unknown)'}`);

    throw new HttpException(
      { code: 'IP_NOT_ALLOWED', message: 'アクセスが許可されていません' },
      HttpStatus.FORBIDDEN,
    );
  }

  /**
   * 許可リスト CIDR を TTL キャッシュ越しに取得する（set-0034 / set-0037）。キャッシュ未満了ならそれを返し、
   * 失効時のみ DB を引く。失効時の同時 miss は inflight Promise で1回の DB 取得に集約する（cache stampede 抑制）。
   * DB 例外はキャッシュせず伝播させ AllExceptionsFilter に委ねる（fail-open 回避）。
   */
  private async getCidrsCached(): Promise<string[]> {
    const now = Date.now();
    if (this.cidrCache && now < this.cidrCache.expiresAt) {
      return this.cidrCache.value;
    }
    // 失効後の最初の miss が DB 取得を保持し、後続の同時 miss は同じ Promise に相乗りする（DB 取得は1回）。
    if (this.cidrInflight) {
      return this.cidrInflight;
    }
    const inflight = this.loginSettings
      .getIpWhitelistCidrs()
      .then((value) => {
        this.cidrCache = { value, expiresAt: Date.now() + IpAllowlistGuard.CIDR_CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        // 成功・失敗いずれでもクリア。例外時は cidrCache を更新しないので次回 miss で再取得される。
        this.cidrInflight = null;
      });
    this.cidrInflight = inflight;
    return inflight;
  }
}
