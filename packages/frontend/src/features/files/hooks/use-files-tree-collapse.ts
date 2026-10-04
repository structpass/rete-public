'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/features/auth/hooks/use-session';

/**
 * ファイルツリー折り畳み状態（fil-0072/fil-0073）。
 *
 * シェブロンクリックで開閉したフォルダ ID 一覧を accountId キーで localStorage へ保存する。
 * 同じブラウザでも別ユーザーでログインした場合、accountId 別にキーが分かれるため設定が混ざらない。
 * 削除済みフォルダの ID が保存に残っていても、描画時の isHiddenByCollapse で自然に無視される
 * （fil-0073 criteria・存在しない id は無視）。
 *
 * SSR 安全: 初回は空集合を描画し、マウント後に localStorage から復元する（hydration mismatch 回避）。
 * 復元完了まで親が描画を遅延する必要なし（折り畳みが無くても全展開で問題ないため）。
 */

const STORAGE_KEY_PREFIX = 'files-tree-collapse-v1';

function buildKey(accountId: string | null | undefined): string | null {
  if (!accountId) return null;
  return `${STORAGE_KEY_PREFIX}:${accountId}`;
}

function sanitize(parsed: unknown): string[] {
  if (typeof parsed !== 'object' || parsed === null) return [];
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.collapsed)) return [];
  // 文字列要素のみ採用（手動改ざん対策）。
  return p.collapsed.filter((v): v is string => typeof v === 'string');
}

export interface UseFilesTreeCollapseResult {
  /** 現在折り畳み中のフォルダ ID 一覧（描画フィルタとシェブロン向きに使う）。 */
  collapsedIds: ReadonlySet<string>;
  /** localStorage 復元が解決済みか。折り畳みは復元前でも全展開で支障ないため描画ゲートはしない。 */
  hydrated: boolean;
  /** 折り畳み可能（hasChildren）なフォルダにのみ呼ぶ。葉ノードにはそもそも呼ばない。 */
  toggle: (folderId: string) => void;
  /**
   * 指定 id を折り畳み集合から外して展開する（fil-0074）。
   * 検索結果からフォルダを開くとき祖先だけを開く用途。対象自身や既に開いている id は no-op。
   */
  expand: (folderIds: readonly string[]) => void;
}

export function useFilesTreeCollapse(): UseFilesTreeCollapseResult {
  const { user } = useSession();
  const storageKey = buildKey(user?.id);

  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  // マウント後に localStorage から復元する。user 未確定なら何もしない。
  useEffect(() => {
    if (!storageKey) {
      setCollapsedIds(new Set());
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const restored = sanitize(JSON.parse(raw));
        setCollapsedIds(new Set(restored));
      } else {
        setCollapsedIds(new Set());
      }
    } catch {
      setCollapsedIds(new Set());
    }
    setHydrated(true);
  }, [storageKey]);

  // 復元後の変更だけ永続化する（マウント直後の空書込みで既存値を潰さない）。
  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ collapsed: [...collapsedIds] }));
    } catch {
      // 容量超過 / 書込み不可は無視（ベストエフォート）。
    }
  }, [collapsedIds, hydrated, storageKey]);

  const toggle = useCallback((folderId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  // 祖先展開（fil-0074）。変化が無いときは prev 参照を保ち不要再描画を避ける。
  const expand = useCallback((folderIds: readonly string[]) => {
    if (folderIds.length === 0) return;
    setCollapsedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of folderIds) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  return { collapsedIds, hydrated, toggle, expand };
}
