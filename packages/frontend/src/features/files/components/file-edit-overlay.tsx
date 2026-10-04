'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Pencil, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadFailureReason } from '../lib/upload-failure-message';
import { formatDateTime } from '@/lib/utils';
import { OverlayDialog } from '@/components/ui/overlay-dialog';
import { Spinner } from '@/components/ui/spinner';
import { downloadFile, uploadFileVersion } from '../lib/api';
import type { LocalEditStatus } from '../hooks/use-file-local-edit';
import type { FileEditTarget } from '../lib/types';

/** ローカル編集セッションの表示用スライス（fil-0075・use-file-local-edit が供給）。 */
export interface FileEditSessionView {
  status: LocalEditStatus;
  lastVersionNo: number | null;
  /** ローカル書き出しファイルの最終更新時刻（epoch ms）。null＝未取得 or 監視停止後。 */
  lastLocalModified: number | null;
  /** fil-0142: paused 状態時の直近エラーメッセージ。status==='paused' の時のみ非 null。 */
  lastError: string | null;
  /** 監視を停止する（オーバーレイは呼び出し側が閉じる）。 */
  stop: () => void;
  /** fil-0142: paused 状態から picker を出し直して監視を再開する。 */
  resume: () => Promise<unknown>;
}

/**
 * epoch ms を人間可読な "YYYY/MM/DD HH:MM"（ローカルタイム）に整形（fil-0083）。
 * lib/utils.ts:formatDateTime は ISO 文字列を受けるので、epoch ms を一度 UTC ISO に
 * 変換してから渡し、formatDateTime のローカル TZ 復元で「人間可読ローカル時刻」を得る。
 */
function formatLocalModified(epochMs: number): string {
  return formatDateTime(new Date(epochMs).toISOString());
}

/**
 * ファイル編集オーバーレイ（FF・rete-files-0026 / fil-0075 / fil-0083 / fil-0090）。
 *
 * - **同期セッションあり**（`session.status!=='idle'`・ファイル行ダブルクリック起点）: ローカルへ
 *   書き出したファイルの保存を監視し、保存のたびに新版として自動アップロードする「編集中」UI。
 *   fil-0090 最終設計: 開発統括提示画像どおりの簡素な構成＝ヘッダー（ファイル名＋を監視中）・説明文・
 *   パンくず（folderPath）・版数/最終更新の2列テーブルのみ。fil-0083 のローカル/File 2ブロック分割・
 *   監視中ステータス行は撤去（さらなる簡素化要望への次イテレーション）。
 * - **同期セッションなし**（お気に入り deep link / File System Access API 非対応 fallback）:
 *   従来の「DL→ローカルで編集→再アップで新版」の手動往復 UI（対象行 + ステップ + DL/再アップロード）。
 *
 * どちらも再アップはファイル名でなくファイル id を着地点にする（uploadFileVersion）ため、OS のリネーム
 * （"report (1).docx" 等）でも別ファイルを誤生成せず、FB-2 版管理の新版として確実に積まれる。
 * focus trap・ESC・背景 inert 隔離は共通部品 OverlayDialog に委譲する（fil-0059）。
 */
export function FileEditOverlay({
  target,
  folderPath = '',
  onClose,
  onUploaded,
  session,
}: {
  target: FileEditTarget;
  /**
   * File 側のパンくず（files-shell.tsx から渡される、fil-0083）。
   * syncing モードの File 情報ブロックに表示。
   */
  folderPath?: string;
  onClose: () => void;
  onUploaded: () => void;
  session?: FileEditSessionView;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  /**
   * fil-0083: 版数パルスのトリガ状態＋ベースライン ref。
   * - `lastPulsedVersionRef`: パルス発火の判定に使うため ref で保持（state にすると
   *   useEffect の依存に再入し無限ループする）。最後に観測した shownVersionNo を記録し、
   *   それが「初回観測」ならパルスなしで記録のみ、「2 回目以降で変化」なら約 700ms のパルスを立てる。
   * - `pulseVersion`: 表示専用の一過性 state。is-pulse クラスを当てる version 番号を保持し、
   *   アニメ本体（600ms）後の setTimeout で null へ戻す。
   * - deps は `[syncing, shownVersionNo]` のみ。pulseVersion は deps に入れない（再トリガ防止）。
   */
  const lastPulsedVersionRef = useRef<number | null>(null);
  const [pulseVersion, setPulseVersion] = useState<number | null>(null);
  const syncing = session != null && session.status !== 'idle';
  const shownVersionNo = syncing ? (session.lastVersionNo ?? target.versionNo) : target.versionNo;
  useEffect(() => {
    if (!syncing) {
      // 非 syncing に戻ったらベースラインをクリア（次に syncing へ戻った時に誤パルスしない）。
      lastPulsedVersionRef.current = null;
      return;
    }
    if (shownVersionNo == null) return;
    if (lastPulsedVersionRef.current === shownVersionNo) return; // 同一値・再入回避
    if (lastPulsedVersionRef.current == null) {
      // 初回観測＝オーバーレイを開いた時点の版数。パルスなしで記録のみ。
      lastPulsedVersionRef.current = shownVersionNo;
      return;
    }
    // 観測後 2 回目以降で値が変わった＝新版が積まれた瞬間。パルスを立てる。
    lastPulsedVersionRef.current = shownVersionNo;
    setPulseVersion(shownVersionNo);
    const t = window.setTimeout(() => setPulseVersion(null), 700);
    return () => window.clearTimeout(t);
  }, [syncing, shownVersionNo]);
  const isPulsingVer = pulseVersion != null && pulseVersion === shownVersionNo;

  const handleDownload = async () => {
    try {
      await downloadFile(target.id, target.name);
    } catch {
      toast.error('ダウンロードに失敗しました');
    }
  };

  const handleReupload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同名再選択でも change が発火するようリセット。
    if (!file) return;
    setUploading(true);
    try {
      const row = await uploadFileVersion(target.id, file);
      toast.success(
        row.versionNo != null
          ? `新しい版（v${row.versionNo}）を保存しました`
          : '新しい版を保存しました',
      );
      onUploaded();
      onClose();
    } catch (err) {
      toast.error(uploadFailureReason(err, '新版の保存に失敗しました'));
    } finally {
      setUploading(false);
    }
  };

  // syncing / shownVersionNo / isPulsingVer は上部で算出済（hooks ブロック）。

  return (
    <OverlayDialog open onClose={onClose} ariaLabel="ファイルを編集" width="min(540px, 92vw)">
      <div className="file-overlay-panel">
        {/* cmn-0355 適用外: h2 に条件付きクラス（file-edit-head-syncing）と 2 span 構造を持つため
              OverlayHeader を使わない（1 呼び出しのために titleClassName を生やさない）。 */}
        <div className="file-overlay-head">
          <div className="file-overlay-head-title">
            <span className="file-overlay-icon">
              {syncing ? (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Pencil className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            {/* fil-0090: syncing 時はヘッダーへファイル名を統合（「ファイル名 を監視中」の1行）。
                旧来の対象行（file-edit-target）はここと版数バッジが重複するため syncing では出さない。
                fil-0092: 名前部が長いと「を監視中」まで ellipsis で切れる問題を、ファイル名側のみ truncate
                するレイアウト分割＋title 属性で解消。状態語は常時可視のままにする。 */}
            {syncing ? (
              <h2 className="file-edit-head-syncing">
                <span className="file-edit-head-name" title={target.name}>
                  {target.name}
                </span>
                <span className="file-edit-head-status"> を監視中</span>
              </h2>
            ) : (
              <h2>ファイルを編集</h2>
            )}
          </div>
          <button
            type="button"
            className="file-overlay-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="file-overlay-body">
          {syncing && session ? (
            <>
              {/* fil-0090: 参考画像どおりシンプル化。ローカル/File の2ブロックと監視中ステータス行は
                  撤去し、パンくず（File 側の所在）＋版数/最終更新テーブルだけを残す。 */}
              <p className="file-edit-note">
                ローカルにダウンロードしたファイルを編集すると、自動でアップロードされます。アップロード時に版数が上がります。
              </p>
              {folderPath && <div className="file-edit-info-path">{folderPath}</div>}
              {session.status === 'uploading' || session.status === 'preparing' ? (
                <div className="file-edit-sync-status" role="status">
                  <Spinner className="h-4 w-4" />
                  <span>
                    {session.status === 'uploading'
                      ? '新しい版をアップロード中…'
                      : 'ローカルへ書き出し中…'}
                  </span>
                </div>
              ) : session.status === 'paused' ? (
                /* fil-0142: 連続失敗で停止した状態。停止理由（直近エラーメッセージ）を画面に残し、
                   フッタの「保存先を選び直す」ボタンで picker を出し直して監視再開する。トーストが
                   消えても状況が残るので、利用者はオーバーレイを見ている間いつでも復帰可能。 */
                <div className="file-edit-paused" role="status">
                  <div className="file-edit-paused-title">監視を停止しました</div>
                  <div className="file-edit-paused-reason">
                    {session.lastError ?? '自動アップロードに失敗しました'}
                  </div>
                </div>
              ) : (
                <table className="file-edit-version-table">
                  {/* fil-0092: 視覚非表示 caption＋列見出し scope で、スクリーンリーダーでのセル↔見出し
                      関連付けを安定化。簡素な画面の邪魔になるため caption は sr-only にする。 */}
                  <caption className="sr-only">版数と最終更新</caption>
                  <thead>
                    <tr>
                      <th scope="col">版数</th>
                      <th scope="col">最終更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        className={
                          isPulsingVer ? 'file-edit-ver-cell is-pulse' : 'file-edit-ver-cell'
                        }
                      >
                        {shownVersionNo ?? '—'}
                      </td>
                      <td>
                        {session.lastLocalModified != null
                          ? formatLocalModified(session.lastLocalModified)
                          : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <>
              <div className="file-edit-target">
                <span className="file-edit-name">{target.name}</span>
                {shownVersionNo != null && (
                  <span className={isPulsingVer ? 'file-edit-ver is-pulse' : 'file-edit-ver'}>
                    現在 v{shownVersionNo}
                  </span>
                )}
              </div>
              <ol className="file-edit-steps">
                <li>ファイルをダウンロードする</li>
                <li>ローカルのアプリで編集して保存する</li>
                <li>編集したファイルを再アップロードする（新しい版として保持されます）</li>
              </ol>
              <p className="file-edit-note">
                ブラウザはローカルの保存を検知できないため、編集後は手動で再アップロードしてください。
                ファイル名が変わっても同じファイルの新しい版として積まれます。
              </p>
            </>
          )}
        </div>
        <div className="file-overlay-foot">
          {syncing ? (
            // fil-0142: paused 時は「監視を停止」ではなく「保存先を選び直す」を出し、押下で
            // picker を出し直して監視を再開する。File System Access API の transient activation
            // 制約で保持 handle では自動再開できないため、明示的なユーザー操作を要求する形にする。
            // それ以外の syncing（watching / uploading / preparing）は既存通り「監視を停止」で
            // stop() を呼び、オーバーレイは呼び出し側が閉じる。
            session.status === 'paused' ? (
              <button
                type="button"
                className="fo-btn-primary"
                onClick={() => {
                  void session!.resume();
                }}
              >
                保存先を選び直す
              </button>
            ) : (
              // 停止操作であることを示す赤系の塗り（--sp-accent-red）。
              // .fo-btn-primary の他画面共有を避けるため .file-edit-stop-btn 専用。
              <button
                type="button"
                className="file-edit-stop-btn"
                onClick={() => {
                  session!.stop();
                  onClose();
                }}
              >
                監視を停止
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                className="fo-btn-ghost"
                onClick={handleDownload}
                disabled={uploading}
              >
                ダウンロード
              </button>
              <button
                type="button"
                className="fo-btn-primary"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'アップロード中…' : '再アップロード'}
              </button>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleReupload}
          aria-hidden="true"
        />
      </div>
    </OverlayDialog>
  );
}
