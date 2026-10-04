import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ok, okMessage } from '../../common/dto';
import { assertSpaceVisibleOr404, primeVisibleSpaces } from '../../common/visibility';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import { CategoriesRepository } from './repositories/categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { toCategoryResponse } from './categories.mapper';

/**
 * 404 の「対象不在」文言（v2-254）。対象が存在しない時と、存在するが呼び出し元に非可視の時で
 * 同じ文言を返す——という不変条件を 1 箇所で保つため定数にする。非可視側は common/visibility の
 * assertSpaceVisibleOr404 で本定数へ写し替える（片側だけ変えると応答本文が存在の oracle に戻る・
 * 存在秘匿 ADR 0042 / ADR 0038）。
 */
const CATEGORY_NOT_FOUND_MESSAGE = '指定された分類が見つかりません。';

/**
 * 分類マスタのアプリケーションサービス（rete-desk-0140 でマスタ管理 = 更新/アーカイブ/削除を追加）。
 * 認可境界は controller の AuthenticatedGuard（ログイン必須）のみ。チケットの「チャネル管理者ロール」
 * 制限はチャネル概念が未実装のため縮退（グローバル分類・全ログインユーザー編集可）。
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly repo: CategoriesRepository,
    private readonly scopeVisibility: ScopeVisibilityService,
  ) {}

  /**
   * 一覧。分類は Space 単位スコープ（rete-desk-0158）のため spaceId で絞る。
   * 既定はアーカイブ済を除外、includeArchived=true で全件（マスタ管理画面用）。
   *
   * 存在秘匿（ADR 0042）: 可視 Space 集合で repository where を絞る（list=フィルタ方式）。
   * 要求 spaceId が accountId の可視範囲外なら空配列を返し、他 space の分類を露出しない。
   */
  async findAll(spaceId: string, accountId: string, includeArchived = false) {
    const visibleIds = await this.scopeVisibility.resolveVisibleSpaceIds(accountId);
    const categories = await this.repo.findAll(spaceId, includeArchived, visibleIds);
    return ok(categories.map(toCategoryResponse));
  }

  async create(dto: CreateCategoryDto, accountId?: string) {
    // 存在秘匿（ADR 0042・cross-space write IDOR）: 対象 Space が非可視なら 404。
    // accountId 未指定の内部経路は基盤メソッド側でスキップされる。非可視の 404 は分類の不在と
    // 同じ文言へ揃える（common/visibility の写し替え・v2-254）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      dto.spaceId,
      CATEGORY_NOT_FOUND_MESSAGE,
    );

    // 分類は Space スコープ（rete-desk-0158）。space を connect し、同一 Space 内の重複名は
    // @@unique([spaceId, name]) → Prisma P2002 → 共通 PrismaExceptionFilter が 409 に畳む。
    //
    // sortOrder は repository.createWithAutoSortOrder で採番（cmn-0221 §3）。採番（max+1）と
    // create を同一 Serializable tx に閉じ、並行 create で同じ番号が黙って重複する経路を封じる。
    // dto.sortOrder が明示された時は採番せずその値を使う（既存挙動の維持）。
    const category = await this.repo.createWithAutoSortOrder(
      dto.spaceId,
      { name: dto.name, space: { connect: { id: dto.spaceId } } },
      dto.sortOrder,
    );

    return ok(toCategoryResponse(category));
  }

  /**
   * 並び替え（PATCH /categories/reorder / rete-desk-0197・0199）。
   * 集合検証（過不足・重複・別 Space の id 混入）は repository.reorder 内の同一 Serializable tx
   * で行う（cmn-0221 §2）。不一致なら set-mismatch を 400 に翻訳し write は発行しない。
   */
  async reorder(spaceId: string, orderedIds: number[], accountId?: string) {
    // 存在秘匿（ADR 0042）: 対象 Space が非可視なら 404（集合検証より先に弾く）。
    // 文言は分類の不在と同じ（v2-254）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      spaceId,
      CATEGORY_NOT_FOUND_MESSAGE,
    );

    const result = await this.repo.reorder(spaceId, orderedIds);
    if (!result.ok) {
      throw new BadRequestException(
        '並び替え対象は当該チャネルの全分類と完全に一致する必要があります。',
      );
    }

    return ok(result.items.map(toCategoryResponse));
  }

  /**
   * 部分更新（名称 / 表示順 / アーカイブ切替）。archived は archivedAt へ畳む。
   * 既にアーカイブ済へ archived:true を再送しても日時を上書きしない（初回アーカイブ日時を保持）。
   */
  async update(id: number, dto: UpdateCategoryDto, accountId?: string) {
    // v2-259: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（ADR 0042・cross-space write IDOR）: 対象 category の spaceId（直接列）が
    // 非可視なら 404。存在しない id と同じ応答に揃え、他 space の存在を秘匿する。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      existing.spaceId,
      CATEGORY_NOT_FOUND_MESSAGE,
    );

    const data: Prisma.CategoryUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    };
    if (dto.archived !== undefined) {
      const isArchived = existing.archivedAt != null;
      if (dto.archived && !isArchived) data.archivedAt = new Date();
      if (!dto.archived && isArchived) data.archivedAt = null;
    }

    const category = await this.repo.update(id, data);
    return ok(toCategoryResponse(category));
  }

  /**
   * 物理削除。紐づくタスクが 1 件でもあれば 409（アーカイブを案内 / rete-desk-0140）。
   * タスク 0 件のみ削除可能。DB 側も onDelete: Restrict のため競合時は最終的に DB が防衛する。
   */
  async remove(id: number, accountId?: string) {
    // v2-259: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(CATEGORY_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（ADR 0042）: 対象 category の spaceId（直接列）が非可視なら 404。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      existing.spaceId,
      CATEGORY_NOT_FOUND_MESSAGE,
    );

    const taskCount = await this.repo.countTasks(id);
    if (taskCount > 0) {
      throw new ConflictException(
        '紐づくタスクが存在するため削除できません。アーカイブをご利用ください。',
      );
    }

    await this.repo.delete(id);
    return okMessage('Category deleted successfully');
  }
}
