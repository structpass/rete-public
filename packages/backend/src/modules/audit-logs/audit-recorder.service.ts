import { Injectable, Logger } from '@nestjs/common';
import { AUDIT_ACTION_TYPES, type AuditActionType } from '@rete/shared';
import {
  AuditLogsRepository,
  type CreateAuditLogInput,
} from './repositories/audit-logs.repository';

/**
 * 操作ログ記録の入力型（interceptor / controller → AuditRecorderService 境界）。
 * details は任意（横断 interceptor では省略、将来の明示記録で積む）。
 */
export interface AuditRecordInput {
  actorAccountId?: string | null;
  actorName: string;
  actorEmail: string;
  systemId?: string | null;
  systemName: string;
  actionType: AuditActionType | string;
  feature?: string;
  summary?: string;
  details?: object | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * 明示記録に載せるアクセス元（IP・User-Agent）。controller が common/net/client-ip の
 * clientIp / clientUserAgent で取り出し、service へ渡す（service は Request を知らない＝
 * HTTP 依存を app 層へ持ち込まない）。未指定は record 側で null に寄る。
 * 入力型 AuditRecordInput から切り出して定義し、受け側と形が割れないようにする
 * （rete-members-0001＝fil-0106 項目3 の members / memberships への横展開）。
 */
export type AuditClientInfo = Pick<AuditRecordInput, 'ipAddress' | 'userAgent'>;

/**
 * userAgent の最大保存長。User-Agent ヘッダはクライアント任意の text のため、
 * 無制限保存だと巨大 UA の連投で audit_logs テーブルが肥大化する（DoS 緩和）。
 * 実 UA は 200 字前後に収まるため 512 で実害なく切り詰める。
 */
const MAX_USER_AGENT_LENGTH = 512;

/**
 * 操作ログ書き込みの application service（H5 記録 infra）。
 *
 * §4 best-effort: 書き込み失敗でも操作リクエストを巻き込まない。
 * try/catch で失敗を握り潰さず logger.error のみ（throw しない）。
 * actionType 検証（@IsIn 相当）は本クラスが担う（Repository は純粋 DB 書き込みのみ）。
 * ipAddress / userAgent の正規化（空文字→null・UA 切り詰め）も記録直前にここで一元化する。
 */
@Injectable()
export class AuditRecorderService {
  private readonly logger = new Logger(AuditRecorderService.name);

  constructor(private readonly repo: AuditLogsRepository) {}

  /**
   * 監査ログを 1 件記録する。**本メソッドは決して reject しない**（fil-0106 項目6）＝失敗は
   * logger.error に落として正常 return する。呼び出し側が await しても fire-and-forget しても、
   * 監査の失敗が業務処理の応答を壊さないことをここで約束する。
   *
   * 呼び出し側の try/catch（files.service の権限変更など）は、この約束が将来破れた時に
   * 「保存は成功したのに 500 が返る」へ化けるのを防ぐ二重の受け＝到達しないのが正常。守りなので外さない。
   */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      // actionType 値域検証（AUDIT_ACTION_TYPES @IsIn 相当）。
      if (!AUDIT_ACTION_TYPES.includes(input.actionType as AuditActionType)) {
        this.logger.error(
          `Invalid actionType for audit record: "${input.actionType}" — skipping record`,
        );
        return;
      }

      const data: CreateAuditLogInput = {
        actorAccountId: input.actorAccountId ?? null,
        actorName: input.actorName,
        actorEmail: input.actorEmail,
        systemId: input.systemId ?? null,
        systemName: input.systemName,
        actionType: input.actionType,
        feature: input.feature ?? '',
        summary: input.summary ?? '',
        // 空文字（clientIp が IP 不明時に返す ''）は null に寄せ、UA は上限長で切り詰める。
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
      };
      if (input.details != null) {
        data.details = input.details as CreateAuditLogInput['details'];
      }
      await this.repo.create(data);
    } catch (err) {
      // 操作リクエストを巻き込まないため throw しない（operational-policy §3 止めない側）。
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to record audit log [${input.actionType}]: ${detail}`);
    }
  }
}
