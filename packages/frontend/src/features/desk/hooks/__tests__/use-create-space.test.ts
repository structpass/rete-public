import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SpaceKind, type SpaceDto } from '@rete/shared';

// createSpace api と toast をモックし「kind 別に正しい payload を投げる / 成功で SpaceDto を返す /
// 失敗で backend message を toast し null を返す / submitting がトグルする」を検証する。
// cmn-0142: vi.hoisted 化
const { mockCreateSpace, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockCreateSpace: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({ createSpace: mockCreateSpace }));
vi.mock('react-hot-toast', () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

import { useCreateSpace } from '../use-create-space';
import { createSpace } from '../../lib/api';
import toast from 'react-hot-toast';

const mockCreate = vi.mocked(createSpace);
const toastSuccess = vi.mocked(toast.success);
const toastError = vi.mocked(toast.error);

function space(id: string, kind: SpaceKind): SpaceDto {
  return {
    id,
    kind,
    projectId: null,
    ownerId: null,
    peerAccountId: null,
    name: id,
    sortOrder: 0,
    archived: false,
    canManageMembers: false,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('useCreateSpace', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('createGroup は kind=GROUP + name で投げ、成功で SpaceDto を返し toast.success する', async () => {
    mockCreate.mockResolvedValue(space('g1', SpaceKind.GROUP));
    const { result } = renderHook(() => useCreateSpace());

    let created: SpaceDto | null = null;
    await act(async () => {
      created = await result.current.createGroup('設計チーム');
    });

    expect(mockCreate).toHaveBeenCalledWith({ kind: SpaceKind.GROUP, name: '設計チーム' });
    expect(created!.id).toBe('g1');
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('createDm は kind=PERSONAL_DM + peerAccountId で投げる', async () => {
    mockCreate.mockResolvedValue(space('dm1', SpaceKind.PERSONAL_DM));
    const { result } = renderHook(() => useCreateSpace());

    await act(async () => {
      await result.current.createDm('acc-2');
    });

    expect(mockCreate).toHaveBeenCalledWith({
      kind: SpaceKind.PERSONAL_DM,
      peerAccountId: 'acc-2',
    });
  });

  it('失敗時は backend の error.message を toast.error し null を返す（409 重複 DM 含む）', async () => {
    mockCreate.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: { message: 'この相手との DM は既に存在します' } } },
    });
    const { result } = renderHook(() => useCreateSpace());

    let created: SpaceDto | null = space('x', SpaceKind.PERSONAL_DM);
    await act(async () => {
      created = await result.current.createDm('acc-2');
    });

    expect(created).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });

  it('実行中は submitting=true、完了後 false に戻る', async () => {
    let resolveCreate: (v: SpaceDto) => void = () => {};
    mockCreate.mockImplementation(
      () =>
        new Promise((r) => {
          resolveCreate = r;
        }),
    );
    const { result } = renderHook(() => useCreateSpace());

    let p: Promise<SpaceDto | null>;
    act(() => {
      p = result.current.createGroup('g');
    });
    await waitFor(() => expect(result.current.submitting).toBe(true));

    await act(async () => {
      resolveCreate(space('g1', SpaceKind.GROUP));
      await p;
    });
    expect(result.current.submitting).toBe(false);
  });
});
