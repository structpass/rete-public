import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { AccountResponse } from '@/features/auth/lib/api';
import { useFilesTreeCollapse } from '../use-files-tree-collapse';

// ユーザー（accountId）を差し替え可能にする（各テストで mockUserAccountId.current を上書きする）。
// cmn-0142: vi.hoisted 化（vi.mock ファクトリは hoisted されるため mutable な箱を経由する）
const { mockUserAccountId } = vi.hoisted(() => ({
  mockUserAccountId: { current: 'acc-1' as string | null },
}));

vi.mock('@/features/auth/hooks/use-session', () => ({
  useSession: () => ({
    user: mockUserAccountId.current
      ? ({ id: mockUserAccountId.current, email: '', name: '', role: 'MEMBER' } as AccountResponse)
      : null,
    loading: false,
  }),
}));

// fil-0072/fil-0073 の永続化検証: accountId キーで localStorage に保存され、再マウントで復元、
// 別アカウントではキーが分かれる、存在しない id が混ざっていても無視される。
describe('useFilesTreeCollapse', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUserAccountId.current = 'acc-1';
  });

  it('既定は空集合・hydrated になる', async () => {
    const { result } = renderHook(() => useFilesTreeCollapse());
    // hydrated はマウント後の useEffect 反映まで false → true へ遷移する
    await act(async () => {});
    expect(result.current.collapsedIds.size).toBe(0);
    expect(result.current.hydrated).toBe(true);
  });

  it('toggle で折り畳みがトグルする', async () => {
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => result.current.toggle('f1'));
    expect(result.current.collapsedIds.has('f1')).toBe(true);
    act(() => result.current.toggle('f1'));
    expect(result.current.collapsedIds.has('f1')).toBe(false);
  });

  it('変更が accountId 付きキーの localStorage へ永続化される', async () => {
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => result.current.toggle('f1'));
    act(() => result.current.toggle('f2'));
    const raw = window.localStorage.getItem('files-tree-collapse-v1:acc-1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.collapsed.sort()).toEqual(['f1', 'f2']);
  });

  it('localStorage の保存値をマウント時に復元する', async () => {
    window.localStorage.setItem(
      'files-tree-collapse-v1:acc-1',
      JSON.stringify({ collapsed: ['f1', 'f2'] }),
    );
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    expect(result.current.collapsedIds.has('f1')).toBe(true);
    expect(result.current.collapsedIds.has('f2')).toBe(true);
  });

  it('壊れた JSON でもクラッシュせず既定値（空集合）を使う', async () => {
    window.localStorage.setItem('files-tree-collapse-v1:acc-1', 'not-json{');
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    expect(result.current.collapsedIds.size).toBe(0);
  });

  it('不正な配列要素（数値等）は捨てて文字列だけ復元する', async () => {
    window.localStorage.setItem(
      'files-tree-collapse-v1:acc-1',
      JSON.stringify({ collapsed: ['f1', 42, null, 'f2'] }),
    );
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    expect([...result.current.collapsedIds].sort()).toEqual(['f1', 'f2']);
  });

  it('別ユーザーでログインするとキーが分かれて混ざらない', async () => {
    mockUserAccountId.current = 'acc-A';
    const a = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => a.result.current.toggle('shared'));

    mockUserAccountId.current = 'acc-B';
    const b = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => b.result.current.toggle('private'));

    // A のキーには A だけ、B のキーには B だけが入っている
    const aRaw = JSON.parse(window.localStorage.getItem('files-tree-collapse-v1:acc-A')!);
    const bRaw = JSON.parse(window.localStorage.getItem('files-tree-collapse-v1:acc-B')!);
    expect(aRaw.collapsed).toEqual(['shared']);
    expect(bRaw.collapsed).toEqual(['private']);

    a.unmount();
    b.unmount();
  });

  it('user が null（未ログイン）の時は永続化せず空集合のまま', async () => {
    mockUserAccountId.current = null;
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => result.current.toggle('f1'));
    // どのキーにも書かれない
    const keys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('files-tree-collapse-v1'),
    );
    expect(keys).toEqual([]);
    expect(result.current.collapsedIds.has('f1')).toBe(true);
  });

  it('保存済み id に現在存在しないフォルダが含まれていても正常動作する（fil-0073 criteria）', async () => {
    window.localStorage.setItem(
      'files-tree-collapse-v1:acc-1',
      JSON.stringify({ collapsed: ['deleted-folder', 'f1'] }),
    );
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    // 両方復元される（描画側で存在しない id は isHiddenByCollapse で自然に無視される）
    expect(result.current.collapsedIds.has('deleted-folder')).toBe(true);
    expect(result.current.collapsedIds.has('f1')).toBe(true);
  });

  it('expand で指定 id だけ折り畳みから外す（fil-0074・祖先展開）', async () => {
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => {
      result.current.toggle('a');
      result.current.toggle('b');
      result.current.toggle('c');
    });
    expect([...result.current.collapsedIds].sort()).toEqual(['a', 'b', 'c']);

    act(() => result.current.expand(['a', 'b']));
    // 祖先 a,b のみ展開。対象 c は閉じたまま（criteria: 対象自身は触らない）。
    expect(result.current.collapsedIds.has('a')).toBe(false);
    expect(result.current.collapsedIds.has('b')).toBe(false);
    expect(result.current.collapsedIds.has('c')).toBe(true);
  });

  it('expand は既に開いている id / 空配列で no-op（参照維持）', async () => {
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => result.current.toggle('a'));
    const before = result.current.collapsedIds;

    act(() => result.current.expand(['x', 'y']));
    expect(result.current.collapsedIds).toBe(before);

    act(() => result.current.expand([]));
    expect(result.current.collapsedIds).toBe(before);
  });

  it('expand 後の集合が localStorage へ永続化される（フィルタ解除後も維持・fil-0074）', async () => {
    const { result } = renderHook(() => useFilesTreeCollapse());
    await act(async () => {});
    act(() => {
      result.current.toggle('a');
      result.current.toggle('b');
    });
    act(() => result.current.expand(['a']));
    const raw = window.localStorage.getItem('files-tree-collapse-v1:acc-1');
    expect(JSON.parse(raw!).collapsed).toEqual(['b']);
  });
});
