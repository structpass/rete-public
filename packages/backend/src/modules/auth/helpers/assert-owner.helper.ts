import { ForbiddenException } from '@nestjs/common';
import { Role } from '@rete/shared';

/**
 * 所有者チェック用の最小ユーザー情報（AuthenticatedUser の部分集合）。
 * Service 層から AuthModule に対する依存を最小化するため独立した型として定義する。
 */
export interface OwnerCheckUser {
  id: string;
  role: Role;
}

/**
 * 所有者 enforcement ヘルパ（H4 / ADR 0017・service 層実装）。
 *
 * - ADMIN: 常に許可（管理者は他者リソースを編集・削除できる）。
 * - ownerId === user.id: 所有者本人 → 許可。
 * - ownerId が null または undefined: 既存行のバックフィル未設定 → ADMIN のみ許可（MEMBER は 403）。
 *   undefined は DTO 経由でフィールドが脱落した場合も想定（HIGH-2: 防御強化）。
 * - ownerId !== user.id: 他者のリソース → 403 ForbiddenException。
 *
 * throw のみ担い、成功時は void を返す（§4 エラー一元化: guard は throw するだけ）。
 */
export function assertOwnerOrAdmin(ownerId: string | null | undefined, user: OwnerCheckUser): void {
  if (user.role === Role.ADMIN) return;
  // null と undefined をまとめて「所有者不明」として deny（`== null` は null/undefined 両方を捕捉）。
  if (ownerId != null && ownerId === user.id) return;
  throw new ForbiddenException('この操作を行う権限がありません');
}
