import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionButton, FormButton, FormLabel, ToggleSwitch } from '../primitives';

describe('FormButton', () => {
  it('destructive variant は sp-form-btn-danger クラスで描画される（teal 系でない・set-0144 CSS クラス化）', () => {
    render(<FormButton variant="destructive">削除する</FormButton>);
    const btn = screen.getByRole('button', { name: '削除する' });
    expect(btn.className).toContain('sp-form-btn-danger');
    expect(btn.className).not.toContain('sp-form-btn-primary');
    // 色指定は CSS クラス側へ移設済みのため inline style に色を持たない
    expect(btn.getAttribute('style') ?? '').not.toContain('--sp-accent');
  });

  it('ghost variant は .sp-form-btn 系（sp-form-btn-ghost）で描かれ、.sp-action-btn を直接使わない（v2-224 / ADR 0081）', () => {
    render(<FormButton variant="ghost">キャンセル</FormButton>);
    const btn = screen.getByRole('button', { name: 'キャンセル' });
    expect(btn.className).toBe('sp-form-btn sp-form-btn-ghost');
    expect(btn.className).not.toContain('sp-action-btn');
  });

  it('secondary variant は sp-form-btn-secondary で描かれる（透明系の共通寸法グループ・v2-224）', () => {
    render(<FormButton variant="secondary">再読み込み</FormButton>);
    const btn = screen.getByRole('button', { name: '再読み込み' });
    expect(btn.className).toBe('sp-form-btn sp-form-btn-secondary');
  });

  it('loading 中はスピナーを表示し押下を抑止する', () => {
    const onClick = vi.fn();
    render(
      <FormButton variant="primary" loading onClick={onClick}>
        保存
      </FormButton>,
    );
    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存/ })).toBeDisabled();
  });
});

describe('ActionButton（set-0117 項目2）', () => {
  it('loading 中はスピナーを表示し押下を抑止する', () => {
    const onClick = vi.fn();
    render(
      <ActionButton loading onClick={onClick} ariaLabel="CSV インポート">
        インポート
      </ActionButton>,
    );
    expect(screen.getByRole('status', { name: '読み込み中' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV インポート' })).toBeDisabled();
  });

  it('loading でなければアイコンを出し押下できる', () => {
    const onClick = vi.fn();
    render(
      <ActionButton icon={<svg data-testid="icon" />} onClick={onClick} ariaLabel="CSV インポート">
        インポート
      </ActionButton>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CSV インポート' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('ActionButton iconOnly（set-0153）', () => {
  it('iconOnly=true で children（label）を描画せず icon のみ表示する', () => {
    render(
      <ActionButton icon={<svg data-testid="icon" />} ariaLabel="改名" iconOnly>
        改名
      </ActionButton>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    // label テキストは描画されない（aria-label として属性にのみ残る）。
    expect(screen.queryByText('改名')).not.toBeInTheDocument();
    // ボタンは aria-label 経由で取得できる（a11y 経路が成立している）。
    expect(screen.getByRole('button', { name: '改名' })).toBeInTheDocument();
  });

  it('iconOnly=true で sp-action-btn--icon-only modifier が className に付く', () => {
    render(
      <ActionButton icon={<svg data-testid="icon" />} ariaLabel="アーカイブ" iconOnly>
        アーカイブ
      </ActionButton>,
    );
    const btn = screen.getByRole('button', { name: 'アーカイブ' });
    expect(btn.className).toContain('sp-action-btn');
    expect(btn.className).toContain('sp-action-btn--icon-only');
  });

  it('iconOnly=false（既定）で children を描画する（後方互換）', () => {
    render(
      <ActionButton icon={<svg data-testid="icon" />} ariaLabel="CSV インポート">
        インポート
      </ActionButton>,
    );
    expect(screen.getByText('インポート')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV インポート' })).toBeInTheDocument();
  });

  it('iconOnly=true でも danger は is-danger と modifier 両方を併記する', () => {
    render(
      <ActionButton icon={<svg data-testid="icon" />} ariaLabel="解除" danger iconOnly>
        解除
      </ActionButton>,
    );
    const btn = screen.getByRole('button', { name: '解除' });
    expect(btn.className).toContain('is-danger');
    expect(btn.className).toContain('sp-action-btn--icon-only');
  });
});

describe('ToggleSwitch（set-0117 項目3）', () => {
  it('native button の role=switch で描画され、button 既定の枠線・余白を打ち消す', () => {
    render(<ToggleSwitch checked={false} onChange={vi.fn()} ariaLabel="二段階認証を必須にする" />);
    const sw = screen.getByRole('switch', { name: '二段階認証を必須にする' });
    expect(sw.tagName).toBe('BUTTON');
    expect(sw).toHaveAttribute('type', 'button');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    const style = sw.getAttribute('style') ?? '';
    expect(style).toContain('border: 0');
    expect(style).toContain('padding: 0');
    // 見た目は span 実装と同一（幅・角丸・地色）。
    expect(style).toContain('width: 2.25rem');
    expect(style).toContain('--sp-paper-2');
  });

  it('クリックで onChange(!checked) を呼ぶ', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked onChange={onChange} ariaLabel="通知" />);
    fireEvent.click(screen.getByRole('switch', { name: '通知' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('disabled では押下できず onChange を呼ばない', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="通知" disabled />);
    const sw = screen.getByRole('switch', { name: '通知' });
    expect(sw).toBeDisabled();
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FormLabel', () => {
  it('htmlFor 指定時は <label for> を描画する', () => {
    render(<FormLabel htmlFor="email">メール</FormLabel>);
    const label = screen.getByText('メール');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'email');
  });

  it('htmlFor 無指定時は <span> を描画する', () => {
    render(<FormLabel>状態</FormLabel>);
    expect(screen.getByText('状態').tagName).toBe('SPAN');
  });
});
