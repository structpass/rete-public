import type {
  AnnouncementDetailDto,
  AnnouncementSummaryDto,
} from './dto/announcement-response.dto';
import type { AttachmentResponseDto } from '../attachments/dto';
import type { AnnouncementWithAuthor } from './repositories/announcement.repository';
import { toAnnouncementTagDto } from '../announcement-tags/announcement-tags.mapper';
// 抜粋生成はタスク履歴のコメント抜粋（dsk-0269）と共通の common ヘルパへ抽出済み（§3 コピペ禁止）。
import { toExcerpt } from '../../common/rich-text';

/** 一覧概要（excerpt）の最大文字数。超過分は切り詰めて「…」を付す。 */
export const ANNOUNCEMENT_EXCERPT_MAX_LENGTH = 40;

/**
 * tagAssignments（AnnouncementWithAuthor に include 済）を tags[] DTO へ変換する。
 * name 昇順は repository の orderBy で保証されるが、mapper 側でも sort して安定させる（rete-home-0043）。
 * これにより unit test（配列渡し）でも順序が決定的になる。
 */
function toTagDtos(a: AnnouncementWithAuthor) {
  // cmn-0036(A): 4 フィールドのインラインコピーを廃し、マスタ側の正本変換 toAnnouncementTagDto を再利用する
  // （AnnouncementTag の列が増減しても DTO 形状が 1 箇所で決まる）。
  return [...(a.tagAssignments ?? [])]
    .sort((x, y) => (x.tag.name < y.tag.name ? -1 : x.tag.name > y.tag.name ? 1 : 0))
    .map((ata) => toAnnouncementTagDto(ata.tag));
}

/**
 * Announcement Entity → 一覧行 DTO（§1 DTO 境界・純粋関数）。
 * unread は閲覧者視点の未読フラグ（service が読了行の有無から算出して渡す / HM-3・ADR 0029）。
 * 未ログイン経路は既定 false（chat の hasUnread 既定と同方針）。
 * tags は付与されたお知らせ専用タグ（rete-home-0043 / name 昇順で repository 側 orderBy 済み）。
 */
export function toAnnouncementSummary(
  a: AnnouncementWithAuthor,
  unread = false,
): AnnouncementSummaryDto {
  return {
    id: a.id,
    title: a.title,
    publishedAt: a.publishedAt.toISOString(),
    author: a.author.name,
    excerpt: toExcerpt(a.body, ANNOUNCEMENT_EXCERPT_MAX_LENGTH),
    unread,
    tags: toTagDtos(a),
  };
}

/**
 * Announcement Entity → 詳細 DTO（§1 DTO 境界・純粋関数）。本文 body（sanitize 済 HTML）を含む。
 * attachments は AttachmentsService 由来の DTO をそのまま載せる（添付なしは空配列・H0022）。
 * tags は付与されたお知らせ専用タグ（rete-home-0043）。
 * 通知先（targetRoles / targetBusinessRoles）は hom-0143 で機能ごと撤去。
 */
export function toAnnouncementDetail(
  a: AnnouncementWithAuthor,
  attachments: AttachmentResponseDto[] = [],
): AnnouncementDetailDto {
  return {
    id: a.id,
    title: a.title,
    publishedAt: a.publishedAt.toISOString(),
    author: a.author.name,
    body: a.body,
    attachments,
    tags: toTagDtos(a),
  };
}
