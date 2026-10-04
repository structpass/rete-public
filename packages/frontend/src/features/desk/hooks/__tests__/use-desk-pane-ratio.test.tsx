import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useDeskPaneRatio,
  DESK_PANE_DEFAULT_RATIO,
  DESK_PANE_RATIO_MIN,
  DESK_PANE_RATIO_MAX,
} from '../use-desk-pane-ratio';
import { fetchDeskPreference, saveDeskPreference } from '../../lib/api';
import toast from 'react-hot-toast';

// cmn-0142: vi.hoisted 化
const { mockFetchDeskPreference, mockSaveDeskPreference, mockToastError, mockToastSuccess } =
  vi.hoisted(() => ({
    mockFetchDeskPreference: vi.fn(),
    mockSaveDeskPreference: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

vi.mock('../../lib/api', () => ({
  fetchDeskPreference: mockFetchDeskPreference,
  saveDeskPreference: mockSaveDeskPreference,
}));
vi.mock('react-hot-toast', () => ({
  default: { error: mockToastError, success: mockToastSuccess },
}));

const mockFetch = vi.mocked(fetchDeskPreference);
const mockSave = vi.mocked(saveDeskPreference);

/** shellRef に幅 1000px / left 0 のダミー要素を張る。 */
function attachShell(result: { current: ReturnType<typeof useDeskPaneRatio> }) {
  const shell = document.createElement('div');
  shell.getBoundingClientRect = () =>
    ({
      left: 0,
      width: 1000,
      top: 0,
      height: 600,
      right: 1000,
      bottom: 600,
      x: 0,
      y: 0,
    }) as DOMRect;
  result.current.shellRef.current = shell;
  return shell;
}

function pointerDown(result: { current: ReturnType<typeof useDeskPaneRatio> }) {
  act(() => {
    result.current.onDividerPointerDown({
      preventDefault: () => {},
    } as unknown as React.PointerEvent<HTMLDivElement>);
  });
}

function pointerMove(clientX: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX }));
  });
}

async function pointerUp() {
  await act(async () => {
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
}

// Desk ペイン幅ドラッグ + 個人設定永続化フック（rete-desk-0142）の検証。
describe('useDeskPaneRatio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(null);
    mockSave.mockResolvedValue({ leftPaneRatio: 0.5 });
  });

  it('未保存（data:null）なら既定比率 0.45 のまま描画する', async () => {
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(result.current.ratio).toBe(DESK_PANE_DEFAULT_RATIO);
    expect(result.current.gridTemplateColumns).toBe('0.45fr 6px 0.55fr');
  });

  it('保存済み設定をマウント時に取得して反映する', async () => {
    mockFetch.mockResolvedValue({ leftPaneRatio: 0.6 });
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(result.current.ratio).toBe(0.6));
    expect(result.current.gridTemplateColumns).toBe('0.6fr 6px 0.4fr');
  });

  it('取得失敗は通知せず既定比率のまま使える（best-effort）', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(result.current.ratio).toBe(DESK_PANE_DEFAULT_RATIO);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('ドラッグで比率が更新され、終了時に PUT で保存する', async () => {
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    attachShell(result);

    pointerDown(result);
    expect(result.current.dragging).toBe(true);

    pointerMove(600); // 600 / 1000 = 0.6
    expect(result.current.ratio).toBe(0.6);

    await pointerUp();
    expect(result.current.dragging).toBe(false);
    expect(mockSave).toHaveBeenCalledWith(0.6);
  });

  it('比率は 0.25〜0.75 にクランプされる', async () => {
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    attachShell(result);

    pointerDown(result);
    pointerMove(50); // 0.05 → clamp 0.25
    expect(result.current.ratio).toBe(DESK_PANE_RATIO_MIN);
    pointerMove(990); // 0.99 → clamp 0.75
    expect(result.current.ratio).toBe(DESK_PANE_RATIO_MAX);
    await pointerUp();
    expect(mockSave).toHaveBeenCalledWith(DESK_PANE_RATIO_MAX);
  });

  it('移動なしのクリックだけでは保存しない', async () => {
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    attachShell(result);

    pointerDown(result);
    await pointerUp();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('保存失敗は toast で通知し、表示比率は維持する', async () => {
    mockSave.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    attachShell(result);

    pointerDown(result);
    pointerMove(300);
    await pointerUp();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('ペイン幅の保存に失敗しました。'));
    expect(result.current.ratio).toBe(0.3);
  });

  it('pointerup 後は pointermove を追従しない（リスナ解除）', async () => {
    const { result } = renderHook(() => useDeskPaneRatio());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    attachShell(result);

    pointerDown(result);
    pointerMove(600);
    await pointerUp();
    pointerMove(300);
    expect(result.current.ratio).toBe(0.6);
  });
});
