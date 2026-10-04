import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeskViewState } from '../hooks/use-desk-view-state';

/**
 * Desk の view 状態機械（モック setLeftView/setRightView の派生モデル移植）。
 * source of truth = selectedThemeId / selectedTaskId / promoteDraft の有無。
 * leftView / rightView / isInputEvacuated はそこから派生する。
 */
function setup(opts?: { hasPromoteDraft?: boolean; cancelPromotion?: () => void }) {
  return renderHook(
    ({ hasPromoteDraft, cancelPromotion }) =>
      useDeskViewState({ hasPromoteDraft, cancelPromotion }),
    {
      initialProps: {
        hasPromoteDraft: opts?.hasPromoteDraft ?? false,
        cancelPromotion: opts?.cancelPromotion ?? (() => {}),
      },
    },
  );
}

describe('useDeskViewState — 初期状態', () => {
  it('左=list / 右=tree、入力欄は退避していない', () => {
    const { result } = setup();
    expect(result.current.leftView).toBe('list');
    expect(result.current.rightView).toBe('tree');
    expect(result.current.isInputEvacuated).toBe(false);
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.selectedTaskId).toBeNull();
  });
});

describe('useDeskViewState — チャット詳細（openThread）', () => {
  it('openThread で 右=thread になり入力欄が退避する', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    expect(result.current.rightView).toBe('thread');
    expect(result.current.selectedThemeId).toBe('theme-1');
    expect(result.current.isInputEvacuated).toBe(true);
  });

  it('同じカードを再クリックすると閉じる（トグル）', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.openThread('theme-1'));
    expect(result.current.rightView).toBe('tree');
    expect(result.current.selectedThemeId).toBeNull();
  });

  it('別カードをクリックすると単一選択で切り替わる', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.openThread('theme-2'));
    expect(result.current.selectedThemeId).toBe('theme-2');
    expect(result.current.rightView).toBe('thread');
  });
});

describe('useDeskViewState — タスク詳細（openTaskDetail）', () => {
  it('openTaskDetail で 左=detail になり入力欄が退避する', () => {
    const { result } = setup();
    act(() => result.current.openTaskDetail(10));
    expect(result.current.leftView).toBe('detail');
    expect(result.current.selectedTaskId).toBe(10);
    expect(result.current.isInputEvacuated).toBe(true);
  });

  it('同じ行を再クリックすると閉じる（トグル）', () => {
    const { result } = setup();
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.openTaskDetail(10));
    expect(result.current.leftView).toBe('list');
    expect(result.current.selectedTaskId).toBeNull();
  });
});

describe('useDeskViewState — 排他（二重オーバーレイ禁止 / モック準拠）', () => {
  it('スレッドを開くと開いていたタスク詳細が閉じる', () => {
    const { result } = setup();
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.openThread('theme-1'));
    expect(result.current.leftView).toBe('list');
    expect(result.current.selectedTaskId).toBeNull();
    expect(result.current.rightView).toBe('thread');
  });

  it('タスク詳細を開くと開いていたスレッドが閉じる', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.openTaskDetail(10));
    expect(result.current.rightView).toBe('tree');
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.leftView).toBe('detail');
  });
});

describe('useDeskViewState — アクティブ枠の保持（lastActiveThemeId/lastActiveTaskId・dsk-0401）', () => {
  it('初期状態では両方 null', () => {
    const { result } = setup();
    expect(result.current.lastActiveThemeId).toBeNull();
    expect(result.current.lastActiveTaskId).toBeNull();
  });

  it('スレッドを閉じても lastActiveThemeId は保持される（selectedThemeId は null に戻る）', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.openThread('theme-1')); // トグル閉じ
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.lastActiveThemeId).toBe('theme-1');
  });

  it('タスク詳細を閉じても lastActiveTaskId は保持される（selectedTaskId は null に戻る）', () => {
    const { result } = setup();
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.openTaskDetail(10)); // トグル閉じ
    expect(result.current.selectedTaskId).toBeNull();
    expect(result.current.lastActiveTaskId).toBe(10);
  });

  it('別のテーマ/タスクを開くと lastActive が新しい方へ移る', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.openThread('theme-2'));
    expect(result.current.lastActiveThemeId).toBe('theme-2');
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.openTaskDetail(20));
    expect(result.current.lastActiveTaskId).toBe(20);
  });

  it('closeAll / closeRight / closeLeft を通っても lastActive は消えない', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.closeRight());
    expect(result.current.lastActiveThemeId).toBe('theme-1');
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.closeLeft());
    expect(result.current.lastActiveTaskId).toBe(10);
    act(() => result.current.openThread('theme-3'));
    act(() => result.current.closeAll());
    expect(result.current.lastActiveThemeId).toBe('theme-3');
  });
});

describe('useDeskViewState — アクティブ枠は単一カーソル（相互排他 + setActive*・dsk-0410）', () => {
  it('setActiveTheme は開かずに lastActiveThemeId だけ動かす（枠のみ追従）', () => {
    const { result } = setup();
    act(() => result.current.setActiveTheme('theme-1'));
    expect(result.current.lastActiveThemeId).toBe('theme-1');
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.rightView).toBe('tree');
  });

  it('setActiveTask は開かずに lastActiveTaskId だけ動かす（枠のみ追従）', () => {
    const { result } = setup();
    act(() => result.current.setActiveTask(10));
    expect(result.current.lastActiveTaskId).toBe(10);
    expect(result.current.selectedTaskId).toBeNull();
    expect(result.current.leftView).toBe('list');
  });

  it('setActiveTask は反対ペインの枠を消す（両ペイン同時に枠を出さない）', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.setActiveTask(10));
    expect(result.current.lastActiveTaskId).toBe(10);
    expect(result.current.lastActiveThemeId).toBeNull();
  });

  it('setActiveTheme は反対ペインの枠を消す（逆方向）', () => {
    const { result } = setup();
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.setActiveTheme('theme-1'));
    expect(result.current.lastActiveThemeId).toBe('theme-1');
    expect(result.current.lastActiveTaskId).toBeNull();
  });

  it('openThread / openTaskDetail でも相互排他（開いた側だけ枠が残る）', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.openTaskDetail(10));
    expect(result.current.lastActiveTaskId).toBe(10);
    expect(result.current.lastActiveThemeId).toBeNull();
    act(() => result.current.openThread('theme-2'));
    expect(result.current.lastActiveThemeId).toBe('theme-2');
    expect(result.current.lastActiveTaskId).toBeNull();
  });
});

describe('useDeskViewState — 昇格フォーム（promote）の統合', () => {
  it('hasPromoteDraft が true のとき 左=promote（detail より優先）', () => {
    const { result } = setup({ hasPromoteDraft: true });
    act(() => result.current.openTaskDetail(10));
    expect(result.current.leftView).toBe('promote');
    expect(result.current.isInputEvacuated).toBe(true);
  });

  it('openThread のトグル「閉じ」では cancelPromotion を呼ばない（開く時だけ畳む）', () => {
    const cancelPromotion = vi.fn();
    const { result } = setup({ hasPromoteDraft: true, cancelPromotion });
    act(() => result.current.openThread('theme-1')); // 開く → 排他で promote を畳む（1 回）
    act(() => result.current.openThread('theme-1')); // 同カード再クリック = 閉じ → 呼ばない
    expect(result.current.selectedThemeId).toBeNull();
    expect(cancelPromotion).toHaveBeenCalledTimes(1);
  });

  it('setThread は promote 中なら cancelPromotion を呼ぶ（二重オーバーレイ禁止）', () => {
    const cancelPromotion = vi.fn();
    const { result } = setup({ hasPromoteDraft: true, cancelPromotion });
    act(() => result.current.setThread('theme-1'));
    expect(result.current.selectedThemeId).toBe('theme-1');
    expect(cancelPromotion).toHaveBeenCalledTimes(1);
  });

  it('promote が立つと開いていたスレッド/タスク詳細を畳む（単一オーバーレイ）', () => {
    const { result, rerender } = renderHook(
      ({ hasPromoteDraft }) => useDeskViewState({ hasPromoteDraft, cancelPromotion: () => {} }),
      { initialProps: { hasPromoteDraft: false } },
    );
    act(() => result.current.openThread('theme-1'));
    expect(result.current.rightView).toBe('thread');
    // D&D ドロップで promoteDraft が立つ → thread/detail は閉じ promote 単独に。
    rerender({ hasPromoteDraft: true });
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.selectedTaskId).toBeNull();
    expect(result.current.rightView).toBe('tree');
    expect(result.current.leftView).toBe('promote');
  });
});

describe('useDeskViewState — closeAll / 入力欄退避条件', () => {
  it('closeAll で全オーバーレイが閉じ、promote 中なら cancelPromotion を呼ぶ', () => {
    const cancelPromotion = vi.fn();
    const { result } = setup({ hasPromoteDraft: true, cancelPromotion });
    act(() => result.current.closeAll());
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.selectedTaskId).toBeNull();
    expect(cancelPromotion).toHaveBeenCalledTimes(1);
  });

  it('入力欄は「左=list ∧ 右≠thread」のときだけ表示（それ以外は退避）', () => {
    const { result } = setup();
    // list + tree → 表示
    expect(result.current.isInputEvacuated).toBe(false);
    // list + thread → 退避
    act(() => result.current.openThread('theme-1'));
    expect(result.current.isInputEvacuated).toBe(true);
    // detail + tree → 退避
    act(() => result.current.openThread('theme-1')); // close thread → tree
    act(() => result.current.openTaskDetail(10));
    expect(result.current.rightView).toBe('tree');
    expect(result.current.isInputEvacuated).toBe(true);
  });
});

describe('useDeskViewState — 編集破棄ガード（guardDiscard / C-編集・DBT-7）', () => {
  function setupGuard(
    guardDiscard: () => boolean,
    hasPromoteDraft = false,
    cancelPromotion = () => {},
  ) {
    return renderHook(() => useDeskViewState({ hasPromoteDraft, cancelPromotion, guardDiscard }));
  }

  it('左オーバーレイ未表示なら guardDiscard を問わずオープン系は通る（誤爆しない）', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    // list 状態からスレッド / タスク詳細を開くのは「破棄」ではないのでガードしない。
    act(() => result.current.openThread('theme-1'));
    expect(result.current.rightView).toBe('thread');
    act(() => result.current.openTaskDetail(10));
    expect(result.current.leftView).toBe('detail');
    expect(guardDiscard).not.toHaveBeenCalled();
  });

  it('編集中(guardDiscard=false)は closeLeft をブロックする', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10)); // 左 detail を開く（list 起点なので通る）
    act(() => result.current.closeLeft());
    expect(result.current.leftView).toBe('detail'); // ブロックされ閉じない
    expect(guardDiscard).toHaveBeenCalled();
  });

  it('編集中(guardDiscard=false)は closeAll をブロックする', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.closeAll());
    expect(result.current.leftView).toBe('detail');
  });

  it('編集中(guardDiscard=false)は別タスク選択（openTaskDetail）をブロックする', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.openTaskDetail(20));
    expect(result.current.selectedTaskId).toBe(10); // 切り替わらない
  });

  it('編集中(guardDiscard=false)はチャット選択（openThread）をブロックする', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.openThread('theme-1'));
    expect(result.current.leftView).toBe('detail');
    expect(result.current.rightView).toBe('tree'); // スレッドは開かない
  });

  it('編集中(guardDiscard=false)は新規登録切替（startCreatingTask）をブロックする', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.startCreatingTask());
    expect(result.current.isCreatingTask).toBe(false);
    expect(result.current.selectedTaskId).toBe(10);
  });

  it('編集中(guardDiscard=false)は元チャットリンク（setThread）をブロックする', () => {
    const guardDiscard = vi.fn(() => false);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.setThread('theme-1'));
    expect(result.current.rightView).toBe('tree');
    expect(result.current.leftView).toBe('detail');
  });

  it('guardDiscard=true なら通常どおり閉じる（OK で破棄）', () => {
    const guardDiscard = vi.fn(() => true);
    const { result } = setupGuard(guardDiscard);
    act(() => result.current.openTaskDetail(10));
    act(() => result.current.closeLeft());
    expect(result.current.leftView).toBe('list');
    expect(guardDiscard).toHaveBeenCalled();
  });
});

describe('useDeskViewState — タスク新規登録モード（startCreatingTask / C-新規）', () => {
  it('startCreatingTask で 左=detail（creating）になり選択タスクは無し・入力欄は退避', () => {
    const { result } = setup();
    act(() => result.current.startCreatingTask());
    expect(result.current.leftView).toBe('detail');
    expect(result.current.isCreatingTask).toBe(true);
    expect(result.current.selectedTaskId).toBeNull();
    expect(result.current.isInputEvacuated).toBe(true);
  });

  it('startCreatingTask は開いていたスレッドを畳む（モック openNewTicket の closeRight 準拠）', () => {
    const { result } = setup();
    act(() => result.current.openThread('theme-1'));
    act(() => result.current.startCreatingTask());
    expect(result.current.rightView).toBe('tree');
    expect(result.current.selectedThemeId).toBeNull();
    expect(result.current.isCreatingTask).toBe(true);
  });

  it('creating 中にタスク詳細を開くと creating は解除される（排他）', () => {
    const { result } = setup();
    act(() => result.current.startCreatingTask());
    act(() => result.current.openTaskDetail(10));
    expect(result.current.isCreatingTask).toBe(false);
    expect(result.current.selectedTaskId).toBe(10);
    expect(result.current.leftView).toBe('detail');
  });

  it('creating 中にスレッドを開くと creating は解除される（左=list へ戻る）', () => {
    const { result } = setup();
    act(() => result.current.startCreatingTask());
    act(() => result.current.openThread('theme-1'));
    expect(result.current.isCreatingTask).toBe(false);
    expect(result.current.leftView).toBe('list');
    expect(result.current.rightView).toBe('thread');
  });

  it('closeLeft で creating を抜けて list に戻る', () => {
    const { result } = setup();
    act(() => result.current.startCreatingTask());
    act(() => result.current.closeLeft());
    expect(result.current.isCreatingTask).toBe(false);
    expect(result.current.leftView).toBe('list');
  });

  it('closeAll で creating を抜ける', () => {
    const { result } = setup();
    act(() => result.current.startCreatingTask());
    act(() => result.current.closeAll());
    expect(result.current.isCreatingTask).toBe(false);
    expect(result.current.leftView).toBe('list');
  });

  it('promoteDraft が立つと creating は畳まれ promote 優先になる（単一オーバーレイ）', () => {
    const { result, rerender } = renderHook(
      ({ hasPromoteDraft }) => useDeskViewState({ hasPromoteDraft, cancelPromotion: () => {} }),
      { initialProps: { hasPromoteDraft: false } },
    );
    act(() => result.current.startCreatingTask());
    expect(result.current.isCreatingTask).toBe(true);
    rerender({ hasPromoteDraft: true });
    expect(result.current.isCreatingTask).toBe(false);
    expect(result.current.leftView).toBe('promote');
  });
});
