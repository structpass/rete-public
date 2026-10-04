import { Injectable } from '@nestjs/common';
import { Tenant, TenantSystem } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  runInSerializableTransaction,
  INTERACTIVE_SAVE_TX_OPTIONS,
} from '../../../common/database/serializable-tx';
import { validateReorderSet } from '../../../common/database/validate-reorder-set';
import {
  DEFAULT_TENANT_BADGE_COLOR,
  DEFAULT_TENANT_NAME,
  TENANT_SINGLETON_ID,
} from '../settings.constants';

/** テナント情報の部分更新パッチ（未指定フィールドは既存値保持）。 */
export interface TenantPatch {
  name?: string;
  badgeColor?: string;
}

/**
 * reorder の結果。トランザクション内で「orderedIds == 現存全件」を検証し、
 * 不一致なら set-mismatch（service が 400 に翻訳）。HTTP 例外を data 層に持ち込まないための型
 * （favorites.ReorderResult と同型・cmn-0345 で tx 内検証へ移設）。
 */
export type ReorderResult =
  | { ok: true; items: TenantSystem[] }
  | { ok: false; reason: 'set-mismatch' };

/**
 * テナント設定のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 */
@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- テナント情報（単一行 singleton）---

  /** テナント情報（単一行 singleton）を引く。未設定なら null。 */
  findTenant(): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({
      where: { id: TENANT_SINGLETON_ID },
    });
  }

  /**
   * テナント情報を部分 upsert する（単一行 singleton）。update では undefined フィールドが Prisma により
   * 更新スキップされ既存値を保持するため read-modify-write 不要で原子的。新規行（create）のみ未指定
   * フィールドを既定値で補完する（NOT NULL 列を埋めるため）。
   */
  upsertTenant(patch: TenantPatch): Promise<Tenant> {
    return this.prisma.tenant.upsert({
      where: { id: TENANT_SINGLETON_ID },
      create: {
        id: TENANT_SINGLETON_ID,
        name: patch.name ?? DEFAULT_TENANT_NAME,
        badgeColor: patch.badgeColor ?? DEFAULT_TENANT_BADGE_COLOR,
      },
      update: {
        name: patch.name,
        badgeColor: patch.badgeColor,
      },
    });
  }

  // --- 契約システム ---

  /** 契約システムを id 指定で引く（存在確認用・id のみ）。 */
  findSystemById(id: string): Promise<{ id: string } | null> {
    return this.prisma.tenantSystem.findUnique({ where: { id }, select: { id: true } });
  }

  /**
   * 複数のシステム id を 1 クエリで一括照合し、実在する id の Set を返す（MEDIUM-5+6 N+1 解消）。
   * normalizePermissions の system 行クロスチェックで逐次 findUnique（N+1）を呼んでいた問題を解消する。
   * 空配列なら DB にアクセスせず空 Set を返す。
   */
  async findSystemIdsByIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.tenantSystem.findMany({
      where: { id: { in: ids }, enabled: true },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** 契約システム一覧を sortOrder 昇順で引く（同順位は id で安定化）。 */
  findSystems(): Promise<TenantSystem[]> {
    return this.prisma.tenantSystem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 契約システムの並び替えを永続化し、反映後の一覧を返す。cmn-0345: 集合検証を tx 内へ移設した
   * （favorites.repository.reorder と同型）。「一覧を読む → 検証 → 更新 → 再読込」をすべて 1 つの
   * Serializable tx 内で行い、検証失敗時は更新も再読込も 1 本も発行せず set-mismatch を返す。
   * 旧実装（service 層で tx 外検証）の「検証後〜更新前に他管理者が追加・削除すると古い一覧で
   * 書き込まれる」TOCTOU を封じる。
   * 発行順は id 昇順に固定する（cmn-0050(C4) 規約: 並行 reorder 同士が逆順で行ロックを取り合う
   * 不要な P2034 abort を防ぐ）。反映後の再読込も同一 tx 内で返す（favorites / categories と同型）。
   * tx オプションは対話保存セット（INTERACTIVE_SAVE_TX_OPTIONS）を使う（cmn-0347）: 実体は
   * TENANT_SYSTEM_DEFS の 4 件で、人が待つ管理画面の操作に 500 件想定の既定タイマー（15s×3）を
   * 被せると混雑時に 1 リクエストが接続を長く保持してプール枯渇を押す側へ回るため。
   * 形式選択基準（interactive vs 配列）の本文は serializable-tx.ts の JSDoc が正本（ここは pointer）。
   */
  async reorderSystems(orderedIds: string[]): Promise<ReorderResult> {
    // 直列化の所作（timeout / maxWait / 時間予算 / P2034 リトライ / warn）は共通ヘルパへ寄せる
    // ＝ここで $transaction を直に呼ぶと、それらが一切効かない経路が復活する（cmn-0251）。
    return runInSerializableTransaction(
      this.prisma,
      async (tx) => {
        const current = await tx.tenantSystem.findMany({
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        // 集合検証は validateReorderSet へ共通化（cmn-0151・cmn-0345）。重複 id は Set 化で潰れる
        // ため size 比較だけでは集合一致と誤判定する（同一行へ 2 度 write する穴）＝長さも突き合わせる。
        const sameSet = validateReorderSet(
          current.map((s) => s.id),
          orderedIds,
        );
        if (!sameSet) {
          return { ok: false, reason: 'set-mismatch' as const };
        }

        const sortOrderById = new Map(orderedIds.map((id, index) => [id, index]));
        for (const id of [...orderedIds].sort()) {
          await tx.tenantSystem.update({
            where: { id },
            data: { sortOrder: sortOrderById.get(id)! },
          });
        }
        const items = await tx.tenantSystem.findMany({
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        });
        return { ok: true, items };
      },
      INTERACTIVE_SAVE_TX_OPTIONS,
    );
  }

  /** 契約システムの有効/無効を更新する。 */
  toggleSystem(id: string, enabled: boolean): Promise<TenantSystem> {
    return this.prisma.tenantSystem.update({
      where: { id },
      data: { enabled },
    });
  }

  /**
   * 契約システムを削除する（ST-3 cascade cleanup）。
   * TenantSystem 本体を削除する。権限行（RolePermission）は set-0180 で撤去済み。
   */
  async deleteSystem(id: string): Promise<void> {
    await this.prisma.$transaction([this.prisma.tenantSystem.delete({ where: { id } })]);
  }
}
