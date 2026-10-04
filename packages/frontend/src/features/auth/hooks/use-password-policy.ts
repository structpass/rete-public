'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PASSWORD_POLICY,
  evaluatePasswordPolicy,
  type PasswordPolicyShape,
  type PasswordRuleResult,
} from '@rete/shared';
import { fetchPasswordPolicy } from '@/features/settings/lib/login-settings-api';

/**
 * ポリシー取得失敗／読込中のフォールバック（最小桁数のみ・文字種要求なし）。
 * backend invite.service の effectivePolicy 既定（ポリシー未設定時）と同値に揃える（set-0041）。
 */
const FALLBACK_POLICY: PasswordPolicyShape = DEFAULT_PASSWORD_POLICY;

export interface UsePasswordPolicyResult {
  /** 各ルールの満たし／未満たし（チェックリスト描画用）。 */
  rules: PasswordRuleResult[];
  /** 全ルールを満たすか（送信ボタン disabled 判定用）。 */
  allSatisfied: boolean;
  /** アクティブなポリシーの取得が完了したか（フォールバック中は false）。 */
  policyLoaded: boolean;
}

/**
 * アクティブなパスワードポリシーを取得し、入力中パスワードを評価して返す共通 hook。
 * 取得失敗時は FALLBACK_POLICY（最小桁数のみ）で評価を継続する（チェックリストは非表示にしない）。
 * パスワード設定・変更フォームから共通利用する（招待受諾フォームなど）。
 */
export function usePasswordPolicy(password: string): UsePasswordPolicyResult {
  const [policy, setPolicy] = useState<PasswordPolicyShape | null>(null);

  useEffect(() => {
    let active = true;
    fetchPasswordPolicy()
      .then((p) => {
        if (active) setPolicy(p);
      })
      .catch(() => {
        // 取得失敗時は policy を null のまま据え置き、effective の `?? FALLBACK_POLICY` で
        // 評価を継続する（画面を壊さない）。policyLoaded は false のまま＝アクティブポリシー未取得。
      });
    return () => {
      active = false;
    };
  }, []);

  const effective = policy ?? FALLBACK_POLICY;
  const rules = useMemo(() => evaluatePasswordPolicy(password, effective), [password, effective]);
  const allSatisfied = rules.every((r) => r.satisfied);

  return { rules, allSatisfied, policyLoaded: policy !== null };
}
