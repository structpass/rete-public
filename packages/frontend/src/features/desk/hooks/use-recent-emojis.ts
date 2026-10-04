'use client';

import { useCallback, useEffect, useState } from 'react';
import { REACTION_EMOJI_RE } from '@rete/shared';

/** 最近使ったリアクション絵文字の localStorage キーと保持上限（rete-desk-0094）。 */
const STORAGE_KEY = 'rete.desk.recentEmojis';
const MAX_RECENT = 10;
/** 同一タブ内の他 ReactionBar インスタンスへ更新を伝播するカスタムイベント。 */
const SYNC_EVENT = 'rete:recent-emojis-changed';

/** localStorage から最近使用リストを読む（壊れた値・SSR は空配列）。 */
function readRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === 'string').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * 最近使ったリアクション絵文字（最大 10 件・most-recent-first）を localStorage で永続化するフック。
 * push 時に同タブの全インスタンスへ SYNC_EVENT を、別タブへは storage イベントを通じて同期する。
 */
export function useRecentEmojis() {
  const [recent, setRecent] = useState<string[]>(readRecent);

  useEffect(() => {
    const sync = () => setRecent(readRecent());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const push = useCallback((emoji: string) => {
    if (typeof window === 'undefined') return;
    // 防御深度: 通常は API 成功後の検証済み値のみ届くが、非通常経路の混入を弾く（XSS は React 補間で別途無効化）。
    if (!REACTION_EMOJI_RE.test(emoji)) return;
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // 永続化成功時のみ in-memory / 他インスタンスへ反映（quota 失敗時の state↔storage 乖離を防ぐ）。
      setRecent(next);
      window.dispatchEvent(new Event(SYNC_EVENT));
    } catch {
      // quota 超過等は無視（最近使用は付加機能のため致命ではない）。
    }
  }, []);

  return { recent, push };
}
