import { Injectable } from '@nestjs/common';
import { ok } from '../../common/dto';
import { TagsRepository } from './repositories/tags.repository';
import { toTagDto } from './tags.mapper';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { FindTagsDto } from './dto/find-tags.dto';
import {
  sanitizeTagName,
  assertNoDuplicateName,
  assertNoDuplicateNameForUpdate,
  assertAtLeastOneField,
  assertEntityExists,
  computeArchivedAt,
} from '../../common/tags/tag-master.helpers';

/**
 * タグマスタのアプリケーションサービス（rete-files-0006）。検証 + オーケストレーションのみを担い、
 * DB アクセスは TagsRepository 経由（§2）、Entity→DTO 変換は mapper（§1）。
 * 付与（FileTag）の読み書きは「ファイル側の関心」のため files モジュールが担当する（本 service はマスタ CRUD のみ）。
 *
 * 検証ロジック（name 正規化 + 重複検査）は common/tags/tag-master.helpers に抽出し、
 * AnnouncementTagsService と共有する（§3 コピペ回避 / rete-home-0043）。
 */
@Injectable()
export class TagsService {
  constructor(private readonly repo: TagsRepository) {}

  /**
   * タグ（name 昇順）を返す。認証のみで全員可。
   * 既定はアーカイブ済を除外、includeArchived=true で全件（タグ管理画面用・fil-0094・hom-0083 の横展開）。
   */
  async findAll(query?: FindTagsDto) {
    const tags = await this.repo.findAll(query?.includeArchived ?? false);
    return ok(tags.map(toTagDto));
  }

  /**
   * タグを作成する。name はサニタイズ（制御文字除去・前後空白詰め）後に非空・長さを再検証し、
   * 同名衝突は app チェック（Conflict）＋ @@unique(name) backstop（P2002 → PrismaExceptionFilter で 409 / §4）。
   */
  async create(dto: CreateTagDto) {
    const name = sanitizeTagName(dto.name);
    const dup = await this.repo.findByName(name);
    assertNoDuplicateName(name, dup);
    const created = await this.repo.create({ name, icon: dto.icon, color: dto.color });
    return ok(toTagDto(created));
  }

  /**
   * タグを部分更新する。name / icon / color / archived の少なくとも一つが必要（すべて未指定は BadRequest）。
   * name 指定時はサニタイズ後に自分以外の同名衝突を弾く。
   * archived は archivedAt へ畳む（fil-0094・hom-0083 と同方針）。既にアーカイブ済へ archived:true を
   * 再送しても日時を上書きしない（computeArchivedAt が undefined を返し更新スキップ）。
   */
  async update(id: string, dto: UpdateTagDto) {
    assertAtLeastOneField(dto, { includeArchived: true });
    const tag = await this.repo.findById(id);
    assertEntityExists(tag, '更新対象のタグ');

    let name: string | undefined;
    if (dto.name !== undefined) {
      name = sanitizeTagName(dto.name);
      const dup = await this.repo.findByName(name);
      assertNoDuplicateNameForUpdate(id, dup);
    }

    // archived → archivedAt の畳み込みは AnnouncementTagsService と共用の computeArchivedAt（§3）。
    const archivedAt = computeArchivedAt(tag.archivedAt, dto.archived);

    const updated = await this.repo.update(id, {
      name,
      icon: dto.icon,
      color: dto.color,
      archivedAt,
    });
    return ok(toTagDto(updated));
  }

  /** タグを削除する。付与（FileTag）は schema の onDelete:Cascade で連鎖削除される。 */
  async delete(id: string) {
    const tag = await this.repo.findById(id);
    assertEntityExists(tag, '削除対象のタグ');
    await this.repo.delete(id);
    return ok({ id });
  }
}
