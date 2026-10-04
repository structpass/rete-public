/**
 * Category の Response DTO（§1 DTO 境界）。形は `@rete/shared` の CategoryDto を SSOT とし（§5 shared 型整合）、
 * backend ローカルでの再定義をやめてエイリアスで参照する（tasks / files frontend と同一形を共有）。
 * Date 系（createdAt / updatedAt）は mapper で ISO 8601 文字列に変換する。
 * archived は archivedAt 非 null を畳んだ導出フラグ（rete-desk-0140）。生の archivedAt は公開しない。
 */
import type { CategoryDto } from '@rete/shared';

export type CategoryResponseDto = CategoryDto;
