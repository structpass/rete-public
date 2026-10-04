'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactionEmoji } from '@rete/shared';
import {
  fetchChatThemeDetail,
  postChatMessage,
  updateChatMessage,
  updateChatTheme,
  deleteChatTheme,
  deleteChatMessage,
  toggleMessageReaction,
  toggleThemeReaction,
  type ChatThemeDetail,
} from '../lib/api';
import { flushFileIds } from '../lib/flush-file-ids';

export interface UseChatThreadResult {
  theme: ChatThemeDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /**
   * 返信を投稿する。fileIds を渡すと、作成された発話へ deferred-flush 添付（FL-3b）してから再取得する
   * （post → attach → 単一 reload で添付込みのカードを即時表示する）。個々の添付失敗は best-effort（toast）。
   */
  postMessage: (body: string, fileIds?: string[], mentionAccountIds?: string[]) => Promise<void>;
  /** 自分の発話の本文を編集（PATCH /chat/messages/:id / rete-desk-0146）→ 成功後スレッド再取得で反映。 */
  updateMessage: (messageId: string, body: string, mentionAccountIds?: string[]) => Promise<void>;
  /** テーマ title / description / tenmatsu を更新（PATCH）→ 成功後スレッド再取得で反映。 */
  updateTheme: (payload: {
    title?: string;
    description?: string;
    tenmatsu?: string | null;
    descriptionMentionAccountIds?: string[];
    tenmatsuMentionAccountIds?: string[];
  }) => Promise<void>;
  /** アーカイブ状態を更新（PATCH archived）→ 成功後スレッド再取得で archived を最新化。 */
  archive: (archived: boolean) => Promise<void>;
  /**
   * テーマを物理削除（DELETE / rete-desk-0095）。削除後の再取得はしない（テーマ自体が消えるため）。
   * スレッドを閉じる・一覧を取り直すなどの後処理は呼び出し側（desk-shell）が行う。
   */
  deleteTheme: () => Promise<void>;
  /**
   * 発話（返信メッセージ）を物理削除（DELETE / dsk-0316）。テーマ本体は残るため削除後にスレッドを
   * 再取得し、一覧から消えた発話を反映する（deleteTheme と異なり thread 自体は開いたまま）。
   */
  deleteMessage: (messageId: string) => Promise<void>;
  /** メッセージのリアクションをトグル → トグル後 GET 再取得で count / reactedByMe を最新化。 */
  toggleMessageReaction: (messageId: string, emoji: ReactionEmoji) => Promise<void>;
  /** テーマ起点カードのリアクションをトグル → 再取得で最新化。 */
  toggleThemeReaction: (emoji: ReactionEmoji) => Promise<void>;
}

/**
 * dsk-0393: 取得済みスレッドの短時間キャッシュ。
 *
 * チャット詳細を開くたびに GET /chat/themes/:id を打つため、開閉を繰り返すと backend のグローバル
 * throttle（30 req / 60s・app.module.ts）に当たり 429 → 「スレッドの取得に失敗しました」になる。
 * TTL 内の同一テーマ再オープンではネットワークを打たずキャッシュを表示して本数を抑える（体感も改善）。
 * mutation 後の再取得は force で必ずサーバーへ行きキャッシュを更新するため、鮮度が要る場面は不変。
 * モジュールスコープなのはオーバーレイの開閉でフックが unmount されても保持するため。
 *
 * 鮮度キー（freshnessKey）: 一覧が持つ lastMessageAt を呼び出し側から受け取り、キャッシュ時と
 * 異なれば TTL 内でも再取得する。他者の新着が入ったテーマを開き直した時に古い本文を出さないため
 * （GET detail の副作用である既読化 rete-desk-0075 も、この場合は再取得で走る）。
 */
const THREAD_CACHE_TTL_MS = 30_000;
const threadCache = new Map<
  string,
  { detail: ChatThemeDetail; at: number; freshnessKey: string | null }
>();

/**
 * スレッドキャッシュを破棄する。ログアウト時に呼び、次にログインしたユーザーへ前ユーザーの
 * スレッド内容が渡らないようにする（列幅ストア resetColumnWidthsStore / テナント resetTenantInfoCache と同方針）。
 * テストの独立性確保にも使う。
 */
export function resetChatThreadCache(): void {
  threadCache.clear();
}

/**
 * チャット詳細スレッド（テーマ本体 + メッセージ全件）の取得 + 返信投稿。
 * themeId が null の間は何も取得しない。
 */
export function useChatThread(
  themeId: string | null,
  freshnessKey?: string | null,
): UseChatThreadResult {
  const [theme, setTheme] = useState<ChatThemeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 現在保持中のテーマを ref で追従し、load() が「初回/別テーマ切替」か「同一テーマの再取得」かを判定する。
  const themeRef = useRef<ChatThemeDetail | null>(null);
  themeRef.current = theme;
  // 発行順の連番。↑↓ の連続移動（use-desk-keyboard-nav の follow）でテーマ A→B と素早く切り替えると
  // GET が並走し、先発（A）が後着した場合に B 選択中へ A の内容が入る。応答適用時に自分が最新の
  // 要求かを照合し、追い越された古い応答は捨てる（キャッシュ書き込みは id キーなのでそのまま行う）。
  const requestSeqRef = useRef(0);
  // dsk-0404: 現在の themeId を毎レンダーで保持する ref。各 mutation が await 後に「テーマが
  // 変わったか」を起点 themeId との比較で判定する。dsk-0399 のガードは切替検出に requestSeqRef
  // （load の GET 連番）を兼用していたが、複数 ReactionBar が同一テーマで並走 mutation すると
  // 先着の load() が連番を進め、後着の再取得が偽陽性で黙って落ちる退行だった（リアクションが
  // 次回手動 refetch まで stale）。themeId 比較は identity 変化そのものをエンコードするため
  // 同テーマ並走では偽陽性ゼロ、切替（themeId=null の閉鎖含む）では再取得をスキップする。
  // requestSeqRef は load 内部の GET 追い越し破棄（dsk-0394）専用へ戻る。
  const activeThemeIdRef = useRef(themeId);
  activeThemeIdRef.current = themeId;

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const seq = ++requestSeqRef.current;
      setError(null);
      // 以降の早期 return 経路（themeId なし / キャッシュヒット）は自前で loading を降ろす。
      // 追い越された先発 GET の finally は seq 不一致で setLoading(false) をスキップするため、
      // ここで降ろさないと後発が即座に表示できても spinner が残り続ける。
      if (!themeId) {
        setTheme(null);
        setLoading(false);
        return;
      }
      // dsk-0393: 開き直し（force なし）は TTL 内キャッシュで済ませ、GET を打たない。
      const key = freshnessKey ?? null;
      if (!opts?.force) {
        const hit = threadCache.get(themeId);
        if (hit) {
          if (Date.now() - hit.at < THREAD_CACHE_TTL_MS && hit.freshnessKey === key) {
            setTheme(hit.detail);
            setLoading(false);
            return;
          }
          threadCache.delete(themeId); // 期限切れ / 新着ありは溜め込まず捨てる
        }
      }
      // 送信・リアクション・編集など mutation 後の「同一テーマ再取得」では loading を立てない
      // （stale-while-revalidate）。loading を立てると chat-thread が .desk-thread-view 全体を spinner へ
      // 差し替え、スクロール容器が一旦潰れて復帰し画面が揺れる/位置がずれる（rete-desk-0082 / 0093）。
      // blocking ローディングは初回および別テーマ切替（保持テーマ id と要求 id が異なる）時のみ。
      const isSwitch = themeRef.current?.id !== themeId;
      if (isSwitch) setLoading(true);
      try {
        const detail = await fetchChatThemeDetail(themeId);
        threadCache.set(themeId, { detail, at: Date.now(), freshnessKey: key });
        if (seq !== requestSeqRef.current) return; // 追い越された古い応答は表示へ反映しない
        setTheme(detail);
      } catch {
        if (seq !== requestSeqRef.current) return;
        setError('スレッドの取得に失敗しました');
      } finally {
        // 追い越された側が loading を降ろすと、後発の切替が立てた spinner を横から消してしまう。
        if (isSwitch && seq === requestSeqRef.current) setLoading(false);
      }
    },
    [themeId, freshnessKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // 明示的な再取得要求（呼び出し側の refetch）は鮮度が目的なのでキャッシュを迂回する（dsk-0393）。
  const refetchForced = useCallback(() => load({ force: true }), [load]);

  const postMessage = useCallback(
    async (body: string, fileIds: string[] = [], mentionAccountIds: string[] = []) => {
      if (!themeId) return;
      // 発話本体を先に作成し、id 確定後に保留ファイルを当該発話へ添付する（chatMessage 対象）。
      // 宛先（mentionAccountIds / rete-desk-0049）は本体作成と同時に backend で永続化される。
      // 添付は best-effort（失敗は toast のみで投稿自体は成立させる）。最後に 1 度だけ再取得し添付込みで表示。
      // dsk-0399 / dsk-0404: 起点テーマとの比較で切替検出（activeThemeIdRef 宣言部コメント参照）。
      const startThemeId = activeThemeIdRef.current;
      const message = await postChatMessage(themeId, body, mentionAccountIds);
      await flushFileIds(fileIds, 'chatMessage', message.id);
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [themeId, load],
  );

  const updateMessage = useCallback(
    async (messageId: string, body: string, mentionAccountIds: string[] = []) => {
      // 本文 + 宛先を更新し、成功後に同一テーマを再取得して編集内容を反映する（mutation 後の reload は
      // isSwitch=false で非ブロッキング = スクロール位置を保つ / load 内コメント参照）。
      const startThemeId = activeThemeIdRef.current;
      await updateChatMessage(messageId, body, mentionAccountIds);
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [load],
  );

  const updateTheme = useCallback(
    async (payload: {
      title?: string;
      description?: string;
      tenmatsu?: string | null;
      descriptionMentionAccountIds?: string[];
      tenmatsuMentionAccountIds?: string[];
    }) => {
      if (!themeId) return;
      const startThemeId = activeThemeIdRef.current;
      await updateChatTheme(themeId, payload);
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [themeId, load],
  );

  const archive = useCallback(
    async (archived: boolean) => {
      if (!themeId) return;
      const startThemeId = activeThemeIdRef.current;
      await updateChatTheme(themeId, { archived });
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [themeId, load],
  );

  const deleteTheme = useCallback(async () => {
    if (!themeId) return;
    await deleteChatTheme(themeId);
    threadCache.delete(themeId); // dsk-0393: 消えたテーマのキャッシュを残さない
  }, [themeId]);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const startThemeId = activeThemeIdRef.current;
      await deleteChatMessage(messageId);
      // テーマ本体は残るため、削除後にスレッドを再取得して一覧から消えた発話を反映する（updateMessage と同方針）。
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [load],
  );

  // トグル API は {reacted} のみ返すため、count / reactedByMe を最新化するには GET detail を引き直す
  // （集計の自前増減より再 fetch が確実 / 設計契約どおり）。
  const handleToggleMessageReaction = useCallback(
    async (messageId: string, emoji: ReactionEmoji) => {
      const startThemeId = activeThemeIdRef.current;
      await toggleMessageReaction(messageId, emoji);
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [load],
  );

  const handleToggleThemeReaction = useCallback(
    async (emoji: ReactionEmoji) => {
      if (!themeId) return;
      const startThemeId = activeThemeIdRef.current;
      await toggleThemeReaction(themeId, emoji);
      if (activeThemeIdRef.current !== startThemeId) return;
      await load({ force: true });
    },
    [themeId, load],
  );

  return {
    theme,
    loading,
    error,
    refetch: refetchForced,
    postMessage,
    updateMessage,
    updateTheme,
    archive,
    deleteTheme,
    deleteMessage,
    toggleMessageReaction: handleToggleMessageReaction,
    toggleThemeReaction: handleToggleThemeReaction,
  };
}
