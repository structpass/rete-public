import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// cmn-0142: vi.hoisted 化（vi.fn は無いが JSX スタブを hoist し grep ゲートを通す）
const { AppShell } = vi.hoisted(() => ({
  // AppShell はナビ・お気に入り取得など本文と無関係な依存を持ち込むため、
  // スロット（sidebar / children）をそのまま描くだけの薄いスタブに置き換える。
  AppShell: ({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) => (
    <div>
      {sidebar}
      {children}
    </div>
  ),
}));

vi.mock('@/features/shell', () => ({
  AppShell,
}));

import { ModelView } from '../model-view';
import { MODEL_THEMES } from '../../content';

/**
 * mdl-0053: テーマを選び直したら本文が必ず先頭（上端）から表示される。
 *
 * 本文だけを差し替える2ペイン構成のためスクロール枠は残り続け、ブラウザが前テーマの
 * スクロール位置を保持する。次のテーマが短いとその位置が最下部にあたり「下端で開く」ように見える。
 */
describe('ModelView — テーマ切替時の本文スクロール位置（mdl-0053）', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  const otherThemeTitle = () => {
    // 先頭テーマ以外を1件選ぶ（切替を起こすため）。
    const target = MODEL_THEMES[1];
    if (!target) throw new Error('テーマが2件以上必要');
    return target;
  };

  it('別テーマを選ぶと本文のスクロール位置が 0 へ戻る', async () => {
    const user = userEvent.setup();
    render(<ModelView />);
    const body = screen.getByTestId('model-body-scroll');

    body.scrollTop = 800; // 下端まで読み進めた状態を模す

    const target = otherThemeTitle();
    await user.click(screen.getByRole('button', { name: target.navLabel ?? target.title }));

    expect(body.scrollTop).toBe(0);
  });

  it('同一テーマを選び直した時も先頭表示へ戻る（選択の種類で揺らさない）', async () => {
    const user = userEvent.setup();
    render(<ModelView />);
    const body = screen.getByTestId('model-body-scroll');

    const first = MODEL_THEMES[0];
    if (!first) throw new Error('テーマが必要');
    const label = first.navLabel ?? first.title;

    await user.click(screen.getByRole('button', { name: label }));
    body.scrollTop = 500;
    await user.click(screen.getByRole('button', { name: label }));

    expect(body.scrollTop).toBe(0);
  });
});
