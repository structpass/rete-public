import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach } from 'vitest';
import { RichTextEditor } from '../components/rich-text-editor';

afterEach(() => cleanup());

/**
 * jsdom 上で Tiptap エディタがマウントでき、ツールバー（実書式適用）と本文領域が描画されることを確認する。
 * 実際の contenteditable 操作は jsdom で完全再現できないため、書式適用そのものは E2E/手動で確認する。
 */
describe('RichTextEditor', () => {
  it('jsdom 上でエラーなくマウントし、ツールバーと本文領域を描画する', () => {
    render(<RichTextEditor value="<p>hello</p>" onChange={vi.fn()} ariaLabel="説明" />);
    // 実書式適用ツールバー（live）が出る
    expect(screen.getByRole('toolbar', { name: '文字書式' })).toBeTruthy();
    expect(screen.getByLabelText('太字')).toBeTruthy();
    expect(screen.getByLabelText('リンク')).toBeTruthy();
    // 本文領域（contenteditable）
    expect(screen.getByLabelText('説明')).toBeTruthy();
    // 初期値が反映される
    expect(screen.getByLabelText('説明').textContent).toContain('hello');
  });

  it('絵文字/フォントサイズ/表など先送り書式は live ツールバーに出さない（機能の嘘を避ける）', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(screen.queryByLabelText('絵文字')).toBeNull();
    expect(screen.queryByLabelText('フォントサイズ')).toBeNull();
  });

  /**
   * cmn-0354: ツールバーがローカルの useDropdown を保つ理由（＝同時に開く dropdown を 1 つに保つ）を
   * 固定する。共有版 useDropdownPopover は boolean 1 個＝メニューごとに独立して開くため、この契約を
   * 表現できない。将来「共有版へ寄せる」変更が入った時、ここが赤くなって気付ける。
   */
  it('dropdown は同時に 1 つだけ開く（ツールバーがローカル useDropdown を持つ理由）', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor value="" onChange={vi.fn()} ariaLabel="説明" />);

    const hilite = screen.getByLabelText('テキストハイライト');
    const fore = screen.getByLabelText('フォント色');
    const link = screen.getByLabelText('リンク');

    // 初期は全て閉じている
    expect(hilite.getAttribute('aria-expanded')).toBe('false');
    expect(fore.getAttribute('aria-expanded')).toBe('false');

    // 1 つ目を開く
    await user.click(hilite);
    expect(hilite.getAttribute('aria-expanded')).toBe('true');

    // 2 つ目を開くと 1 つ目は閉じる
    await user.click(fore);
    expect(fore.getAttribute('aria-expanded')).toBe('true');
    expect(hilite.getAttribute('aria-expanded')).toBe('false');

    // 別種のポップオーバー（リンク）でも同じ排他が効く
    await user.click(link);
    expect(link.getAttribute('aria-expanded')).toBe('true');
    expect(fore.getAttribute('aria-expanded')).toBe('false');

    // 同じトリガをもう一度押すと閉じる
    await user.click(link);
    expect(link.getAttribute('aria-expanded')).toBe('false');
  });
});
