import type { MemberDto } from '@rete/shared';
import type { MemberWithRelations } from './repositories/members.repository';

/**
 * Member Entity（select 済 Account）→ MemberDto（§1 DTO 境界・純粋関数）。
 * passwordHash / role 等の機密・内部列は repository の select 段階で既に除外済み（型にも存在しない）。
 */
export function toMemberDto(m: MemberWithRelations): MemberDto {
  return {
    id: m.id,
    name: m.name,
    familyName: m.familyName,
    givenName: m.givenName,
    email: m.email,
    isActive: m.isActive,
    // ロックアウト解除予定（null=なし）。分概算の算出はフロント側（秒精度を晒さない＝管理画面でも分単位表示）。
    lockedUntil: m.lockedUntil ? m.lockedUntil.toISOString() : null,
    // 二段階認証の有効状態（行不在 = 未設定 = false）。secret 等は select 段階で除外済（enabled のみ載る）。
    mfaEnabled: m.mfaSetting?.enabled ?? false,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}
