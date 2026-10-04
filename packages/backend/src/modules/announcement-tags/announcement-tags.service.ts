import { Injectable } from '@nestjs/common';
import { ok } from '../../common/dto';
import { AnnouncementTagsRepository } from './repositories/announcement-tags.repository';
import { toAnnouncementTagDto } from './announcement-tags.mapper';
import { CreateAnnouncementTagDto } from './dto/create-announcement-tag.dto';
import { UpdateAnnouncementTagDto } from './dto/update-announcement-tag.dto';
import { FindAnnouncementTagsDto } from './dto/find-announcement-tags.dto';
import {
  sanitizeTagName,
  assertNoDuplicateName,
  assertNoDuplicateNameForUpdate,
  assertAtLeastOneField,
  assertEntityExists,
  computeArchivedAt,
} from '../../common/tags/tag-master.helpers';

/**
 * お知らせ専用タグマスタのアプリケーションサービス（rete-home-0043）。
 * 検証 + オーケストレーションのみを担い、DB アクセスは AnnouncementTagsRepository 経由（§2）、
 * Entity→DTO 変換は mapper（§1）。
 *
 * 検証ロジック（name 正規化 + 重複検査）は common/tags/tag-master.helpers を共用し、
 * TagsService との逐語コピーを避ける（§3 コピペ回避）。
 *
 * CRUD の認可（ADMIN 限定）は controller の @Roles で enforce し、本 service は権限判定を持たない。
 */
@Injectable()
export class AnnouncementTagsService {
  constructor(private readonly repo: AnnouncementTagsRepository) {}

  /**
   * kind でスコープしたタグ（name 昇順）を返す（hom-0072・掲示板/FAQ独立）。認証のみで全員可。
   * 既定はアーカイブ済を除外、includeArchived=true で全件（タグ管理画面用・hom-0083）。
   */
  async findAll(query: FindAnnouncementTagsDto) {
    const tags = await this.repo.findAll(query.kind ?? 'board', query.includeArchived ?? false);
    return ok(tags.map(toAnnouncementTagDto));
  }

  /**
   * タグを作成する（ADMIN のみ）。name はサニタイズ後に非空・長さを再検証し、
   * 同名衝突は同一 kind 内で app チェック（Conflict）＋ @@unique([kind, name]) backstop（P2002 → 409）。
   */
  async create(dto: CreateAnnouncementTagDto) {
    const kind = dto.kind ?? 'board';
    const name = sanitizeTagName(dto.name);
    const dup = await this.repo.findByName(kind, name);
    assertNoDuplicateName(name, dup);
    const created = await this.repo.create({ kind, name, icon: dto.icon, color: dto.color });
    return ok(toAnnouncementTagDto(created));
  }

  /**
   * タグを部分更新する（ADMIN のみ）。name / icon / color / archived の少なくとも一つが必要。
   * name 指定時はサニタイズ後に自分（現在の kind）以外の同名衝突を弾く（kind は変更不可）。
   * archived は archivedAt へ畳む（Category と同方針）。既にアーカイブ済へ archived:true を
   * 再送しても日時を上書きしない（初回アーカイブ日時を保持）。
   */
  async update(id: string, dto: UpdateAnnouncementTagDto) {
    assertAtLeastOneField(dto, { includeArchived: true });
    const tag = await this.repo.findById(id);
    assertEntityExists(tag, '更新対象のタグ');

    let name: string | undefined;
    if (dto.name !== undefined) {
      name = sanitizeTagName(dto.name);
      const dup = await this.repo.findByName(tag.kind, name);
      assertNoDuplicateNameForUpdate(id, dup);
    }

    // archived → archivedAt の畳み込みは computeArchivedAt（fil-0094 で File タグと共用に抽出・§3）。
    const archivedAt = computeArchivedAt(tag.archivedAt, dto.archived);

    const updated = await this.repo.update(id, {
      name,
      icon: dto.icon,
      color: dto.color,
      archivedAt,
    });
    return ok(toAnnouncementTagDto(updated));
  }

  /** タグを削除する（ADMIN のみ）。付与（AnnouncementTagAssignment）は onDelete:Cascade で連鎖削除される。 */
  async delete(id: string) {
    const tag = await this.repo.findById(id);
    assertEntityExists(tag, '削除対象のタグ');
    await this.repo.delete(id);
    return ok({ id });
  }
}
