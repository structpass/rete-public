import { Injectable } from '@nestjs/common';
import { DeskGroup, DeskGroupClassification, DeskGroupMember } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import { validateReorderSet } from '../../../common/database/validate-reorder-set';

export type SetMismatchResult = { ok: true } | { ok: false; reason: 'set-mismatch' };

/**
 * Desk 個人タブの宛先グルーピング（dsk-0304・dsk-0305）のデータアクセス層（§2 Repository 分離）。
 *
 * accountId スコープ方針の整理（dsk-0330 で実態に合わせて是正）：
 * - 「自分のデータ集合を返す / 自分の所有に限定された id で書き換える」系
 *   （findClassifications, findGroups, findMembers, findMembersByGroup,
 *    maxClassificationSortOrder, maxGroupSortOrder,
 *    removeMember, reorderClassifications, reorderGroups, moveMemberAndReorder）
 *   は where: { accountId } で絞り、IDOR 防止を repo 層で担保する。
 * - 「id で 1 件取得して所有検証は service 層へ渡す」系
 *   （findClassificationById, findGroupById）
 *   は accountId フィルタを**付けない**。所有検証（existing.accountId !== accountId → NotFound）
 *   は service 層（DeskGroupsService.updateClassification / removeClassification / updateGroup /
 *   removeGroup / reorderGroups / moveMember）に委譲する。createGroup の classificationId 検証も
 *   service 層。所有検証を repo に閉じ込めると ID 直叩きのバッチ経路で抜けが出るため。
 *
 * 個人データの IDOR 防止は service 層の所有検証を含めて成立する（UserFavorite / Category と同方針）。
 */
@Injectable()
export class DeskGroupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- グループ分類 ----

  findClassifications(accountId: string): Promise<DeskGroupClassification[]> {
    return this.prisma.deskGroupClassification.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findClassificationById(id: string): Promise<DeskGroupClassification | null> {
    return this.prisma.deskGroupClassification.findUnique({ where: { id } });
  }

  async maxClassificationSortOrder(accountId: string): Promise<number> {
    const agg = await this.prisma.deskGroupClassification.aggregate({
      where: { accountId },
      _max: { sortOrder: true },
    });
    return agg._max.sortOrder ?? 0;
  }

  createClassification(data: {
    accountId: string;
    name: string;
    sortOrder: number;
  }): Promise<DeskGroupClassification> {
    return this.prisma.deskGroupClassification.create({ data });
  }

  updateClassification(id: string, name: string): Promise<DeskGroupClassification> {
    return this.prisma.deskGroupClassification.update({ where: { id }, data: { name } });
  }

  /** 物理削除。所属グループが残る場合は DB 側 onDelete:Restrict が P2003 を投げ、共通 filter が 409 に畳む。 */
  deleteClassification(id: string): Promise<DeskGroupClassification> {
    return this.prisma.deskGroupClassification.delete({ where: { id } });
  }

  /**
   * グループ分類の並び替え。Serializable tx 内で「orderedIds == 現存全件」を再検証してから
   * index 順に sortOrder = i（0 始まり）へ一括更新する（FavoritesRepository.reorder と同方針。
   * Service 層の事前検証だけでは並行リクエスト間の TOCTOU race を防げないため tx 内で権威検証する）。
   */
  reorderClassifications(accountId: string, orderedIds: string[]): Promise<SetMismatchResult> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.deskGroupClassification.findMany({
        where: { accountId },
        select: { id: true },
      });
      // 集合検証は validateReorderSet へ共通化（cmn-0151 横展開・cmn-0344）。重複 id を弾く（長さ突き合わせ）。
      const sameSet = validateReorderSet(
        current.map((c) => c.id),
        orderedIds,
      );
      if (!sameSet) {
        return { ok: false, reason: 'set-mismatch' as const };
      }

      for (let index = 0; index < orderedIds.length; index++) {
        await tx.deskGroupClassification.updateMany({
          where: { id: orderedIds[index], accountId },
          data: { sortOrder: index },
        });
      }
      return { ok: true };
    });
  }

  // ---- グループ ----

  findGroups(accountId: string): Promise<DeskGroup[]> {
    return this.prisma.deskGroup.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findGroupById(id: string): Promise<DeskGroup | null> {
    return this.prisma.deskGroup.findUnique({ where: { id } });
  }

  /** 指定グループ分類バケット（null=未分類バケット含む）内の現在の最大 sortOrder。0 件なら -1 を返す。 */
  async maxGroupSortOrder(accountId: string, classificationId: string | null): Promise<number> {
    const agg = await this.prisma.deskGroup.aggregate({
      where: { accountId, classificationId },
      _max: { sortOrder: true },
    });
    return agg._max.sortOrder ?? -1;
  }

  createGroup(data: {
    accountId: string;
    name: string;
    classificationId: string | null;
    sortOrder: number;
  }): Promise<DeskGroup> {
    return this.prisma.deskGroup.create({ data });
  }

  updateGroup(
    id: string,
    data: { name?: string; classificationId?: string | null; sortOrder?: number },
  ): Promise<DeskGroup> {
    return this.prisma.deskGroup.update({ where: { id }, data });
  }

  /** 物理削除。所属メンバー行は onDelete:Cascade で自動消去（宛先=Space自体は消えない。所属解除のみ）。 */
  deleteGroup(id: string): Promise<DeskGroup> {
    return this.prisma.deskGroup.delete({ where: { id } });
  }

  /**
   * グループの並び替え（同一グループ分類バケット内）。Serializable tx 内で「orderedIds == 当該
   * バケットの現存全件」を再検証してから index 順に sortOrder = i へ更新する（reorderClassifications
   * と同方針。TOCTOU race を tx 内の権威検証で塞ぐ）。
   */
  reorderGroups(
    accountId: string,
    classificationId: string | null,
    orderedIds: string[],
  ): Promise<SetMismatchResult> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.deskGroup.findMany({
        where: { accountId, classificationId },
        select: { id: true },
      });
      // 集合検証は validateReorderSet へ共通化（cmn-0151 横展開・cmn-0344）。重複 id を弾く（長さ突き合わせ）。
      const sameSet = validateReorderSet(
        current.map((g) => g.id),
        orderedIds,
      );
      if (!sameSet) {
        return { ok: false, reason: 'set-mismatch' as const };
      }

      for (let index = 0; index < orderedIds.length; index++) {
        await tx.deskGroup.updateMany({
          where: { id: orderedIds[index], accountId },
          data: { sortOrder: index },
        });
      }
      return { ok: true };
    });
  }

  // ---- 宛先（メンバー） ----

  findMembers(accountId: string): Promise<DeskGroupMember[]> {
    return this.prisma.deskGroupMember.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findMembersByGroup(accountId: string, groupId: string): Promise<DeskGroupMember[]> {
    return this.prisma.deskGroupMember.findMany({
      where: { accountId, groupId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** 自分の宛先を1件解除する（グループから外す）。所属していなければ 0 件（冪等）。 */
  async removeMember(accountId: string, targetRef: string): Promise<number> {
    const res = await this.prisma.deskGroupMember.deleteMany({ where: { accountId, targetRef } });
    return res.count;
  }

  /**
   * 宛先を指定グループへ移動（未所属なら新規登録）し、移動先グループの表示順を orderedRefs で
   * 一括確定する。1 トランザクションで実行し、Serializable で並行操作の lost update を防ぐ
   * （FavoritesRepository.reorder と同方針）。orderedRefs が「移動後の移動先グループの現存メンバー
   * 全件（移動対象を含む）の targetRef」と完全一致しなければ set-mismatch を返す。
   * set 検証は移動の write（upsert）より必ず前に行う — write 後に検証して return するとミスマッチ時に
   * write だけが commit されてしまう（Prisma の interactive tx は throw でしかロールバックしない）。
   */
  async moveMemberAndReorder(
    accountId: string,
    groupId: string,
    targetRef: string,
    orderedRefs: string[],
  ): Promise<SetMismatchResult> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.deskGroupMember.findMany({
        where: { accountId, groupId },
        select: { targetRef: true },
      });
      // 集合検証は validateReorderSet へ共通化（cmn-0151 横展開・cmn-0344）。重複 id を弾く（長さ突き合わせ）。
      // 移動対象の仮加算（currentSet.add(targetRef) 相当）は共通関数の外＝呼び出し側に維持する
      // （共通関数は純関数で currentIds をそのまま扱う・cmn-0151 裁定・criteria 5）。
      const currentRefs = current.map((m) => m.targetRef);
      currentRefs.push(targetRef); // 移動後にこのグループへ入る想定で仮加算してから照合する
      const sameSet = validateReorderSet(currentRefs, orderedRefs);
      if (!sameSet) {
        return { ok: false, reason: 'set-mismatch' as const };
      }

      await tx.deskGroupMember.upsert({
        where: { accountId_targetRef: { accountId, targetRef } },
        update: { groupId },
        create: { accountId, groupId, targetRef, sortOrder: 0 },
      });

      for (let index = 0; index < orderedRefs.length; index++) {
        await tx.deskGroupMember.updateMany({
          where: { accountId, groupId, targetRef: orderedRefs[index] },
          data: { sortOrder: index },
        });
      }
      return { ok: true };
    });
  }
}
