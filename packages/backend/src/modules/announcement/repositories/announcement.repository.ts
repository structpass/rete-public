import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import { validateReorderSet } from '../../../common/database/validate-reorder-set';

/**
 * reorder の結果。トランザクション内で「orderedIds == 現存全件」を検証し、不一致なら set-mismatch
 * （service が 400 に翻訳）。HTTP 例外を data 層に持ち込まないための型（favorites.ReorderResult と同型）。
 */
export type ReorderResult =
  | { ok: true; items: AnnouncementWithAuthor[] }
  | { ok: false; reason: 'set-mismatch' };

/**
 * 一覧/詳細の表示用 include（投稿者表示名 + お知らせタグ込み）。include 形状の SSOT は本 repository。
 * passwordHash 等の個人情報や authorId 以外の内部列は select しない。
 * tagAssignments は rete-home-0043 で追加（お知らせ専用タグ）。
 */
const announcementInclude = {
  author: { select: { name: true } },
  tagAssignments: {
    include: { tag: true },
    orderBy: { tag: { name: 'asc' } },
  },
} as const;

/** 投稿者表示名 + タグ情報を include した Announcement Entity（mapper の入力型）。 */
export type AnnouncementWithAuthor = Prisma.AnnouncementGetPayload<{
  include: typeof announcementInclude;
}>;

/** 新規通知の永続化データ（authorId は controller が session から渡す・position は service が先頭採番）。 */
export interface CreateAnnouncementData {
  title: string;
  body: string;
  position: number;
  /** 種別（hom-0072）。'board'=掲示板 / 'faq'=FAQ。省略時は呼び出し元（service）が既定'board'を渡す。 */
  kind: string;
}

/** 部分更新データ。未指定（undefined）フィールドは Prisma が更新スキップし既存値を保持する。 */
export interface UpdateAnnouncementData {
  title?: string;
  body?: string;
}

/**
 * 掲示板（通知）のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * Prisma Entity（+ 投稿者名 include）だけを返し、DTO 変換は mapper（§1）に委ねる。
 */
@Injectable()
export class AnnouncementRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 一覧の並び順 SSOT（H0021 手動並び順）: position 昇順、同順位は publishedAt 降順（新着が上）。 */
  private static readonly LIST_ORDER_BY: Prisma.AnnouncementOrderByWithRelationInput[] = [
    { position: 'asc' },
    { publishedAt: 'desc' },
  ];

  /**
   * 一覧（kind スコープ + position 昇順 + publishedAt 降順 tiebreak）+ 総件数を 1 往復で取得する。ページングは skip/take。
   * count と findMany を $transaction で束ね、同時投稿による total と items のズレを避ける。
   * hom-0143: 可視性フィルタ（visibilityWhere）撤去 — 全認証ユーザーが全件閲覧できる。
   */
  async findManyAndCount(
    page: number,
    limit: number,
    kind: string,
  ): Promise<{ items: AnnouncementWithAuthor[]; total: number }> {
    const where = { kind };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        include: announcementInclude,
        orderBy: AnnouncementRepository.LIST_ORDER_BY,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { items, total };
  }

  /** 先頭挿入用の現在最小 position（kind スコープ内・通知が無ければ null）。新規は min - 1 で先頭に積む（新着優先）。 */
  async minPosition(kind: string): Promise<number | null> {
    const agg = await this.prisma.announcement.aggregate({
      where: { kind },
      _min: { position: true },
    });
    return agg._min.position;
  }

  findById(id: string): Promise<AnnouncementWithAuthor | null> {
    return this.prisma.announcement.findUnique({
      where: { id },
      include: announcementInclude,
    });
  }

  create(authorId: string, data: CreateAnnouncementData): Promise<AnnouncementWithAuthor> {
    return this.prisma.announcement.create({
      data: { ...data, authorId },
      include: announcementInclude,
    });
  }

  update(id: string, data: UpdateAnnouncementData): Promise<AnnouncementWithAuthor> {
    return this.prisma.announcement.update({
      where: { id },
      data,
      include: announcementInclude,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.announcement.delete({ where: { id } });
  }

  /**
   * ページ内通知のうち account が既読のもの id 集合（unread 導出用 / HM-3）。
   * currentUserId 無し / ids 空なら空集合。announcementId IN の一括引きで N+1 を避ける（chat 未読集約と同方式）。
   */
  async findReadIds(announcementIds: string[], accountId?: string): Promise<Set<string>> {
    if (!accountId || announcementIds.length === 0) return new Set();
    const rows = await this.prisma.announcementReadState.findMany({
      where: { accountId, announcementId: { in: announcementIds } },
      select: { announcementId: true },
    });
    return new Set(rows.map((r) => r.announcementId));
  }

  /**
   * 通知詳細を開いた時の既読化（HM-3・ADR 0029）。読了時刻を現在時刻へ upsert（冪等・リトライ安全）。
   * GET 詳細取得の副作用として呼ぶ（ADR 0024 と同方式）。
   */
  async markRead(announcementId: string, accountId: string) {
    const now = new Date();
    return this.prisma.announcementReadState.upsert({
      where: { accountId_announcementId: { accountId, announcementId } },
      create: { accountId, announcementId, readAt: now },
      update: { readAt: now },
    });
  }

  /**
   * account の未読総数（サイドバー「通知管理」バッジ用 / HM-3）。
   * = 該当 kind の全通知数 − account が既読にした行数。同時投稿による僅かなズレを避けるため 1 tx で束ねる。
   * hom-0143: 可視性フィルタ撤去 — 全認証ユーザーが全件対象（「その kind の全通知 − 既読」基準）。
   */
  async countUnread(accountId: string, kind: string): Promise<number> {
    const where = { kind };
    const [total, read] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where }),
      this.prisma.announcementReadState.count({ where: { accountId, announcement: where } }),
    ]);
    return Math.max(0, total - read);
  }

  /**
   * お知らせへのタグ付与を全置換する（rete-home-0043）。
   * tx で全削除 → createMany（skipDuplicates）の 2 ステップで冪等に実現する（files.repository.setFileTags と同方針）。
   */
  async setTags(announcementId: string, tagIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.announcementTagAssignment.deleteMany({ where: { announcementId } }),
      ...(tagIds.length > 0
        ? [
            this.prisma.announcementTagAssignment.createMany({
              data: tagIds.map((tagId) => ({ announcementId, tagId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  /**
   * お知らせタグ ID 集合のうち実在する件数を返す（setTags 前の存在検証 / files.repository.countTagsByIds と同方針）。
   * 件数が tagIds.length と一致すれば全件存在確認済み。kind でスコープし、他 kind のタグ ID 混入
   * （例: board announcement へ faq タグを付与）を存在確認の時点で弾く（hom-0072・kind 分離の完全性）。
   */
  async countAnnouncementTagsByIds(tagIds: string[], kind: string): Promise<number> {
    return this.prisma.announcementTag.count({ where: { id: { in: tagIds }, kind } });
  }

  /**
   * 並び替えを 1 つの interactive transaction で永続化し、反映後の一覧を返す（H0021・favorites.reorder と同型）。
   * - 現存「該当 kind 全件」の読み取り・集合検証・更新・再読込をすべて tx 内で行い、並走 create/delete による
   *   TOCTOU を封じる（hom-0072: kind 導入により検証範囲を「全件」から「該当 kind の全件」へ一般化）。
   * - 通知はテナント共通データのため accountId スコープは持たない（kind 内の全件が対象）。
   * - Serializable で直列化し、並行 reorder の lost update（順序混在）を防ぐ。競合 abort（P2034）は自動リトライ。
   * orderedIds == 現存該当kind全件 を満たさなければ更新せず set-mismatch を返す（service が 400 に翻訳）。
   */
  async reorder(orderedIds: string[], kind: string): Promise<ReorderResult> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.announcement.findMany({ where: { kind }, select: { id: true } });
      // 集合検証は validateReorderSet へ共通化（cmn-0151 横展開・cmn-0344）。重複 id は Set 化で潰れる
      // ため size 比較だけでは集合一致と誤判定する（同一行へ 2 度 write する穴）＝長さも突き合わせる。
      const sameSet = validateReorderSet(
        current.map((a) => a.id),
        orderedIds,
      );
      if (!sameSet) {
        return { ok: false, reason: 'set-mismatch' as const };
      }

      // cmn-0050(C4): position は「リクエスト順での添字」で確定させ、行更新の発行順は id 昇順に固定する。
      // categories.reorder と同じ「ロック取得順を一定化」する規約（並行 reorder 同士が逆順で行ロックを
      // 取り合う事による不要な P2034 abort を防ぐ）。set-validation と再読込を同 tx で保つため interactive
      // tx は維持し、その中で発行順だけを id 昇順へ揃える。
      const positionById = new Map(orderedIds.map((id, index) => [id, index]));
      const idsInLockOrder = [...orderedIds].sort();
      for (const id of idsInLockOrder) {
        await tx.announcement.update({
          where: { id },
          data: { position: positionById.get(id)! },
        });
      }

      const items = await tx.announcement.findMany({
        where: { kind },
        include: announcementInclude,
        orderBy: AnnouncementRepository.LIST_ORDER_BY,
      });
      return { ok: true, items };
    });
  }
}
