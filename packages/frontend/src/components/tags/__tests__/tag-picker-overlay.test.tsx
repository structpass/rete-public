import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagPickerOverlay } from '../tag-picker-overlay';

// hom-0106: hom-0102 の Spinner 化 2次指摘（LOW）— tag-master-overlay.test.tsx には
// loading→Spinner のテストがあるが tag-picker-overlay.tsx には対応するテストが無かったため
// 同水準のテストを補う。

describe('TagPickerOverlay — loading 表示（hom-0102・hom-0106）', () => {
  it('読み込み中は共通 Spinner を中央表示する', () => {
    render(
      <TagPickerOverlay
        tags={[]}
        initialSelected={[]}
        loading
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
