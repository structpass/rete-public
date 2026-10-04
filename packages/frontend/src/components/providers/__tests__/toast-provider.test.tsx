import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Toaster へ渡す設定の検証。react-hot-toast は layout 直下の Toaster へ portal するため、
 * 実トーストの寿命は単体テストで測れない（消滅はタイマーと requestAnimationFrame に依存する）。
 * ここでは Toaster の props（= 表示時間の配線）を固定し、実挙動は実画面で測る。
 */
const toasterProps = vi.fn();
vi.mock('react-hot-toast', () => ({
  Toaster: (props: unknown) => {
    toasterProps(props);
    return null;
  },
}));

import { ToastProvider } from '../toast-provider';

interface ToasterProps {
  position: string;
  toastOptions: { duration: number; error: { duration: number } };
}

describe('ToastProvider', () => {
  beforeEach(() => {
    toasterProps.mockClear();
  });

  it('エラーのトーストは 15 秒、通常のトーストは 3 秒で消える設定にする', () => {
    render(<ToastProvider />);
    const props = toasterProps.mock.calls[0][0] as ToasterProps;
    expect(props.toastOptions.error.duration).toBe(15000);
    expect(props.toastOptions.duration).toBe(3000);
    // 位置は既存のまま（右上）。
    expect(props.position).toBe('top-right');
  });
});
