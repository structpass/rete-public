'use client';

import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PasswordRuleResult } from '@rete/shared';

interface PasswordPolicyChecklistProps {
  /** usePasswordPolicy が返す各ルールの評価結果。 */
  rules: PasswordRuleResult[];
  className?: string;
}

/**
 * パスワードポリシーの各ルールを ✓/✗ 付きチェックリストで表示する共通コンポーネント。
 * 満たし = アクセントティール + チェック、未満たし = muted + ✗。
 * パスワード設定・変更フォームのパスワード入力直下に自然に配置する想定。
 */
export function PasswordPolicyChecklist({ rules, className }: PasswordPolicyChecklistProps) {
  if (rules.length === 0) return null;
  return (
    <ul className={cn('space-y-1', className)} aria-label="パスワード要件">
      {rules.map((rule) => (
        <li
          key={rule.id}
          data-satisfied={rule.satisfied}
          className={cn(
            'flex items-center gap-1.5 text-xs transition-colors',
            rule.satisfied ? 'text-[var(--sp-accent-teal)]' : 'text-[var(--sp-text-warm-mute)]',
          )}
        >
          {rule.satisfied ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}
