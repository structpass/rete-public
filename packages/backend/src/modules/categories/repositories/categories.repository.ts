import { Injectable } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import { validateReorderSet } from '../../../common/database/validate-reorder-set';

/**
 * reorder の結果。トランザクション内で「orderedIds == 現存全件」を検証し、
 * 不一致なら set-mismatch（service が 400 に翻訳）。HTTP 例外を data 層に持ち込まないための型。
 */
export type ReorderResult = { ok: true; items: Category[] } | { ok: false; reason: 'set-mismatch' };

/**
 * Category のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 */
@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 一覧取得。分類は Space 単位スコープ（rete-desk-0158）のため spaceId で必ず絞る。
   * 既定はアーカイブ済を除外、includeArchived=true で全件（マスタ管理画面用 / rete-desk-0140）。
   *
   * 存在秘匿（ADR 0042）: visibleSpaceIds は必須（cmn-0221 で fail-open 撤廃）。引数省略は
   * 型エラーにして「他 Space の分類が引ける」経路を本番コード上からゼロにする。可視集合外
   * を渡された spaceId は結果空配列（scalar 等価 ＋ AND 句で両側から落とす）。
   */
  findAll(
    spaceId: string,
    includeArchived: boolean,
    visibleSpaceIds: string[],
  ): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: {
        spaceId,
        ...(includeArchived ? {} : { archivedAt: null }),
        // 可視 Space 絞り込みは scalar 列 spaceId を直接フィルタ（@@index([spaceId]) 活用・不要な space JOIN 回避）。
        // spaceId は上の scalar 等価と同一キーのため AND で両立させる（要求 spaceId='x' AND x ∈ 可視集合）。
        // 要求 spaceId が可視集合外なら結果は空＝他 space を含めない（ADR 0042 存在秘匿）。
        AND: [{ spaceId: { in: visibleSpaceIds } }],
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: number): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  /** 当該 Space の全カテゴリ id 集合（reorder の完全一致検証 / rete-desk-0197）。アーカイブ済も含む。 */
  async findIdsBySpace(spaceId: string): Promise<number[]> {
    const rows = await this.prisma.category.findMany({
      where: { spaceId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** 当該 Space の現在の最大 sortOrder（新規作成の末尾採番に使う / rete-desk-0197）。0 件なら 0。 */
  async maxSortOrder(spaceId: string): Promise<number> {
    const agg = await this.prisma.category.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    return agg._max.sortOrder ?? 0;
  }

  create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  /**
   * 採番（max+1）と create を同一 Serializable tx で行う（cmn-0221 §3）。
   * 採番〜作成の隙間に別プロセスが create しても、Serializable の snapshot 上で同じ max が読まれ、
   * 同じ sortOrder が振られない（番号重複の黙示的発生を封じる）。明示指定があれば採番せず
   * その値を使う（呼び出し元の dto.sortOrder を尊重／既存挙動の維持）。
   *
   * data は sortOrder を除く Prisma.CategoryCreateInput を受け取り、tx 内で確定した sortOrder
   * とマージして create する（sortOrder は tx の snapshot で計算するため外で固定しない）。
   */
  async createWithAutoSortOrder(
    spaceId: string,
    data: Omit<Prisma.CategoryCreateInput, 'sortOrder'>,
    explicitSortOrder?: number,
  ): Promise<Category> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const sortOrder = explicitSortOrder ?? (await this.maxSortOrderInTx(tx, spaceId)) + 1;
      return tx.category.create({ data: { ...data, sortOrder } });
    });
  }

  /**
   * 並び替えを 1 つの interactive Serializable tx で永続化し、反映後の一覧を返す（cmn-0221 §2）。
   * - 現存全件の読み取り・集合検証・更新・再読込をすべて tx 内で行う（並走 add/delete による
   *   TOCTOU を封じる。検証後〜更新前に別操作が割り込んでも同一 snapshot で整合する）。
   * - updateMany を { id, spaceId } スコープで撃つため、別 Space の id が紛れても一致 0 件で無害（IDOR 防止）。
   * - Serializable で直列化し、並行 reorder の lost update（順序混在）を防ぐ。競合 abort（P2034）は
   *   Serializable の仕様上正常に起こり得るため、共通ヘルパが自動リトライする。
   * orderedIds == 現存全件 を満たさなければ更新せず set-mismatch を返す（service が 400 に翻訳）。
   */
  async reorder(spaceId: string, orderedIds: number[]): Promise<ReorderResult> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.category.findMany({
        where: { spaceId },
        select: { id: true },
      });
      // favorites.reorder と同じ二重防御（cmn-0050(C4) 規約合わせ）を validateReorderSet へ共通化（cmn-0151）:
      // 1. 重複 id（例 [10, 10, 20]・現存 {10, 20}）は Set 化で潰れるため size 一致だけでは集合一致と
      //    誤判定する（同一行へ 2 度 write し、末尾側の index+1 が勝って sortOrder が崩れる）。
      //    HTTP 経路は dto の @ArrayUnique が塞ぐが、repository 単体の契約としてここでも長さを突き合わせる。
      // 2. 別 Space の id が混入した場合も size 一致だけでは通過するため、要素単位の所属も確認する。
      const sameSet = validateReorderSet(
        current.map((c) => c.id),
        orderedIds,
      );
      if (!sameSet) {
        return { ok: false, reason: 'set-mismatch' as const };
      }

      // cmn-0050(C4): sortOrder は「リクエスト順での添字（+1）」で確定させ、行更新の発行順は
      // id 昇順に固定する（announcement.reorder / favorites.reorder と同じ規約）。並行 reorder
      // 同士が逆順の id 列で行ロックを取り合うと不要な競合 abort になるため、ロック取得順だけを
      // 一定化する（spaceId スコープは維持）。
      const sortOrderById = new Map(orderedIds.map((id, index) => [id, index + 1]));
      for (const id of [...orderedIds].sort((a, b) => a - b)) {
        await tx.category.updateMany({
          where: { id, spaceId },
          data: { sortOrder: sortOrderById.get(id)! },
        });
      }

      const items = await tx.category.findMany({
        where: { spaceId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      return { ok: true, items };
    });
  }

  update(id: number, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  /** 物理削除。紐づくタスクの有無は Service 層で事前検証する（DB 側も onDelete: Restrict で最終防衛）。 */
  delete(id: number): Promise<Category> {
    return this.prisma.category.delete({ where: { id } });
  }

  /** 分類に紐づくタスク数（削除可否判定 / rete-desk-0140）。 */
  countTasks(categoryId: number): Promise<number> {
    return this.prisma.task.count({ where: { categoryId } });
  }

  /** createWithAutoSortOrder が tx 内で max を引くために使う private helper。tx 外からは maxSortOrder を直接使う。 */
  private async maxSortOrderInTx(tx: Prisma.TransactionClient, spaceId: string): Promise<number> {
    const agg = await tx.category.aggregate({
      where: { spaceId },
      _max: { sortOrder: true },
    });
    return agg._max.sortOrder ?? 0;
  }
}
