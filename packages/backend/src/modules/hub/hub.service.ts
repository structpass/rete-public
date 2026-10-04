import { Injectable } from '@nestjs/common';
import { HubMenuDto, HubMenuItemDto } from './dto/hub-menu.dto';

/**
 * Hub のメニューを組み立てる。外部システムの URL は env 駆動（ハードコードしない）。
 *
 * 連結軸の入口（Rete）から各システムへ分岐する導線を表す:
 *  - rete: Rete 自身の機能（タスク等）。
 *  - system: 外部システム連携（struct-pass-reference 等、OIDC RP 経由）。
 */
@Injectable()
export class HubService {
  getMenu(): HubMenuDto {
    const referenceUrl = process.env.REFERENCE_APP_URL ?? 'http://localhost:3000';
    // href はフロントで window.location.href（遷移）と probe fetch の両方に渡る。env 設定ミス（ops）で
    // javascript: / file: 等の危険スキームが入ると open redirect / ローカルアクセスになりうるため、
    // http(s) 以外は連携不可（available=false）に倒す（防御的・通常は http(s) のみ）。
    const referenceUrlSafe = (() => {
      try {
        const u = new URL(referenceUrl);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    })();
    // OIDC RP 連携が完成するまで「システム」導線はグレー（準備中）に保つ。URL を設定しただけでは
    // 有効化しない（未完成導線を前倒し有効化すると、遷移先で接続 / SSO エラーになるため）。
    // 連携が完成したら REFERENCE_OIDC_READY=true で開放する。空 URL / 危険スキームでは有効化しない。
    const referenceReady =
      process.env.REFERENCE_OIDC_READY === 'true' &&
      Boolean(process.env.REFERENCE_APP_URL) &&
      referenceUrlSafe;

    const items: HubMenuItemDto[] = [
      {
        key: 'tasks',
        label: 'タスク',
        description: 'Rete のタスク管理',
        category: 'rete',
        type: 'internal',
        href: '/tasks',
        // タスク CRUD 垂直スライスは次フェーズ。Hub には掲示しつつ未接続を明示する。
        available: false,
      },
      {
        key: 'reference',
        label: 'Struct Pass リファレンス',
        description: '商品・在庫管理のリファレンス実装（OIDC 連携でシングルサインオン）',
        category: 'system',
        type: 'external',
        href: referenceUrl,
        // RP 連携の完了は次フェーズ。連携が完成し REFERENCE_OIDC_READY=true の時だけ導線を有効化する。
        available: referenceReady,
      },
    ];

    return { items };
  }
}
