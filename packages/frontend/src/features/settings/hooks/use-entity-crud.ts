'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 器（組織/プロジェクト）の一覧 + CRUD を共通化したカスタム hook（architecture-invariants §6）。
 *
 * 組織画面と PJ 画面は「一覧取得 + 名前で作成 + 部分更新（改名/archive）」が逐語的に一致する。
 * このフックを介して共通化し、コピペ（§3）を避ける。
 *
 * **fetchFn 参照が変わると再取得を自動トリガーする**:
 * 呼び出し側で `useCallback(() => fetchXxxAdmin(someParam), [someParam])` と memoize すれば、
 * someParam 変化 → fetchFn 変化 → useEffect 再実行 → リスト更新、という流れになる。
 */

export interface UseEntityCrudResult<T> {
  items: T[];
  isLoading: boolean;
  creating: boolean;
  updating: boolean;
  /** 一覧を再取得する（保存成功後の明示 reload が必要な場合に使う）。 */
  reload: () => void;
  /** 新規アイテムを作成してリストへ追加する。失敗時は throw するので caller が catch する。 */
  create: (name: string) => Promise<T>;
  /** アイテムを部分更新する（改名 / archive / restore）。失敗時は throw するので caller が catch する。 */
  update: (id: string, patch: { name?: string; archived?: boolean }) => Promise<T>;
}

/**
 * @param fetchFn  一覧取得 fn。参照変更で useEffect が再実行される（useCallback で memoize 推奨）。
 * @param createFn 名前を受け取り新規作成して返す fn。
 * @param updateFn id + 部分パッチを受け取り更新後 DTO を返す fn。
 */
export function useEntityCrud<T extends { id: string }>({
  fetchFn,
  createFn,
  updateFn,
}: {
  fetchFn: () => Promise<T[]>;
  createFn: (name: string) => Promise<T>;
  updateFn: (id: string, patch: { name?: string; archived?: boolean }) => Promise<T>;
}): UseEntityCrudResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  /**
   * 取得の世代番号（set-0150）。load のたびに ++ し、解決時に自分が最新でなければ結果を捨てる。
   *
   * アーカイブ絞り込みチップ（active ⇄ all）を素早く往復させると fetchFn 参照が続けて変わり、
   * 先行の取得が後から解決して新しい一覧を上書きしうる（後着上書き）。AbortController でも塞げるが、
   * 取り消しに対応しない fetchFn にも効く世代カウンタを採る。isLoading も同様に最新世代だけが下ろす
   * （古い取得の解決で、まだ走っている新しい取得のスピナーを消さない）。
   *
   * **守備範囲は取得どうしの競合だけ**（load 対 load）。create / update は世代の外で setItems を
   * 触るので、「取得の最中に作成が成功し、その作成物を含まない取得が後から解決する」順序では
   * 追加行が消える。これは絞り込み操作では起こらない（フォーム送信中に取得は走らない）ため
   * 本チケットの範囲外に置いた。塞ぐなら create / update の成功時にも世代を進める。
   */
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setIsLoading(true);
    try {
      const list = await fetchFn();
      if (gen !== loadGenRef.current) return;
      setItems(list);
    } finally {
      if (gen === loadGenRef.current) setIsLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    // fetchFn が変わるたびに再取得（引数変化への反応）。
    // 失敗は握り潰す＝前回の items が残ったまま isLoading が下りる（呼び出し側へエラーを渡す口は
    // 現状無い。set-0150 のレビューで判明したコメントのドリフトを実体へ合わせた）。
    load().catch(() => {});
  }, [load]);

  const create = useCallback(
    async (name: string): Promise<T> => {
      setCreating(true);
      try {
        const created = await createFn(name);
        setItems((cur) => [...cur, created]);
        return created;
      } finally {
        setCreating(false);
      }
    },
    [createFn],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; archived?: boolean }): Promise<T> => {
      setUpdating(true);
      try {
        const updated = await updateFn(id, patch);
        setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)));
        return updated;
      } finally {
        setUpdating(false);
      }
    },
    [updateFn],
  );

  return {
    items,
    isLoading,
    creating,
    updating,
    reload: () => {
      load().catch(() => {});
    },
    create,
    update,
  };
}
