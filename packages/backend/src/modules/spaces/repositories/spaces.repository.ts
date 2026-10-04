import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import { nextSortOrder } from '../../../common/services/container.helper';

const spaceSelect = {
  id: true,
  kind: true,
  projectId: true,
  ownerId: true,
  peerAccountId: true,
  name: true,
  sortOrder: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** mapper の入力型。 */
export type SpaceRow = Prisma.SpaceGetPayload<{ select: typeof spaceSelect }>;

/**
 * DM 一覧で双方の Account を結合した拡張 row 型（dsk-0325）。
 * - `peer` は peerAccountId 経由の Account 結合で、Space 行の peerAccountId が指す Account を返す。
 *   つまり row.ownerId === viewerId のときは相手側を、row.ownerId !== viewerId のときは
 *   viewer 自身を指す（peerAccountId = viewer）＝**そのまま viewer 視点の「相手」とは限らない**。
 * - viewer 視点で正しい相手名を取るには `owner`（ownerId 経由）も結合し、service 層で
 *   partnerId = row.ownerId === userId ? row.peerAccountId : row.ownerId の判定に応じて
 *   `row.peer` か `row.owner` を pick する必要がある。
 * - peer / owner は理論上 onDelete: Cascade で削除されないため null になるケースは限定的だが、
 *   防御的に null を許容しておく。
 */
export type SpaceDmRow = Prisma.SpaceGetPayload<{
  select: typeof spaceSelect & {
    peer: { select: { id: true; name: true } };
    owner: { select: { id: true; name: true } };
  };
}>;

/**
 * 器（Space）のデータアクセス層（§2 Repository 分離）。
 * GROUP 作成は creator の GROUP ADMIN membership を同一 tx で共創する（ADR 0037 §5）。
 * PERSONAL_DM は無向ペア重複チェック後に作成する（app 層）。
 */
@Injectable()
export class SpacesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- CHANNEL ----

  /** チャネルを作成する。membership 不要（CHANNEL は project membership で可視）。 */
  async createChannel(projectId: string, name: string): Promise<SpaceRow> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const sortOrder = await nextSortOrder(() =>
        tx.space.count({ where: { projectId, kind: 'CHANNEL' } }),
      );
      return tx.space.create({
        data: { kind: 'CHANNEL', projectId, name, sortOrder },
        select: spaceSelect,
      });
    });
  }

  /**
   * プロジェクト配下のチャネル一覧（既定: archived 除外）。
   * includeArchived=true で archived も含む（設定「チャネル管理」モーダルの「アーカイブ済を表示」。
   * 復元導線と対＝archive したチャネルを同モーダルから復元できるようにする）。
   */
  findChannelsByProject(projectId: string, includeArchived = false): Promise<SpaceRow[]> {
    const where: Prisma.SpaceWhereInput = { kind: 'CHANNEL', projectId };
    if (!includeArchived) where.archivedAt = null;
    return this.prisma.space.findMany({
      where,
      select: spaceSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  // ---- GROUP ----

  /** グループと creator の GROUP ADMIN membership を同一 tx で作成する（ADR 0037 §5）。 */
  async createGroupWithMembership(name: string, userId: string): Promise<SpaceRow> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const sortOrder = await nextSortOrder(() => tx.space.count({ where: { kind: 'GROUP' } }));
      const space = await tx.space.create({
        data: { kind: 'GROUP', name, sortOrder },
        select: spaceSelect,
      });
      await tx.membership.create({
        data: { accountId: userId, scopeType: 'GROUP', scopeId: space.id, role: 'ADMIN' },
      });
      return space;
    });
  }

  /**
   * ユーザーが GROUP membership を持つグループ一覧（archived 除外）。
   * Membership は polymorphic FK（scopeId）のため Space に relation が張られていない。
   * 二段クエリ: membership→scopeId 取得 → space.id IN [...] 絞り込み。
   */
  async findGroupsForUser(userId: string): Promise<SpaceRow[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { accountId: userId, scopeType: 'GROUP' },
      select: { scopeId: true },
    });
    const groupIds = memberships.map((m) => m.scopeId);
    if (groupIds.length === 0) return [];
    return this.prisma.space.findMany({
      where: { kind: 'GROUP', id: { in: groupIds }, archivedAt: null },
      select: spaceSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 全 GROUP 一覧（membership 非依存・テナント管理 ADMIN 向け・dsk-0319）。
   * includeArchived=true で archived 含む全件、既定（false/undefined）は archived 除外。
   * 既存 findGroupsForUser の逆で、settings の所属管理画面で「自分が非所属の GROUP にも
   * 自分を追加できる」導線のための口。membership 絞りゼロ。
   */
  findAllGroupsAdmin(includeArchived?: boolean): Promise<SpaceRow[]> {
    return this.prisma.space.findMany({
      where: {
        kind: 'GROUP',
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      select: spaceSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  // ---- PERSONAL_MEMO ----

  createPersonalMemo(userId: string, name: string): Promise<SpaceRow> {
    return this.prisma.space.create({
      data: { kind: 'PERSONAL_MEMO', ownerId: userId, name },
      select: spaceSelect,
    });
  }

  findPersonalMemosForUser(userId: string): Promise<SpaceRow[]> {
    return this.prisma.space.findMany({
      where: { kind: 'PERSONAL_MEMO', ownerId: userId, archivedAt: null },
      select: spaceSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---- PERSONAL_DM ----

  /**
   * 無向ペア重複チェック: {owner, peer} と {peer, owner} 両方を検索する。
   * 既存 DM が在れば返す（ConflictException の判断は service 側）。
   * archived も対象に含める（アーカイブ済み DM ペアの再作成も二重作成として弾く / rete-common-0011）。
   * DB 層では migration `add_space_dm_unique` の部分一意 index が並行 race を最終防壁として担保する。
   */
  findExistingDm(ownerA: string, ownerB: string): Promise<SpaceRow | null> {
    return this.prisma.space.findFirst({
      where: {
        kind: 'PERSONAL_DM',
        OR: [
          { ownerId: ownerA, peerAccountId: ownerB },
          { ownerId: ownerB, peerAccountId: ownerA },
        ],
      },
      select: spaceSelect,
    });
  }

  createPersonalDm(userId: string, peerAccountId: string): Promise<SpaceRow> {
    return this.prisma.space.create({
      data: {
        kind: 'PERSONAL_DM',
        ownerId: userId,
        peerAccountId,
        name: 'DM',
      },
      select: spaceSelect,
    });
  }

  /**
   * DM 一覧を「双方の Account 結合済」で返す（dsk-0325）。
   * - `peer` は peerAccountId 経由、`owner` は ownerId 経由の Account 結合。viewer 視点で
   *   「相手」が ownerId 側か peerAccountId 側かは row.ownerId/peerAccountId と userId の関係
   *   で決まるため、service 層が partnerId を判定して pick する。本メソッドは結合のみ。
   * - リポジトリは DTO / 表示ロジックを持たない。
   */
  findPersonalDmsForUserWithPeer(userId: string): Promise<SpaceDmRow[]> {
    return this.prisma.space.findMany({
      where: {
        kind: 'PERSONAL_DM',
        archivedAt: null,
        OR: [{ ownerId: userId }, { peerAccountId: userId }],
      },
      select: {
        ...spaceSelect,
        peer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---- 共通 ----

  findById(id: string): Promise<SpaceRow | null> {
    return this.prisma.space.findUnique({ where: { id }, select: spaceSelect });
  }

  /**
   * チャネルの物理削除（set-0162）。紐づき検査（archived 含む全物理行: tasks / categories /
   * chatThemes / folders）と削除を同一 tx で行い race を防ぐ。紐づきがあれば削除せず
   * false を返す（service が 409 へ変換）。Folder は onDelete: Restrict のため、検査をすり抜けた
   * 並行挿入は P2003 で落ちる（service が 409 へ変換）。
   */
  async deleteChannelIfNoChildren(id: string): Promise<boolean> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const [taskCount, categoryCount, chatThemeCount, folderCount] = await Promise.all([
        tx.task.count({ where: { spaceId: id } }),
        tx.category.count({ where: { spaceId: id } }),
        tx.chatTheme.count({ where: { spaceId: id } }),
        tx.folder.count({ where: { spaceId: id } }),
      ]);
      if (taskCount + categoryCount + chatThemeCount + folderCount > 0) return false;
      await tx.space.delete({ where: { id } });
      return true;
    });
  }

  update(id: string, data: Prisma.SpaceUpdateInput): Promise<SpaceRow> {
    return this.prisma.space.update({ where: { id }, data, select: spaceSelect });
  }
}
