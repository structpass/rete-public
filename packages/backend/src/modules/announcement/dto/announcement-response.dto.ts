/**
 * 掲示板（通知）の Response DTO（§1 DTO 境界・cmn-0216 系で集約）。
 *
 * 契約形（shape）は @rete/shared の `types/announcement` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する。呼び出し側（mapper / service / controller / frontend）の import パスは変えず、
 * shared 集約のコストを吸収する（先例 cmn-0015 / cmn-0216 と同方針）。
 *
 * Prisma Announcement を直返しせず本 DTO を経由する。Date 系は mapper で ISO 8601 文字列化し、
 * authorId（内部 FK）ではなく投稿者表示名（author）だけを公開する。
 * お知らせに付与されたタグは announcement-tags マスタ側の `AnnouncementTagDto`（同形の別マスタ・
 * rete-home-0043）を使い、同形状の型を二重定義しない（§5・単一ソース）。
 * 通知先（targetRoles / targetBusinessRoles）は hom-0143 で機能ごと撤去（ADR 0036 superseded）。
 */

export type { AnnouncementSummaryDto, AnnouncementDetailDto } from '@rete/shared';
