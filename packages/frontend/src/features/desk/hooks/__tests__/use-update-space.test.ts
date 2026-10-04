import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { SpaceKind, type SpaceDto } from '@rete/shared';

// updateSpace api と toast をモックし「rename は {name} / archive は {archived:true} を投げる /
// 成功で SpaceDto を返し toast.success / 失敗で backend message を toast.error し null を返す」を検証する。
// cmn-0142: vi.hoisted 化
const { mockUpdateSpace, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockUpdateSpace: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ updateSpace: mockUpdateSpace }));
vi.mock('react-hot-toast', () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

import { useUpdateSpace } from '../use-update-space';
import { updateSpace } from '../../lib/api';
import toast from 'react-hot-toast';

const mockUpdate = vi.mocked(updateSpace);
const toastSuccess = vi.mocked(toast.success);
const toastError = vi.mocked(toast.error);

function channel(name: string): SpaceDto {
  return {
    id: 'ch1',
    kind: SpaceKind.CHANNEL,
    projectId: 'p1',
    ownerId: null,
    peerAccountId: null,
    name,
    sortOrder: 0,
    archived: false,
    canManageMembers: false,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('useUpdateSpace', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('renameSpace は {name} で投げ、成功で SpaceDto を返し toast.success する', async () => {
    mockUpdate.mockResolvedValue(channel('改名後'));
    const { result } = renderHook(() => useUpdateSpace());

    let updated: SpaceDto | null = null;
    await act(async () => {
      updated = await result.current.renameSpace('ch1', '改名後');
    });

    expect(mockUpdate).toHaveBeenCalledWith('ch1', { name: '改名後' });
    expect(updated!.name).toBe('改名後');
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('archiveSpace は {archived:true} で投げる（hard delete しない）', async () => {
    mockUpdate.mockResolvedValue({ ...channel('全体共通'), archived: true });
    const { result } = renderHook(() => useUpdateSpace());

    await act(async () => {
      await result.current.archiveSpace('ch1');
    });

    expect(mockUpdate).toHaveBeenCalledWith('ch1', { archived: true });
  });

  it('失敗時は backend の error.message を toast.error し null を返す（403 権限不足含む）', async () => {
    mockUpdate.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: { message: 'このチャネルを編集する権限がありません' } } },
    });
    const { result } = renderHook(() => useUpdateSpace());

    let updated: SpaceDto | null = channel('x');
    await act(async () => {
      updated = await result.current.renameSpace('ch1', 'y');
    });

    expect(updated).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });
});
