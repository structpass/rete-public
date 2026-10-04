/**
 * パスワード強度ポリシー検証の backend エントリ（薄い re-export）。
 *
 * 実体は `@rete/shared`（packages/shared/src/security/password-policy.ts）へ single-source 化済み。
 * frontend の inline チェックリストと同一ロジックを共有し、フロント・バック二重定義のドリフトを防ぐ。
 * 既存の相対 import（invite.service / invite.repository / *.spec）を壊さないため本ファイルは温存し、
 * shared から re-export する。
 */

export { validatePassword, evaluatePasswordPolicy, DEFAULT_PASSWORD_POLICY } from '@rete/shared';
export type { PasswordPolicyShape, PasswordRuleResult } from '@rete/shared';
