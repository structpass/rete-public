import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DragOverlayCard } from '../components/drag-overlay-card';

describe('DragOverlayCard', () => {
  it('ドラッグ中テーマのタイトルを表示すること', () => {
    render(
      <DragOverlayCard theme={{ id: 't1', title: 'ドラッグ中のテーマ', description: null }} />,
    );
    expect(screen.getByText('ドラッグ中のテーマ')).toBeInTheDocument();
  });

  it('既定（leftOffsetRem 未指定）は marginLeft を付与しない（昇格プレビューは従来どおり）', () => {
    const { container } = render(
      <DragOverlayCard theme={{ id: 't1', title: 'テーマ', description: null }} />,
    );
    const card = container.querySelector('.desk-chat-card') as HTMLElement;
    expect(card.style.marginLeft).toBe('');
  });

  it('dsk-0236: 移動プレビューは leftOffsetRem 分だけ右へ寄せてシャドウ基準に揃える', () => {
    const { container } = render(
      <DragOverlayCard
        theme={{ id: 'move', title: '移動行', description: null }}
        leftOffsetRem={4.5}
      />,
    );
    const card = container.querySelector('.desk-chat-card') as HTMLElement;
    expect(card.style.marginLeft).toBe('4.5rem');
  });
});
