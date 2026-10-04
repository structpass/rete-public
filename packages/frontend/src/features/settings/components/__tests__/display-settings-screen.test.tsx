import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { getFormColumn } from '@/test-utils/list-layout';

// 画面が直接 import する API モジュール（../lib/display-preference-api）をモックし、
// 初回ロード（保存済みの縞模様設定の描画）とフォーム幅の枠を検証する。
// 表示設定画面はこれまでコンポーネントテストを持っていなかった（v2-180 で幅の枠を固定するために新設）。
const api = vi.hoisted(() => ({
  fetchDisplayPreference: vi.fn(),
  saveDisplayPreference: vi.fn(),
}));
vi.mock('../../lib/display-preference-api', () => api);

// react-hot-toast は Toaster（layout 直下）へ portal するため単体 render では DOM に出ない。
// rete 既存規約に倣い default export をスパイ化する。
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

import { DisplaySettingsScreen } from '../display-settings-screen';

const PREF = { stripeEnabled: true, stripeColor: '#FAFCFF' };

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchDisplayPreference.mockResolvedValue({ ...PREF });
  api.saveDisplayPreference.mockResolvedValue({ ...PREF });
});

describe('DisplaySettingsScreen 初回ロード', () => {
  it('保存済みの縞模様設定をフォームへ描画する', async () => {
    render(<DisplaySettingsScreen />);
    await waitFor(() => expect(api.fetchDisplayPreference).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('縞模様の色（カラーコード）')).toHaveValue('#FAFCFF');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('フォームカードが内容に合う幅の枠に収まる（v2-180）', async () => {
    render(<DisplaySettingsScreen />);
    await waitFor(() => expect(api.fetchDisplayPreference).toHaveBeenCalledTimes(1));
    // 全幅(1153px)のままだと入力欄と本文が離れて間延びするため、表のある画面と同じ 680px の枠へ入れる。
    expect(getFormColumn(document.body)?.style.maxWidth).toBe('680px');
  });
});
