/**
 * パスワード強度ポリシーの検証ロジック（SSOT・Settings ST-2-1）。
 *
 * backend（common/security から re-export）と frontend（usePasswordPolicy / PasswordPolicyChecklist）の
 * 双方が本ファイルを single source として import する。フロント・バック二重定義によるポリシードリフトを防ぐ。
 *
 * - validatePassword: 違反メッセージ配列を返す（空 = 合格）。サーバ側 enforce / 既存テストが依存。
 * - evaluatePasswordPolicy: 各ルールの満たし／未満たしを構造化して返す（inline チェックリスト表示用）。
 *
 * 型は login-settings の PasswordPolicyDto から必要フィールドのみ Pick して整合を担保する。
 */

import type { PasswordPolicyDto } from '../types/login-settings';

/** 検証に必要なポリシー値（PasswordPolicyDto から強度判定に使うフィールドのみ抽出）。 */
export type PasswordPolicyShape = Pick<
  PasswordPolicyDto,
  'requireLowercase' | 'requireUppercase' | 'requireNumber' | 'requireSymbol' | 'minLength'
>;

/**
 * パスワードポリシー未設定時の既定値（set-0041）。login-settings.service / invite.service（backend）と
 * use-password-policy（frontend）がそれぞれ同型の既定値を個別管理していたのを本定数へ集約する。
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicyShape = {
  minLength: 8,
  requireLowercase: false,
  requireUppercase: false,
  requireNumber: false,
  requireSymbol: false,
};

/** パスワードがポリシーを満たすか検証し、違反メッセージ配列を返す（空配列 = 合格）。 */
export function validatePassword(password: string, policy: PasswordPolicyShape): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`パスワードは ${policy.minLength} 文字以上にしてください`);
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('小文字英字を 1 文字以上含めてください');
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('大文字英字を 1 文字以上含めてください');
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    errors.push('数字を 1 文字以上含めてください');
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    errors.push('記号を 1 文字以上含めてください');
  }
  return errors;
}

/** チェックリスト 1 行ぶんの評価結果。 */
export interface PasswordRuleResult {
  /** ルール識別子（React key / テスト用）。 */
  id: 'minLength' | 'uppercase' | 'lowercase' | 'number' | 'symbol';
  /** 表示ラベル（例「8文字以上」「大文字を含む」）。 */
  label: string;
  /** 現在のパスワードが当該ルールを満たすか。 */
  satisfied: boolean;
}

/**
 * パスワードをポリシーの各ルールへ分解し、満たし／未満たしを構造化して返す（inline チェックリスト用）。
 * minLength は常に含み、文字種ルールは policy で必須（true）のものだけ含む。
 */
export function evaluatePasswordPolicy(
  password: string,
  policy: PasswordPolicyShape,
): PasswordRuleResult[] {
  const rules: PasswordRuleResult[] = [
    {
      id: 'minLength',
      label: `${policy.minLength}文字以上`,
      satisfied: password.length >= policy.minLength,
    },
  ];
  if (policy.requireUppercase) {
    rules.push({ id: 'uppercase', label: '大文字を含む', satisfied: /[A-Z]/.test(password) });
  }
  if (policy.requireLowercase) {
    rules.push({ id: 'lowercase', label: '小文字を含む', satisfied: /[a-z]/.test(password) });
  }
  if (policy.requireNumber) {
    rules.push({ id: 'number', label: '数字を含む', satisfied: /[0-9]/.test(password) });
  }
  if (policy.requireSymbol) {
    rules.push({ id: 'symbol', label: '記号を含む', satisfied: /[^A-Za-z0-9]/.test(password) });
  }
  return rules;
}
