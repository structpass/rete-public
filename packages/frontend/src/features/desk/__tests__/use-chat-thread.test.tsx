import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ChatThemeStatus } from '@rete/shared';
import type { ChatMessage, ChatThemeDetail, ReactionToggleResult } from '../lib/api';

// api / flush をモックし、mutation 後の再取得で loading を立てない挙動（画面の揺れ防止）を検証する。
// cmn-0142: vi.hoisted 化
const {
  mockFetchChatThemeDetail,
  mockPostChatMessage,
  mockUpdateChatTheme,
  mockDeleteChatTheme,
  mockDeleteChatMessage,
  mockToggleMessageReaction,
  mockToggleThemeReaction,
  mockFlushFileIds,
} = vi.hoisted(() => ({
  mockFetchChatThemeDetail: vi.fn(),
  mockPostChatMessage: vi.fn(),
  mockUpdateChatTheme: vi.fn(),
  mockDeleteChatTheme: vi.fn(),
  mockDeleteChatMessage: vi.fn(),
  mockToggleMessageReaction: vi.fn(),
  mockToggleThemeReaction: vi.fn(),
  mockFlushFileIds: vi.fn(),
}));

vi.mock('../lib/api', async (orig) => {
  const actual = await orig<typeof import('../lib/api')>();
  return {
    ...actual,
    fetchChatThemeDetail: mockFetchChatThemeDetail,
    postChatMessage: mockPostChatMessage,
    updateChatTheme: mockUpdateChatTheme,
    deleteChatTheme: mockDeleteChatTheme,
    deleteChatMessage: mockDeleteChatMessage,
    toggleMessageReaction: mockToggleMessageReaction,
    toggleThemeReaction: mockToggleThemeReaction,
  };
});
vi.mock('../lib/flush-file-ids', () => ({ flushFileIds: mockFlushFileIds }));

import { useChatThread, resetChatThreadCache } from '../hooks/use-chat-thread';
import {
  fetchChatThemeDetail,
  toggleThemeReaction,
  toggleMessageReaction,
  postChatMessage,
  deleteChatTheme,
  deleteChatMessage,
} from '../lib/api';

const mockDetail = vi.mocked(fetchChatThemeDetail);
const mockToggle = vi.mocked(toggleThemeReaction);
const mockPost = vi.mocked(postChatMessage);
const mockDelete = vi.mocked(deleteChatTheme);
const mockDeleteMessage = vi.mocked(deleteChatMessage);
const mockToggleMessage = vi.mocked(toggleMessageReaction);

function detail(id: string): ChatThemeDetail {
  return {
    id,
    title: 'テーマ',
    description: '<p>本文</p>',
    tenmatsu: null,
    status: ChatThemeStatus.OPEN,
    archived: false,
    author: { id: 'u1', name: '佐久間' },
    reactions: [],
    attachments: [],
    messages: [],
    lastMessageAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

/**
 * トグル API（toggleThemeReaction / toggleMessageReaction）の応答。形の正本は desk api の
 * ReactionToggleResult（@rete/shared の ReactionToggleResponseDto）で、値の生成をここ 1 箇所へ
 * 集約する（v2-252。旧実装は resolver の型注釈と envelope 無しのモックが実装と食い違っていた）。
 */
function reactionToggle(reacted: boolean): ReactionToggleResult {
  return { reacted };
}

/**
 * 発話投稿（postChatMessage）の応答。形の正本は desk api の ChatMessage
 * （@rete/shared の ChatMessageResponseDto）で、値の生成をここ 1 箇所へ集約する（v2-252）。
 */
function message(id: string): ChatMessage {
  return {
    id,
    themeId: 't1',
    body: '本文',
    author: { id: 'u1', name: '佐久間' },
    createdAt: '2026-06-01T00:00:00.000Z',
    reactions: [],
    attachments: [],
    mentions: [],
  };
}

beforeEach(() => {
  // スレッドキャッシュ（dsk-0393）はモジュールスコープのためテスト間で持ち越さない。
  resetChatThreadCache();
  mockDetail.mockReset();
  mockToggle.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
  mockDeleteMessage.mockReset();
  mockToggleMessage.mockReset();
});

describe('useChatThread — mutation 再取得で loading を立てない（rete-desk-0082/0093）', () => {
  it('初回ロードは blocking（loading=true→false）でテーマを取得する', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));
    expect(result.current.loading).toBe(false);
    expect(mockDetail).toHaveBeenCalledTimes(1);
  });

  it('同一テーマの mutation 再取得（リアクション）では loading を立てず既存表示を保つ', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    mockToggle.mockResolvedValue(reactionToggle(true));
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    // 2 回目の取得は解決を保留し、保留中に loading が立たないことを確認する。
    let resolve!: (d: ChatThemeDetail) => void;
    mockDetail.mockReturnValueOnce(new Promise<ChatThemeDetail>((r) => (resolve = r)));

    await act(async () => {
      void result.current.toggleThemeReaction('👍');
      await Promise.resolve();
    });
    // 再取得が pending の間も loading は false のまま（spinner へ差し替わらない＝画面が揺れない）。
    expect(result.current.loading).toBe(false);
    expect(result.current.theme?.id).toBe('t1');

    await act(async () => {
      resolve(detail('t1'));
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
  });

  it('別テーマへ切り替えると再び blocking ローディングになる', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    let resolve!: (d: ChatThemeDetail) => void;
    mockDetail.mockReturnValueOnce(new Promise<ChatThemeDetail>((r) => (resolve = r)));
    rerender({ id: 't2' });
    // 別テーマ id への切替は保持テーマ(t1)と不一致 → blocking ローディングへ。
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      resolve(detail('t2'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));
    expect(result.current.loading).toBe(false);
  });
});

describe('useChatThread — 開き直しの短時間キャッシュ（dsk-0393）', () => {
  it('TTL 内に同一テーマを開き直しても GET を追加で打たない（throttle 回避）', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const first = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(first.result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(1);
    first.unmount(); // 詳細を閉じる

    // 開き直し（新しいフックインスタンス）はキャッシュから即復元し、ネットワークを打たない。
    const second = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(second.result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(1);
  });

  it('鮮度キー（一覧の lastMessageAt）が変わっていれば TTL 内でも取り直す（他者の新着）', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const first = renderHook(() => useChatThread('t1', '2026-06-01T00:00:00.000Z'));
    await waitFor(() => expect(first.result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(1);
    first.unmount();

    // 新着で一覧の lastMessageAt が進んだ状態で開き直す → キャッシュを使わない。
    const second = renderHook(() => useChatThread('t1', '2026-06-02T00:00:00.000Z'));
    await waitFor(() => expect(second.result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(2);
  });

  it('refetch はキャッシュを迂回して必ずサーバーから取り直す', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });
    expect(mockDetail).toHaveBeenCalledTimes(2);
  });

  it('mutation（発話投稿）後の再取得もキャッシュを迂回する', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    mockPost.mockResolvedValue(message('m1'));
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    await act(async () => {
      await result.current.postMessage('本文');
    });
    expect(mockDetail).toHaveBeenCalledTimes(2);
  });

  it('resetChatThreadCache 後の開き直しはサーバーから取り直す（ログアウト時の漏えい防止）', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const first = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(first.result.current.theme?.id).toBe('t1'));
    first.unmount();

    act(() => resetChatThreadCache());
    const second = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(second.result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(2);
  });
});

describe('useChatThread — 追い越しレース（dsk-0394）', () => {
  /** 解決を手動制御できる pending promise を作る（GET の並走を再現するため）。 */
  function deferred() {
    let resolve!: (d: ChatThemeDetail) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<ChatThemeDetail>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('先発（旧テーマ）の応答が後着しても、選択中の新テーマの表示を上書きしない', async () => {
    const a = deferred();
    const b = deferred();
    mockDetail.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    // t1 の GET が未解決のまま ↑↓ で t2 へ移動（GET が並走する）。
    rerender({ id: 't2' });

    await act(async () => {
      b.resolve(detail('t2'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));

    // 追い越された t1 の応答が後から届いても表示は t2 のまま。
    await act(async () => {
      a.resolve(detail('t1'));
      await Promise.resolve();
    });
    expect(result.current.theme?.id).toBe('t2');
    expect(result.current.loading).toBe(false);
  });

  it('追い越された応答は後発の loading を降ろさない（spinner の横取り防止）', async () => {
    const a = deferred();
    const b = deferred();
    mockDetail.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    rerender({ id: 't2' });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 先発（t1）が先に解決しても、後発（t2）の取得中なので loading は立ったまま。
    await act(async () => {
      a.resolve(detail('t1'));
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.theme?.id).toBeUndefined();

    await act(async () => {
      b.resolve(detail('t2'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));
    expect(result.current.loading).toBe(false);
  });

  it('進行中の切替をキャッシュヒットで追い越しても spinner が残らない（dsk-0393 との相互作用）', async () => {
    // 先に t2 をキャッシュへ載せておく（TTL 内）。
    mockDetail.mockResolvedValueOnce(detail('t2'));
    const primed = renderHook(() => useChatThread('t2'));
    await waitFor(() => expect(primed.result.current.theme?.id).toBe('t2'));
    primed.unmount();

    // t1 の GET が未解決のまま t2（キャッシュ済み）へ切り替える。
    const a = deferred();
    mockDetail.mockReturnValueOnce(a.promise);
    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    rerender({ id: 't2' });

    // キャッシュヒットは同期で表示できるので、ネットワークを待たず loading を降ろす。
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));
    expect(result.current.loading).toBe(false);

    // 追い越された t1 の応答が後着しても spinner は戻らない。
    await act(async () => {
      a.resolve(detail('t1'));
      await Promise.resolve();
    });
    expect(result.current.theme?.id).toBe('t2');
    expect(result.current.loading).toBe(false);
  });

  it('取得中にスレッドを閉じても（themeId=null）spinner が残らない', async () => {
    const a = deferred();
    mockDetail.mockReturnValueOnce(a.promise);
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useChatThread(id), {
      initialProps: { id: 't1' as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    // 取得完了前に閉じる。以降 t1 の応答は seq 不一致で finally をスキップするため、
    // 閉じる側が loading を降ろさないと spinner が残り続ける。
    rerender({ id: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.theme).toBeNull();

    await act(async () => {
      a.resolve(detail('t1'));
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.theme).toBeNull();
  });

  it('追い越された応答の失敗はエラー表示にしない（新テーマは正常取得できている）', async () => {
    const a = deferred();
    const b = deferred();
    mockDetail.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    rerender({ id: 't2' });

    await act(async () => {
      a.reject(new Error('stale'));
      await Promise.resolve();
    });
    await act(async () => {
      b.resolve(detail('t2'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));
    expect(result.current.error).toBeNull();
  });
});

describe('useChatThread — テーマ削除（rete-desk-0095）', () => {
  it('deleteTheme は DELETE を呼ぶだけで再取得しない（消えたテーマの GET 404 を避ける）', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    mockDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.deleteTheme();
    });
    expect(mockDelete).toHaveBeenCalledWith('t1');
    // 削除後に load()（fetchChatThemeDetail）を追加で呼ばない。
    expect(mockDetail).toHaveBeenCalledTimes(1);
  });
});

describe('useChatThread — 発話削除（dsk-0316）', () => {
  it('deleteMessage は DELETE 後にスレッドを再取得する（テーマ本体は残るため）', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    mockDeleteMessage.mockResolvedValue(undefined);
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));
    expect(mockDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.deleteMessage('m1');
    });
    expect(mockDeleteMessage).toHaveBeenCalledWith('m1');
    // deleteTheme と異なり、削除後に再取得して一覧から消えた発話を反映する。
    expect(mockDetail).toHaveBeenCalledTimes(2);
  });
});

describe('useChatThread — 切替後の再入ガード（dsk-0399）', () => {
  // use-task-detail.toggleReaction（dsk-0397）と同型のガードを load 後続ハンドラへ移植した検証。
  // mutation の解決前にテーマが切り替わっていた場合、mutation 完了後の再取得自体を行わないため
  // 切替先（新テーマ）の表示が旧テーマの再取得で上書きされない。

  it('リアクショントグル中にテーマが切り替わると、旧テーマの再取得で新テーマの表示を上書きしない', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    // トグル API の解決前に別テーマへ切り替える。
    let resolveToggle!: (v: ReactionToggleResult) => void;
    mockToggle.mockReturnValueOnce(
      new Promise<ReactionToggleResult>((res) => {
        resolveToggle = res;
      }),
    );

    let togglePromise!: Promise<void>;
    await act(async () => {
      togglePromise = result.current.toggleThemeReaction('👍');
      await Promise.resolve();
    });

    mockDetail.mockResolvedValue(detail('t2'));
    rerender({ id: 't2' });
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));

    const fetchCallsBefore = mockDetail.mock.calls.length;
    await act(async () => {
      resolveToggle(reactionToggle(true));
      await togglePromise;
    });

    // 切替済みなので旧テーマの再取得自体を行わない＝表示は t2 のまま。
    expect(mockDetail.mock.calls.length).toBe(fetchCallsBefore);
    expect(result.current.theme?.id).toBe('t2');
  });

  it('発話投稿中にテーマが切り替わると、旧テーマの再取得で新テーマの表示を上書きしない', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result, rerender } = renderHook(({ id }) => useChatThread(id), {
      initialProps: { id: 't1' },
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    // postChatMessage の解決前に別テーマへ切り替える。
    let resolvePost!: (v: ChatMessage) => void;
    mockPost.mockReturnValueOnce(
      new Promise<ChatMessage>((res) => {
        resolvePost = res;
      }),
    );

    let postPromise!: Promise<void>;
    await act(async () => {
      postPromise = result.current.postMessage('本文');
      await Promise.resolve();
    });

    mockDetail.mockResolvedValue(detail('t2'));
    rerender({ id: 't2' });
    await waitFor(() => expect(result.current.theme?.id).toBe('t2'));

    const fetchCallsBefore = mockDetail.mock.calls.length;
    await act(async () => {
      resolvePost(message('m1'));
      await postPromise;
    });

    expect(mockDetail.mock.calls.length).toBe(fetchCallsBefore);
    expect(result.current.theme?.id).toBe('t2');
  });
});

describe('useChatThread — 同一テーマ内の並走 mutation（dsk-0404）', () => {
  // dsk-0399 の再入ガードは切替検出に requestSeqRef（load の GET 連番）を兼用していたため、
  // 複数 ReactionBar が同一テーマで並走 mutation すると、先着の load() が連番を進めて後着の
  // 再取得が偽陽性で黙って落ちた（退行: 次回手動 refetch までリアクションが stale）。
  // 修正は各 mutation が起点 themeId（activeThemeIdRef）との比較で判定し、requestSeqRef は
  // load 内部の追い越し破棄専用へ戻る。同テーマ並走では偽陽性ゼロ、切替/閉鎖時は再取得しない。

  it('別メッセージのリアクション並走トグル — 後着の再取得が落ちず最後の GET が反映される', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    // 2 つのトグルを未解決のまま並走開始。先着の再取得が後着の再取得を捨ててはいけない。
    let resolveA!: (v: ReactionToggleResult) => void;
    let resolveB!: (v: ReactionToggleResult) => void;
    mockToggleMessage
      .mockReturnValueOnce(
        new Promise<ReactionToggleResult>((r) => {
          resolveA = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise<ReactionToggleResult>((r) => {
          resolveB = r;
        }),
      );
    // 2 回の再取得 GET を区別: 最後の GET（B 側）の結果が勝つ。
    mockDetail
      .mockResolvedValueOnce({ ...detail('t1'), title: 'A 再取得後' })
      .mockResolvedValueOnce({ ...detail('t1'), title: 'B 再取得後' });

    let pA!: Promise<void>;
    let pB!: Promise<void>;
    await act(async () => {
      pA = result.current.toggleMessageReaction('m1', '👍');
      pB = result.current.toggleMessageReaction('m2', '👍');
      await Promise.resolve();
    });

    // A 解決 → 再取得#2。
    await act(async () => {
      resolveA(reactionToggle(true));
      await pA;
    });
    expect(result.current.theme?.title).toBe('A 再取得後');

    // B 解決 → 再取得#3 が走らなければならない（dsk-0404 前は連番不一致で落ちていた）。
    await act(async () => {
      resolveB(reactionToggle(true));
      await pB;
    });
    expect(mockToggleMessage).toHaveBeenCalledTimes(2);
    expect(mockDetail).toHaveBeenCalledTimes(3); // 初回 + A 再取得 + B 再取得
    expect(result.current.theme?.title).toBe('B 再取得後');
  });

  it('起点カード × メッセージのリアクション並走 — 両方の再取得が走る', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result } = renderHook(() => useChatThread('t1'));
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    let resolveTheme!: (v: ReactionToggleResult) => void;
    let resolveMessage!: (v: ReactionToggleResult) => void;
    mockToggle.mockReturnValueOnce(
      new Promise<ReactionToggleResult>((r) => {
        resolveTheme = r;
      }),
    );
    mockToggleMessage.mockReturnValueOnce(
      new Promise<ReactionToggleResult>((r) => {
        resolveMessage = r;
      }),
    );

    let pTheme!: Promise<void>;
    let pMessage!: Promise<void>;
    await act(async () => {
      pTheme = result.current.toggleThemeReaction('👍');
      pMessage = result.current.toggleMessageReaction('m1', '🎉');
      await Promise.resolve();
    });

    await act(async () => {
      resolveTheme(reactionToggle(true));
      await pTheme;
    });
    await act(async () => {
      resolveMessage(reactionToggle(true));
      await pMessage;
    });
    // 初回 + 起点カード再取得 + メッセージ再取得。
    expect(mockDetail).toHaveBeenCalledTimes(3);
  });

  it('メッセージリアクショントグル中にスレッドを閉じる（themeId=null）— 再取得しない', async () => {
    mockDetail.mockResolvedValue(detail('t1'));
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useChatThread(id), {
      initialProps: { id: 't1' as string | null },
    });
    await waitFor(() => expect(result.current.theme?.id).toBe('t1'));

    let resolveToggle!: (v: ReactionToggleResult) => void;
    mockToggleMessage.mockReturnValueOnce(
      new Promise<ReactionToggleResult>((r) => {
        resolveToggle = r;
      }),
    );

    let togglePromise!: Promise<void>;
    await act(async () => {
      togglePromise = result.current.toggleMessageReaction('m1', '👍');
      await Promise.resolve();
    });

    // トグル解決前にスレッドを閉じる（themeId=null）。
    rerender({ id: null });
    await waitFor(() => expect(result.current.theme).toBeNull());

    const fetchCallsBefore = mockDetail.mock.calls.length;
    await act(async () => {
      resolveToggle(reactionToggle(true));
      await togglePromise;
    });
    // 閉じたテーマへ再取得を打ちに行かない。
    expect(mockDetail.mock.calls.length).toBe(fetchCallsBefore);
    expect(result.current.theme).toBeNull();
  });
});
