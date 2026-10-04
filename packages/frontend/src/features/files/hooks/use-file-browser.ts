'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchFileTree,
  fetchFolderContent,
  moveFile as apiMoveFile,
  moveFolder as apiMoveFolder,
} from '../lib/api';
import type { FolderContent, TreeNode } from '../lib/types';

export interface UseFileBrowserResult {
  /** 現在表示中の器（channel）。null = 器の復元待ちで未確定（ツリー未取得・treeLoading のまま）。 */
  spaceId: string | null;
  currentFolderId: string | null;
  currentTree: TreeNode[];
  currentFolder: FolderContent | null;
  treeLoading: boolean;
  treeError: boolean;
  /** ツリー取得失敗時の HTTP status（非 HTTP エラー・正常時は null）。404=非可視/削除済み space（fil-0138）。 */
  treeErrorStatus: number | null;
  folderLoading: boolean;
  folderError: boolean;
  /** D&D 移動の有効/無効（FB-2b 移動 API 配線済 → false）。 */
  dndDisabled: boolean;
  selectFolder: (fid: string) => void;
  /** 現在フォルダを再取得する（アップロード後の一覧反映に使う）。 */
  refreshFolder: () => void;
  /**
   * フォルダを別フォルダ配下（null=ルート直下）へ移動して永続化し、ツリー + 現在フォルダを再取得する。
   * 失敗時は呼び出し側（shell）で握って toast 表示するため例外を再送出する。
   */
  moveFolderTo: (folderId: string, parentFolderId: string | null) => Promise<void>;
  /** ファイルを別フォルダへ移動して永続化し、ツリー + 現在フォルダを再取得する（失敗時は再送出）。 */
  moveFileTo: (fileId: string, folderId: string) => Promise<void>;
  /** ツリー + 現在フォルダ一覧をまとめて再取得する（削除後など、ツリーと一覧の両方が変わる操作の整合用）。 */
  reloadAll: () => Promise<void>;
}

/**
 * File タブのナビゲーション + リポジトリ状態（実 API 接続・器スコープ / ADR 0063・fil-0137）。
 *
 * ツリーは器（Space=channel）単位で完結する。spaceId が確定したらその器のフォルダツリー
 * （GET /files/tree?spaceId=）を取得し先頭フォルダを選択、以降はフォルダ選択ごとに内容
 * （GET /files/folders/:id）をオンデマンド取得する。spaceId が切り替わったら（サイドバーの
 * channel 選択）選択をリセットして新しい器のツリーを取り直す。spaceId=null の間（localStorage
 * 復元待ち）は fetch を始めない（treeLoading のまま＝二重 fetch とフラッシュ回避・DeskShellGate と同型）。
 * 連続選択での競合は req 連番で stale 応答を無視する。旧ロケーション概念（リポジトリ/共有）は
 * Desk 共有の器スコープへ置換して撤去した。
 * 移動 D&D（FB-2b）は移動 API へ配線済（dndDisabled=false）。移動成功後はツリー + 現在フォルダを再取得して
 * サーバーの状態へ整合させる（楽観更新は採らず source-of-truth を backend に置く）。
 */
export function useFileBrowser(
  spaceId: string | null,
  initialFolderId?: string | null,
): UseFileBrowserResult {
  const [currentTree, setCurrentTree] = useState<TreeNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderContent | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState(false);
  // ツリー取得失敗時の HTTP status（非 HTTP エラーは null）。非可視/削除済み space（404）を
  // 呼び出し側（files-view）が既定チャネルへのフォールバック判定に使う（fil-0138）。
  const [treeErrorStatus, setTreeErrorStatus] = useState<number | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState(false);

  // 初回選択の deep link 先（/files?folderId=・HM-1-4）。loadTree の useCallback 依存を安定に保つため
  // ref で保持し、初回ツリー取得時だけ参照する（後続の再描画で再適用させない）。
  const initialFolderIdRef = useRef(initialFolderId ?? null);
  // フォルダ内容取得の競合解決。最後に発行した req 連番と一致する応答のみ反映する。
  const reqIdRef = useRef(0);
  // ツリー取得の競合解決（器の連続切替）。古い器の応答が後着して新しい器のツリーを上書きしないようにする。
  const treeReqIdRef = useRef(0);
  // アンマウント後の setState（React の状態更新警告）を防ぐ。loadFolder/mount 取得の両方で参照する。
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFolder = useCallback(async (fid: string) => {
    const reqId = ++reqIdRef.current;
    setFolderLoading(true);
    setFolderError(false);
    try {
      const content = await fetchFolderContent(fid);
      if (!mountedRef.current || reqId !== reqIdRef.current) return;
      setCurrentFolder(content);
    } catch {
      if (!mountedRef.current || reqId !== reqIdRef.current) return;
      setCurrentFolder(null);
      setFolderError(true);
    } finally {
      if (mountedRef.current && reqId === reqIdRef.current) setFolderLoading(false);
    }
  }, []);

  const selectFolder = useCallback(
    (fid: string) => {
      setCurrentFolderId(fid);
      void loadFolder(fid);
    },
    [loadFolder],
  );

  /**
   * フォルダツリー（GET /files/tree?spaceId=）を取得して反映する。spaceId 未確定（null）中は何もしない。
   * - `selectFirst`: 器のロード時のみ true。先頭フォルダを選択して内容も取得する。
   * - `showLoading`: false にすると loading/error 表示を出さず既存ツリーを保ったまま静かに差し替える
   *   （移動後の再取得用。失敗しても元の表示を温存し、エラーフラグを立てない＝楽観的に元状態を保つ）。
   */
  const loadTree = useCallback(
    async (selectFirst: boolean, showLoading = true) => {
      if (!spaceId) return;
      const treeReqId = ++treeReqIdRef.current;
      if (showLoading) {
        setTreeLoading(true);
        setTreeError(false);
        setTreeErrorStatus(null);
      }
      try {
        const tree = await fetchFileTree(spaceId);
        if (!mountedRef.current || treeReqId !== treeReqIdRef.current) return;
        setCurrentTree(tree);
        if (selectFirst && tree.length) {
          // deep link 先（initialFolderId）がツリーに在ればそれを、無ければ先頭フォルダを初回選択する。
          const wanted = initialFolderIdRef.current;
          const target = (wanted && tree.find((n) => n.fid === wanted)?.fid) || tree[0].fid;
          setCurrentFolderId(target);
          void loadFolder(target);
        }
      } catch (e) {
        if (!mountedRef.current || treeReqId !== treeReqIdRef.current) return;
        if (showLoading) {
          setCurrentTree([]);
          setTreeError(true);
          // axios エラーの HTTP status を保持する（非可視/削除済み space の 404 判定用・fil-0138）。
          const status = (e as { response?: { status?: number } })?.response?.status;
          setTreeErrorStatus(typeof status === 'number' ? status : null);
        }
      } finally {
        if (mountedRef.current && treeReqId === treeReqIdRef.current && showLoading) {
          setTreeLoading(false);
        }
      }
    },
    [spaceId, loadFolder],
  );

  // 器の確定 / 切替でツリーを取得する（channel 切替でフォルダツリー・右ペイン・パンくずを追従させる）。
  // 切替時は前の器のフォルダ選択を持ち越さずリセットし、新しい器の先頭フォルダを選び直す。
  useEffect(() => {
    if (!spaceId) return;
    // 旧器で in-flight の fetchFolderContent を無効化する（連番を進めて後着応答を捨てる）。
    // これが無いと、切替直後〜新ツリーの selectFirst までの窓で旧 channel のフォルダ内容が復活する。
    reqIdRef.current += 1;
    setCurrentFolderId(null);
    setCurrentFolder(null);
    void loadTree(true);
    // loadTree は spaceId を deps に含むため、spaceId 切替ごとに新しい loadTree で 1 回だけ走る。
  }, [spaceId, loadTree]);

  // 同一ツリー上で deep link 先（initialFolderId）が変わった時の追従（/files?folderId= 切替・HM-1-4）。
  // 初回 mount の選択は loadTree(true) が担う。
  // hom-0115: currentFolderId を deps に入れるとツリークリックのたび initialFolderId へ引き戻すため、
  // 「前回適用した deep link 値」を ref で覚え、URL が実際に変わった時だけ追従する。
  const appliedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialFolderId) {
      // URL から folderId が消えたら適用済みを解放（同じ id への再 deep link を受けられるように）。
      appliedDeepLinkRef.current = null;
      return;
    }
    if (appliedDeepLinkRef.current === initialFolderId) return;
    if (!currentTree.some((n) => n.fid === initialFolderId)) return;
    appliedDeepLinkRef.current = initialFolderId;
    // mount 時は loadTree が既に同じ fid を選んでいることが多い＝二重ロード回避。
    if (initialFolderId === currentFolderId) return;
    selectFolder(initialFolderId);
    // currentFolderId は意図的に deps 外。ツリー選択変化で effect を再走らせない（引き戻し防止）。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hom-0115: currentFolderId を deps に入れない
  }, [initialFolderId, currentTree, selectFolder]);

  const refreshFolder = useCallback(() => {
    if (currentFolderId) void loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  /**
   * フォルダ移動を永続化して整合させる。ツリー構造が変わるためツリーを静かに再取得し、
   * 現在フォルダ一覧も更新する（移動した子フォルダが一覧から消える/移動先に現れるため）。
   * 失敗時は shell 側で toast 表示するため例外を握らず再送出する。
   */
  const moveFolderTo = useCallback(
    async (folderId: string, parentFolderId: string | null) => {
      await apiMoveFolder(folderId, parentFolderId);
      await Promise.all([
        loadTree(false, false),
        currentFolderId ? loadFolder(currentFolderId) : Promise.resolve(),
      ]);
    },
    [loadTree, loadFolder, currentFolderId],
  );

  /**
   * ファイル移動を永続化して整合させる。ファイルはツリーに現れないためツリー再取得は不要で、
   * 現在フォルダ一覧のみ更新する（移動したファイルが一覧から消える）。失敗時は再送出。
   */
  const moveFileTo = useCallback(
    async (fileId: string, folderId: string) => {
      await apiMoveFile(fileId, folderId);
      if (currentFolderId) await loadFolder(currentFolderId);
    },
    [loadFolder, currentFolderId],
  );

  /**
   * ツリー + 現在フォルダ一覧をまとめて静かに再取得する。削除のようにフォルダ階層（ツリー）と
   * 一覧の両方が変わる操作の後で、サーバー状態へ整合させる（移動と同じく source-of-truth は backend）。
   */
  const reloadAll = useCallback(async () => {
    await Promise.all([
      loadTree(false, false),
      currentFolderId ? loadFolder(currentFolderId) : Promise.resolve(),
    ]);
  }, [loadTree, loadFolder, currentFolderId]);

  return {
    spaceId,
    currentFolderId,
    currentTree,
    currentFolder,
    treeLoading,
    treeError,
    treeErrorStatus,
    folderLoading,
    folderError,
    dndDisabled: false,
    selectFolder,
    refreshFolder,
    moveFolderTo,
    moveFileTo,
    reloadAll,
  };
}
