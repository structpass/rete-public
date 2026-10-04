'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseFileSelectionResult {
  selected: Set<string>;
  has: (name: string) => boolean;
  toggle: (name: string) => void;
  /** 複数行をまとめて選択/解除（全選択チェックボックス用）。 */
  setMany: (names: string[], checked: boolean) => void;
  clear: () => void;
}

/**
 * 一覧の複数選択（行名キー）。フォルダ切替で選択をリセットする。
 * 任意の初期選択（initial）を受け付ける（通常は未指定＝空選択で開始）。
 */
export function useFileSelection(folderId: string, initial?: string[]): UseFileSelectionResult {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial ?? []));
  const prevFolder = useRef(folderId);

  useEffect(() => {
    if (prevFolder.current !== folderId) {
      prevFolder.current = folderId;
      setSelected(new Set());
    }
  }, [folderId]);

  const has = useCallback((name: string) => selected.has(name), [selected]);

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const setMany = useCallback((names: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const n of names) {
        if (checked) next.add(n);
        else next.delete(n);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, has, toggle, setMany, clear };
}
