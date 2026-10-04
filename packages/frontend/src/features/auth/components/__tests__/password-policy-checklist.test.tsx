import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PasswordRuleResult } from '@rete/shared';
import { PasswordPolicyChecklist } from '../password-policy-checklist';

const rules: PasswordRuleResult[] = [
  { id: 'minLength', label: '8文字以上', satisfied: true },
  { id: 'uppercase', label: '大文字を含む', satisfied: false },
];

describe('PasswordPolicyChecklist', () => {
  it('各ルールのラベルを表示する', () => {
    render(<PasswordPolicyChecklist rules={rules} />);
    expect(screen.getByText('8文字以上')).toBeInTheDocument();
    expect(screen.getByText('大文字を含む')).toBeInTheDocument();
  });

  it('満たし／未満たしを data-satisfied で出し分ける', () => {
    render(<PasswordPolicyChecklist rules={rules} />);
    const items = screen.getByRole('list', { name: 'パスワード要件' }).querySelectorAll('li');
    expect(items[0].getAttribute('data-satisfied')).toBe('true');
    expect(items[1].getAttribute('data-satisfied')).toBe('false');
  });

  it('rules が空なら何も描画しない', () => {
    const { container } = render(<PasswordPolicyChecklist rules={[]} />);
    expect(container.querySelector('ul')).toBeNull();
  });
});
