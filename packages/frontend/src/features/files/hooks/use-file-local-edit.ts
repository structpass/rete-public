'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/lib/error-utils';
import { fetchFileBlob, sanitizeDownloadName, uploadFileVersion } from '../lib/api';
import { uploadFailureReason } from '../lib/upload-failure-message';
import type { FileEditTarget } from '../lib/types';

/**
 * File System Access API の最小型（fil-0075）。
 * WICG 仕様で TS lib.dom 未収載のため、本 hook が使う範囲だけをローカル宣言する（Chromium 限定 API）。
 */
interface FsaWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FsaFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FsaWritable>;
}
type FsaWindow = Window & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FsaFileHandle>;
};

export type LocalEditStatus = 'idle' | 'preparing' | 'watching' | 'uploading' | 'paused';

/** begin() / resume() の結果。呼び出し側（files-shell）が fallback / 何もしない を出し分ける。 */
export type LocalEditBeginResult = 'started' | 'cancelled' | 'unsupported' | 'error';

export interface UseFileLocalEditResult {
  /** File System Access API が使えるか（Chromium 系のみ true）。 */
  supported: boolean;
  status: LocalEditStatus;
  /** 監視中の対象ファイル（status!=='idle' の時のみ非 null）。 */
  target: FileEditTarget | null;
  /** セッション中に自動アップロードした最新版番号（未アップロードは null）。 */
  lastVersionNo: number | null;
  /**
   * ローカル書き出しファイルの最終更新時刻（epoch ms）。fil-0083 でオーバーレイの
   * 「ローカル側」情報表示に使うため state で公開。tick 内の lastModifiedRef 更新と
   * 同期して進める（tick 以外の経路＝begin の初回書き出し完了時にも更新）。
   */
  lastLocalModified: number | null;
  /**
   * fil-0142: 連続失敗で監視が paused 状態になった時の直近エラーメッセージ。
   * オーバーレイで停止理由として表示する。status!=='paused' の時は null。
   */
  lastError: string | null;
  /**
   * 編集セッションを開始する。ユーザー操作（ダブルクリック）のハンドラ連鎖内で呼ぶこと
   * — showSaveFilePicker は transient activation を要求するため、先に picker を出してから
   * サーバー取得・書き込みを行う（順序を逆にすると activation 失効で SecurityError になりうる）。
   */
  begin: (target: FileEditTarget) => Promise<LocalEditBeginResult>;
  /**
   * fil-0142: paused 状態から監視を再開する。picker を再出しして保存先を選び直す。
   * File System Access API の transient activation 制約で保持済み handle では自動再開できないため
   * （fil-0142 design 参照）、明示的にユーザー操作を要求する。
   * status==='paused' の時のみ意味がある。それ以外で呼んだ場合は 'error' を返す。
   */
  resume: () => Promise<LocalEditBeginResult>;
  /** 監視を停止しセッションを破棄する（オーバーレイの「監視停止」/ 閉じる）。 */
  stop: () => void;
}

/** ローカル保存の変更検知ポーリング間隔（ms）。criteria「数秒以内に新版が自動作成」を満たす粒度。 */
const POLL_MS = 3000;
/** アップロード連続失敗の打ち切り回数（トースト連打・無限リトライ防止）。 */
const MAX_UPLOAD_FAILURES = 3;

/**
 * ローカル編集の自動同期セッション（fil-0075）。
 *
 * ダブルクリック → showSaveFilePicker でローカルへ書き出し、FileSystemFileHandle の
 * lastModified をポーリングして変更を検知したら uploadFileVersion で新版として自動アップロードする。
 * ユーザーは「ローカルアプリで編集して保存する」だけで rete 側に版が積まれる
 * （＝ブラウザ上で直接編集しているような体験）。監視はタブを開いている間のみで、
 * stop() / アンマウント / タブ閉じで確実に終了する（タイマー残留なし）。
 */
export function useFileLocalEdit({
  onUploaded,
}: { onUploaded?: () => void } = {}): UseFileLocalEditResult {
  const [status, setStatus] = useState<LocalEditStatus>('idle');
  const [target, setTarget] = useState<FileEditTarget | null>(null);
  const [lastVersionNo, setLastVersionNo] = useState<number | null>(null);
  // fil-0083: ローカル書き出しファイルの最終更新時刻（epoch ms）を state として公開。
  // tick の change 検知は ref（lastModifiedRef）で従来通り行い、UI 露出用に同期して state も進める。
  const [lastLocalModified, setLastLocalModified] = useState<number | null>(null);
  // fil-0142: 連続失敗で paused になった時の直近エラーメッセージ。UI に停止理由として表示する。
  const [lastError, setLastError] = useState<string | null>(null);

  const handleRef = useRef<FsaFileHandle | null>(null);
  const targetRef = useRef<FileEditTarget | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastModifiedRef = useRef<number>(0);
  /** tick の再入防止（getFile / upload 中に次の interval が重ならないように）。 */
  const busyRef = useRef(false);
  const failureCountRef = useRef(0);
  /**
   * セッション世代。stop()（アンマウント含む）で進み、await 中の begin()/tick() が
   * 再開時に自世代と突き合わせて古ければ何もしない（picker/fetch 待機中の遷移・
   * 連続 begin で clear 不能な setInterval が残るのを防ぐ）。
   */
  const generationRef = useRef(0);

  const supported =
    typeof window !== 'undefined' && typeof (window as FsaWindow).showSaveFilePicker === 'function';

  const stop = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    handleRef.current = null;
    targetRef.current = null;
    busyRef.current = false;
    failureCountRef.current = 0;
    setStatus('idle');
    setTarget(null);
    setLastVersionNo(null);
    setLastLocalModified(null);
    setLastError(null);
  }, []);

  /**
   * fil-0142: ポーリングタイマーのみ停止する（内部用）。paused 遷移時に呼ぶ。
   * セッション自体は保持するため stop() の partial 版。begin/resume が setInterval を
   * 再構築する前提で、handleRef/targetRef はそのまま残す。
   */
  const clearTimerOnly = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // アンマウント（画面遷移・タブ閉じ）でポーリングを確実に停止する。
  useEffect(() => stop, [stop]);

  const tick = useCallback(async () => {
    const handle = handleRef.current;
    const tgt = targetRef.current;
    if (!handle || !tgt || busyRef.current) return;
    const gen = generationRef.current;
    busyRef.current = true;
    try {
      const file = await handle.getFile();
      if (generationRef.current !== gen) return;
      if (file.lastModified === lastModifiedRef.current) return;
      setStatus('uploading');
      const row = await uploadFileVersion(tgt.id, file);
      if (generationRef.current !== gen) return;
      lastModifiedRef.current = file.lastModified;
      // fil-0083: UI 露出用に同じ値を state へも反映（ref 単独だとレンダー駆動の更新にならない）。
      setLastLocalModified(file.lastModified);
      failureCountRef.current = 0;
      setLastVersionNo(row.versionNo ?? null);
      toast.success(
        row.versionNo != null
          ? `新しい版（v${row.versionNo}）を保存しました`
          : '新しい版を保存しました',
      );
      onUploaded?.();
      setStatus('watching');
    } catch (err) {
      // 取得/アップロード失敗。lastModified を進めないため次 tick で自動リトライされる。
      // fil-0142: 連続失敗が MAX に達した場合、stop() で全 state を破棄せず paused へ落とす。
      // 理由は (1) File System Access API の権限が切れた等の場合、保持 handle では自動再開できず
      // picker を出し直す＝ユーザー操作が必須、(2) paused 中は timer を停止して意図しない自動
      // アップロードを防ぐ、(3) トーストが消えてもオーバーレイ側で lastError を見て復帰可能。
      if (generationRef.current !== gen) return;
      const message = uploadFailureReason(err, '自動アップロードに失敗しました');
      failureCountRef.current += 1;
      if (failureCountRef.current >= MAX_UPLOAD_FAILURES) {
        toast.error(message);
        clearTimerOnly();
        setLastError(message);
        setStatus('paused');
      } else if (failureCountRef.current === 1) {
        toast.error(uploadFailureReason(err, '自動アップロードに失敗しました。再試行します'));
        setStatus('watching');
      } else {
        setStatus('watching');
      }
    } finally {
      busyRef.current = false;
    }
  }, [onUploaded, clearTimerOnly]);

  const begin = useCallback(
    async (nextTarget: FileEditTarget): Promise<LocalEditBeginResult> => {
      const picker = (window as FsaWindow).showSaveFilePicker;
      if (typeof picker !== 'function') return 'unsupported';
      // 既存セッションがあれば張り替える（同時監視は 1 ファイルのみ）。
      stop();
      const gen = generationRef.current;
      let handle: FsaFileHandle;
      try {
        // transient activation が生きているうちに picker を先に出す（fetch を先にしない）。
        // 保存名は downloadFile（anchor 保存）と同じサニタイズを通し DL 経路間で扱いを揃える。
        handle = await picker({ suggestedName: sanitizeDownloadName(nextTarget.name) });
      } catch (err) {
        // ユーザーが保存先ダイアログをキャンセル（AbortError）→ 何もしない。
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
        return 'error';
      }
      // picker 待機中に stop()（アンマウント・別 begin）が入っていたら開始しない。
      if (generationRef.current !== gen) return 'cancelled';
      setStatus('preparing');
      setTarget(nextTarget);
      try {
        const blob = await fetchFileBlob(nextTarget.id);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        // fil-0083: 初回書き出し直後の lastModified を ref + state 両方へ反映（state は UI 用）。
        const initialModified = (await handle.getFile()).lastModified;
        lastModifiedRef.current = initialModified;
        setLastLocalModified(initialModified);
      } catch (err) {
        if (generationRef.current !== gen) return 'cancelled';
        toast.error(extractErrorMessage(err, 'ファイルの書き出しに失敗しました'));
        stop();
        return 'error';
      }
      // 書き出し中に stop() が入っていたら監視を開始しない（setInterval 残留防止）。
      if (generationRef.current !== gen) return 'cancelled';
      handleRef.current = handle;
      targetRef.current = nextTarget;
      failureCountRef.current = 0;
      setStatus('watching');
      timerRef.current = setInterval(() => {
        void tick();
      }, POLL_MS);
      return 'started';
    },
    [stop, tick],
  );

  /**
   * fil-0142: paused 状態から監視を再開する。picker を再出して保存先を選び直す。
   * status==='paused' の時のみ動作し、それ以外は 'error' を返す（idle から begin、
   * watching/uploading から resume は想定外＝idle なら begin を呼ぶ）。
   *
   * 既存 handle は破棄して picker を出し直す。File System Access API の transient activation
   * 制約で古い handle は自動再開に使えない（権限が切れている前提・fil-0142 design）。
   * 既存 target はそのまま使い、picker で選んだ新しい保存先に最新版を再度書き出す。
   */
  const resume = useCallback(async (): Promise<LocalEditBeginResult> => {
    if (status !== 'paused') return 'error';
    const currentTarget = targetRef.current;
    if (!currentTarget) return 'error';
    // 古い handle / target を破棄して begin で再初期化する。lastError をクリアして復帰可能に。
    handleRef.current = null;
    failureCountRef.current = 0;
    setLastError(null);
    return begin(currentTarget);
  }, [status, begin]);

  return {
    supported,
    status,
    target,
    lastVersionNo,
    lastLocalModified,
    lastError,
    begin,
    resume,
    stop,
  };
}
