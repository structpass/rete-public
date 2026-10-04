import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DeskGroupTreeDto } from '@rete/shared';
import { ok, okMessage } from '../../common/dto';
import { DeskGroupsRepository } from './repositories/desk-groups.repository';
import { SpacesService } from '../spaces/spaces.service';
import { toClassificationDto, toGroupDto } from './desk-groups.mapper';
import { CreateDeskGroupClassificationDto } from './dto/create-classification.dto';
import { UpdateDeskGroupClassificationDto } from './dto/update-classification.dto';
import { ReorderDeskGroupClassificationsDto } from './dto/reorder-classifications.dto';
import { CreateDeskGroupDto } from './dto/create-group.dto';
import { UpdateDeskGroupDto } from './dto/update-group.dto';
import { ReorderDeskGroupsDto } from './dto/reorder-groups.dto';
import { MoveDeskGroupMemberDto } from './dto/move-member.dto';

/**
 * Desk 個人タブの宛先グルーピング（dsk-0304・dsk-0305）のアプリケーションサービス。
 * 認可境界は controller の AuthenticatedGuard（ログイン必須）のみ。個人データのため role は問わず、
 * 全操作を「セッションの accountId」にスコープする（他人のグループ構成には触れない＝FavoritesService と同方針）。
 */
@Injectable()
export class DeskGroupsService {
  constructor(
    private readonly repo: DeskGroupsRepository,
    private readonly spacesService: SpacesService,
  ) {}

  /** グループ分類＋グループ（所属メンバー込み）の一括取得。個人パネルの初期描画に使う。 */
  async findTree(accountId: string) {
    return ok(await this.buildTree(accountId));
  }

  private async buildTree(accountId: string): Promise<DeskGroupTreeDto> {
    const [classifications, groups, members] = await Promise.all([
      this.repo.findClassifications(accountId),
      this.repo.findGroups(accountId),
      this.repo.findMembers(accountId),
    ]);
    const membersByGroup = new Map<string, typeof members>();
    for (const m of members) {
      const list = membersByGroup.get(m.groupId) ?? [];
      list.push(m);
      membersByGroup.set(m.groupId, list);
    }
    return {
      classifications: classifications.map(toClassificationDto),
      groups: groups.map((g) => toGroupDto(g, membersByGroup.get(g.id) ?? [])),
    };
  }

  // ---- グループ分類 ----

  async createClassification(accountId: string, dto: CreateDeskGroupClassificationDto) {
    const name = dto.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('名称を入力してください。');
    }
    const sortOrder = (await this.repo.maxClassificationSortOrder(accountId)) + 1;
    const created = await this.repo.createClassification({ accountId, name, sortOrder });
    return ok(toClassificationDto(created));
  }

  async updateClassification(accountId: string, id: string, dto: UpdateDeskGroupClassificationDto) {
    await this.assertOwnedClassification(accountId, id);
    const name = dto.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('名称を入力してください。');
    }
    const updated = await this.repo.updateClassification(id, name);
    return ok(toClassificationDto(updated));
  }

  /** 物理削除。所属グループが残る場合は DB の onDelete:Restrict → 共通 filter が 409 に畳む（§4）。 */
  async removeClassification(accountId: string, id: string) {
    await this.assertOwnedClassification(accountId, id);
    await this.repo.deleteClassification(id);
    return okMessage('グループ分類を削除しました');
  }

  /**
   * グループ分類の並び替え。orderedIds が「自分の現存グループ分類全件の id」と過不足・重複なく
   * 一致することを Serializable tx 内で検証してから永続化する（repo 層が権威検証を持つ＝
   * FavoritesRepository.reorder と同方針）。
   */
  async reorderClassifications(accountId: string, dto: ReorderDeskGroupClassificationsDto) {
    const result = await this.repo.reorderClassifications(accountId, dto.orderedIds);
    if (!result.ok) {
      throw new BadRequestException(
        '並び替え対象は自分の全グループ分類と完全に一致する必要があります。',
      );
    }
    return ok(await this.buildTree(accountId));
  }

  // ---- グループ ----

  async createGroup(accountId: string, dto: CreateDeskGroupDto) {
    const name = dto.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('名称を入力してください。');
    }
    const classificationId = dto.classificationId ?? null;
    if (classificationId !== null) {
      await this.assertOwnedClassification(accountId, classificationId);
    }
    const sortOrder = (await this.repo.maxGroupSortOrder(accountId, classificationId)) + 1;
    const created = await this.repo.createGroup({ accountId, name, classificationId, sortOrder });
    return ok(toGroupDto(created, []));
  }

  /**
   * 部分更新（名称変更 / グループ分類間の移動＝dsk-0305 の D&D）。classificationId が変わる時は
   * 移動先バケットの末尾（max+1）へ sortOrder を振り直す（元バケットの並びは詰めない＝表示順は
   * gap があっても sortOrder 昇順で描画するため実害なし。Category の並び替えと同方針）。
   */
  async updateGroup(accountId: string, id: string, dto: UpdateDeskGroupDto) {
    await this.assertOwnedGroup(accountId, id);

    const data: { name?: string; classificationId?: string | null; sortOrder?: number } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length === 0) {
        throw new BadRequestException('名称を入力してください。');
      }
      data.name = name;
    }
    if (dto.classificationId !== undefined) {
      if (dto.classificationId !== null) {
        await this.assertOwnedClassification(accountId, dto.classificationId);
      }
      data.classificationId = dto.classificationId;
      data.sortOrder = (await this.repo.maxGroupSortOrder(accountId, dto.classificationId)) + 1;
    }

    const updated = await this.repo.updateGroup(id, data);
    const members = await this.repo.findMembersByGroup(accountId, id);
    return ok(toGroupDto(updated, members));
  }

  /** 物理削除。所属メンバー行は onDelete:Cascade で自動消去（宛先=Space自体は消えず、所属解除のみ）。 */
  async removeGroup(accountId: string, id: string) {
    await this.assertOwnedGroup(accountId, id);
    await this.repo.deleteGroup(id);
    return okMessage('グループを削除しました');
  }

  /**
   * グループの並び替え（同一グループ分類バケット内・dsk-0305）。orderedIds が「当該バケットの
   * 現存グループ全件の id」と過不足・重複なく一致することを Serializable tx 内で検証してから
   * 永続化する（repo 層が権威検証を持つ＝reorderClassifications と同方針）。
   */
  async reorderGroups(accountId: string, dto: ReorderDeskGroupsDto) {
    if (dto.classificationId !== null) {
      await this.assertOwnedClassification(accountId, dto.classificationId);
    }
    const result = await this.repo.reorderGroups(accountId, dto.classificationId, dto.orderedIds);
    if (!result.ok) {
      throw new BadRequestException(
        '並び替え対象は当該グループ分類の全グループと完全に一致する必要があります。',
      );
    }
    return ok(await this.buildTree(accountId));
  }

  // ---- 宛先（メンバー） ----

  /**
   * 宛先のグループ移動＋並び替え（dsk-0304）。groupId=null は所属解除、非 null は当該グループへの
   * 移動（未所属なら新規登録）＋ orderedRefs での表示順確定を1トランザクションで行う。
   *
   * dsk-0330: targetRef（=Space.id）が呼び出しアカウント本人にアクセス可能であること
   * （PERSONAL_MEMO は owner、PERSONAL_DM は owner/peer）を事前に service 層で検証する。
   * dto の長さチェック（@MaxLength(200)）だけでは存在しない / 他人の宛先を送れてしまい、
   * 画面から除去できない孤児行が DB に残存する穴を塞ぐ（dsk-0327 検出の MEDIUM1）。
   */
  async moveMember(accountId: string, dto: MoveDeskGroupMemberDto) {
    await this.assertOwnedTargetRef(accountId, dto.targetRef);

    if (dto.groupId === null) {
      await this.repo.removeMember(accountId, dto.targetRef);
      return ok(await this.buildTree(accountId));
    }

    await this.assertOwnedGroup(accountId, dto.groupId);

    const result = await this.repo.moveMemberAndReorder(
      accountId,
      dto.groupId,
      dto.targetRef,
      dto.orderedRefs,
    );
    if (!result.ok) {
      throw new BadRequestException(
        'orderedRefs は移動先グループの現存メンバー全件（移動対象を含む）の宛先を過不足なく指定してください',
      );
    }
    return ok(await this.buildTree(accountId));
  }

  // ---- 所有権検証（quality-review 2026-07-09 是正: 7箇所の逐語反復を集約） ----

  private async assertOwnedClassification(accountId: string, id: string) {
    const existing = await this.repo.findClassificationById(id);
    if (!existing || existing.accountId !== accountId) {
      throw new NotFoundException('指定されたグループ分類が見つかりません。');
    }
    return existing;
  }

  private async assertOwnedGroup(accountId: string, id: string) {
    const existing = await this.repo.findGroupById(id);
    if (!existing || existing.accountId !== accountId) {
      throw new NotFoundException('指定されたグループが見つかりません。');
    }
    return existing;
  }

  // ---- targetRef 事前検証（dsk-0330） ----

  /**
   * targetRef（=Space.id）の存在＋呼び出しアカウント本人のアクセス可能性を検証する。
   * - 不在 / 他人の所有 / CHANNEL・GROUP（DeskGroup 移動対象外）→ NotFound を投げる。
   * - PERSONAL_MEMO で ownerId === accountId → OK。
   * - PERSONAL_DM で ownerId === accountId OR peerAccountId === accountId → OK（無向）。
   *
   * メッセージは単一文言に統一（dsk-0330 MEDIUM 是正）。存在しない ID と「実在するがアクセス不可」の
   * 区別でレスポンス本文が分かれると、Space id の存在列挙（IDOR 緩和策の部分無効化）に使われうるため。
   * HTTP 層では 404 NotFound で一貫させる。
   */
  private async assertOwnedTargetRef(accountId: string, targetRef: string) {
    const space = await this.spacesService.findById(targetRef);
    if (space && space.kind === 'PERSONAL_MEMO' && space.ownerId === accountId) return;
    if (
      space &&
      space.kind === 'PERSONAL_DM' &&
      (space.ownerId === accountId || space.peerAccountId === accountId)
    ) {
      return;
    }
    throw new NotFoundException('指定された宛先にアクセスできません。');
  }
}
