import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ok, okMessage, okPaginated, buildPaginatedMeta } from '../../common/dto';
import { sanitizeRichText } from '../../common/rich-text';
import { AnnouncementRepository } from './repositories/announcement.repository';
import { AttachmentsService } from '../attachments/attachments.service';
import { toAnnouncementSummary, toAnnouncementDetail } from './announcement.mapper';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { FindAnnouncementsDto } from './dto/find-announcements.dto';
import { ReorderAnnouncementsDto } from './dto/reorder-announcements.dto';
import { SetAnnouncementTagsDto } from './dto/set-announcement-tags.dto';

/**
 * 掲示板（通知）のアプリケーションサービス。検証 + オーケストレーションのみを担い、DB アクセスは
 * Repository 経由（§2）、Entity→DTO 変換は mapper（§1）。本文（RTE HTML）は保存前に必ず sanitize
 * する（ADR 0019・多層防御の保存側）。
 *
 * 認可（ADMIN 限定）は controller の Roles ガードで enforce し、本サービスは権限判定を持たない
 * （ガード通過後の業務処理に専念する）。
 *
 * hom-0143: 通知先（targetRoles / targetBusinessRoleIds）の機能ごと撤去に伴い、可視性判定
 * （canView / visibilityWhere）と RolesService 依存（業務ロール id→name 解決）を撤去した。
 * 削除後の通知は全認証ユーザーが全件閲覧できる（絞り込みなし・ADR 0036 superseded）。
 */
@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    private readonly repo: AnnouncementRepository,
    private readonly attachments: AttachmentsService,
  ) {}

  /**
   * 一覧（publishedAt 降順・ページング）。currentUserId があればページ内通知の読了行を一括で引き、
   * 各行の unread を閲覧者視点で算出する（HM-3・ADR 0029）。未ログイン経路は unread 一律 false。
   */
  async findAll(query: FindAnnouncementsDto, currentUserId: string) {
    const { items, total } = await this.repo.findManyAndCount(
      query.page,
      query.limit,
      query.kind ?? 'board',
    );
    const readIds = await this.repo.findReadIds(
      items.map((a) => a.id),
      currentUserId,
    );
    const meta = buildPaginatedMeta(total, query.page, query.limit);
    return okPaginated(
      items.map((a) => toAnnouncementSummary(a, !readIds.has(a.id))),
      meta,
    );
  }

  /**
   * 詳細（本文込み）。不在は NOT_FOUND。currentUserId があれば「開いた = 既読」を副作用で記録する
   * （ADR 0024 / 0029・GET の副作用・冪等 upsert）。既読化の失敗は本筋（200）を 500 に落とさず warn に留める。
   * hom-0143: 可視性判定（canView）撤去 — 全認証ユーザーが全件閲覧できる。
   */
  async findOne(id: string, currentUserId: string) {
    const announcement = await this.repo.findById(id);
    if (!announcement) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }
    // 開いた = 既読（GET 副作用・冪等 upsert）。副作用失敗は本筋（200）に伝搬させず warn に留める。
    try {
      await this.repo.markRead(id, currentUserId);
    } catch (e) {
      this.logger.warn(`markRead failed (announcement=${id}, account=${currentUserId}): ${e}`);
    }
    const attachments = await this.attachments.listDtosForAnnouncement(id);
    return ok(toAnnouncementDetail(announcement, attachments));
  }

  /**
   * 自分の未読通知数（サイドバー「通知管理」バッジ用 / HM-3）。kind でスコープする（hom-0072・
   * hom-0073 design-reviewer REVISE指摘反映＝kind別バッジ独立表示の前提）。
   * hom-0143: 可視性フィルタ撤去 — 「その kind の全通知 − 既読」基準に戻る。
   */
  async countUnread(currentUserId: string, kind: string) {
    return ok({
      count: await this.repo.countUnread(currentUserId, kind),
    });
  }

  /**
   * 新規作成。body は sanitize し、未入力は空文字に正規化する（列は NOT NULL）。
   * position は現在の最小 - 1（通知が無ければ 0）で先頭に積み、新着優先の既定順を保つ（H0021）。
   */
  async create(authorId: string, dto: CreateAnnouncementDto) {
    const kind = dto.kind ?? 'board';
    const min = await this.repo.minPosition(kind);
    const position = min === null ? 0 : min - 1;
    const created = await this.repo.create(authorId, {
      title: dto.title,
      body: sanitizeRichText(dto.body ?? ''),
      position,
      kind,
    });
    return ok(toAnnouncementDetail(created));
  }

  /**
   * 編集（部分更新）。対象不在は NOT_FOUND。body が指定された時のみ sanitize して差し替え、
   * 未指定キーは生やさず部分更新の shape を保つ（既存値を保持）。
   */
  async update(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }
    const updated = await this.repo.update(id, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.body !== undefined && { body: sanitizeRichText(dto.body) }),
    });
    const attachments = await this.attachments.listDtosForAnnouncement(id);
    return ok(toAnnouncementDetail(updated, attachments));
  }

  /** 削除。対象不在は NOT_FOUND。 */
  async remove(id: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Announcement with id ${id} not found`);
    }
    await this.repo.delete(id);
    return okMessage('通知を削除しました');
  }

  /**
   * 通知へファイルを添付する（H0022・ADMIN 限定）。通知存在検証 → 最新版固定は AttachmentsService に委譲。
   * 汎用 attachments controller（feature='file' ゲート）を経由せず本経路（announcement controller の
   * ADMIN ガード下）で行い、非 ADMIN が通知へ添付する bypass を防ぐ。
   */
  async addAttachment(announcementId: string, fileId: string, accountId: string) {
    return this.attachments.createForAnnouncement(announcementId, fileId, accountId);
  }

  /** 通知の添付を解除する（H0022・ADMIN 限定）。当該通知配下の添付でなければ NOT_FOUND。 */
  async removeAttachment(announcementId: string, attachmentId: string) {
    return this.attachments.removeForAnnouncement(announcementId, attachmentId);
  }

  /**
   * お知らせへのタグ付与を全置換する（rete-home-0043・ADMIN 限定）。
   * 対象通知不在 → NOT_FOUND。存在しないタグ ID が含まれる → BAD_REQUEST。
   * 空配列は全解除（タグ存在チェックをスキップ）。反映後の詳細 DTO を返す。
   */
  async setTags(announcementId: string, dto: SetAnnouncementTagsDto) {
    const existing = await this.repo.findById(announcementId);
    if (!existing) {
      throw new NotFoundException(`Announcement with id ${announcementId} not found`);
    }

    // 空配列の場合は全解除（タグ存在チェック不要）。kind でスコープし他 kind のタグ混入を防ぐ（hom-0072）。
    if (dto.tagIds.length > 0) {
      const foundCount = await this.repo.countAnnouncementTagsByIds(dto.tagIds, existing.kind);
      if (foundCount !== dto.tagIds.length) {
        throw new BadRequestException('存在しないお知らせタグ ID が含まれています');
      }
    }

    await this.repo.setTags(announcementId, dto.tagIds);

    // setTags 後に再 fetch して最新状態（tagAssignments include 済）を返す。
    // 並走削除で再 fetch が null になる稀ケースは non-null 断定でクラッシュさせず NOT_FOUND に正規化する。
    const updated = await this.repo.findById(announcementId);
    if (!updated) {
      throw new NotFoundException(`Announcement with id ${announcementId} not found`);
    }
    const attachments = await this.attachments.listDtosForAnnouncement(announcementId);
    return ok(toAnnouncementDetail(updated, attachments));
  }

  /**
   * 並び替え（H0021・ADMIN 限定）。orderedIds が「現存通知全件の id」と過不足・重複なく一致することを
   * トランザクション内で検証してから永続化する（並走 create/delete による検証すり抜けを封じる）。
   * 部分集合だと未指定行の position が据え置かれ並び順が不整合になるため弾く（set-mismatch → 400）。
   * 反映後の一覧を summary（閲覧者視点の unread 込み・findAll と同算出）で返す。
   */
  async reorder(currentUserId: string, dto: ReorderAnnouncementsDto) {
    const result = await this.repo.reorder(dto.orderedIds, dto.kind ?? 'board');
    if (!result.ok) {
      throw new BadRequestException(
        'orderedIds は現在の通知全件の id を過不足なく指定してください',
      );
    }
    const readIds = await this.repo.findReadIds(
      result.items.map((a) => a.id),
      currentUserId,
    );
    return ok(result.items.map((a) => toAnnouncementSummary(a, !readIds.has(a.id))));
  }
}
