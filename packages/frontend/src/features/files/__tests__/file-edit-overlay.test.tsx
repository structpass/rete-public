import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// DL / 新版アップロード API・toast をモックし、編集導線（DL ボタン / 再アップ file input）を検証する。
// cmn-0147: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { downloadFile, uploadFileVersion, toastSuccess, toastError } = vi.hoisted(() => ({
  downloadFile: vi.fn(),
  uploadFileVersion: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  downloadFile: (...a: unknown[]) => downloadFile(...a),
  uploadFileVersion: (...a: unknown[]) => uploadFileVersion(...a),
}));
vi.mock('react-hot-toast', () => ({
  default: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { FileEditOverlay } from '../components/file-edit-overlay';

const target = { id: 'file-9', name: 'report.docx', versionNo: 2 };

function renderOverlay(overrides: Partial<React.ComponentProps<typeof FileEditOverlay>> = {}) {
  return render(
    <FileEditOverlay target={target} onClose={vi.fn()} onUploaded={vi.fn()} {...overrides} />,
  );
}

beforeEach(() => {
  downloadFile.mockReset().mockResolvedValue(undefined);
  uploadFileVersion.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

describe('FileEditOverlay（FF お気に入り編集）', () => {
  it('対象ファイル名と現在版・DL / 再アップボタンを表示する', () => {
    renderOverlay();
    expect(screen.getByText('report.docx')).toBeInTheDocument();
    expect(screen.getByText('現在 v2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ダウンロード' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再アップロード' })).toBeInTheDocument();
  });

  it('版が無い（versionNo=null）ファイルは現在版ラベルを出さない', () => {
    renderOverlay({ target: { id: 'file-0', name: '空.txt', versionNo: null } });
    expect(screen.queryByText(/現在 v/)).not.toBeInTheDocument();
  });

  it('ダウンロードボタンで downloadFile(id, name) を呼ぶ', async () => {
    renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: 'ダウンロード' }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith('file-9', 'report.docx'));
  });

  it('再アップロードでファイルを選ぶと uploadFileVersion(id, file) → onUploaded → onClose', async () => {
    uploadFileVersion.mockResolvedValue({ kind: 'file', id: 'file-9', versionNo: 3 });
    const onUploaded = vi.fn();
    const onClose = vi.fn();
    renderOverlay({ onUploaded, onClose });

    const file = new File(['edited'], 'report.docx');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadFileVersion).toHaveBeenCalledWith('file-9', file));
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('再アップロード失敗時は toast.error を出し閉じない', async () => {
    uploadFileVersion.mockRejectedValue(new Error('too large'));
    const onClose = vi.fn();
    renderOverlay({ onClose });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'report.docx')] } });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('背景クリックで onClose する（OverlayDialog・fil-0059）', () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.click(document.querySelector('[data-testid="overlay-backdrop"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ===== fil-0090: ヘッダー統合＋版数/最終更新テーブルへ簡素化 =====

  it('監視中はヘッダーへファイル名統合＋パンくず＋版数/最終更新テーブル＋赤停止を出す（fil-0090）', () => {
    const stop = vi.fn();
    const onClose = vi.fn();
    // 画面は mtime を閲覧者のローカル時刻で表示する仕様（../components/file-edit-overlay.tsx の formatLocalModified）。
    // 入力もローカル時刻コンストラクタで作り、下の期待値リテラルと同じ軸へ揃える＝TZ 非依存。
    // UTC リテラルで作ると JST 以外の runner（CI）でのみ 9 時間ずれて落ちる（fil-0111）。
    const lastModified = new Date(2026, 6, 17, 17, 30).getTime();
    renderOverlay({
      onClose,
      folderPath: 'Reports ＞ 2026',
      session: {
        status: 'watching',
        lastVersionNo: 3,
        lastLocalModified: lastModified,
        // fil-0142: paused 表示と resume 導線で必須。watching 時は lastError は null。
        lastError: null,
        stop,
        resume: vi.fn(),
      },
    });

    // ヘッダーへファイル名＋「を監視中」を統合（対象行の重複表示は撤去）。
    expect(screen.getByRole('heading', { name: 'report.docx を監視中' })).toBeInTheDocument();
    expect(screen.queryByText('現在 v3')).not.toBeInTheDocument();
    // 「ローカル」「File」ラベル付き情報ブロックは撤去、パンくずは単独行で残る。
    expect(screen.queryByText('ローカル')).not.toBeInTheDocument();
    expect(screen.queryByText('File')).not.toBeInTheDocument();
    expect(screen.getByText('Reports ＞ 2026')).toBeInTheDocument();
    // 監視中ステータス行は撤去され、版数/最終更新の2列テーブルに置き換わる。
    expect(screen.queryByText('ローカルの保存を監視中')).not.toBeInTheDocument();
    expect(screen.getByText('版数')).toBeInTheDocument();
    expect(screen.getByText('最終更新')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2026/07/17 17:30')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '監視を停止' }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('監視中 uploading / preparing はテーブルの代わりに状態文言を表示する（fil-0090）', () => {
    const { rerender } = renderOverlay({
      session: {
        status: 'uploading',
        lastVersionNo: 2,
        lastLocalModified: null,
        // fil-0142: paused 表示と resume 導線で必須。uploading 時は lastError は null。
        lastError: null,
        stop: vi.fn(),
        resume: vi.fn(),
      },
    });
    expect(screen.getByText('新しい版をアップロード中…')).toBeInTheDocument();
    expect(screen.queryByText('版数')).not.toBeInTheDocument();

    rerender(
      <FileEditOverlay
        target={target}
        onClose={vi.fn()}
        onUploaded={vi.fn()}
        session={{
          status: 'preparing',
          lastVersionNo: 2,
          lastLocalModified: null,
          lastError: null,
          stop: vi.fn(),
          resume: vi.fn(),
        }}
      />,
    );
    expect(screen.getByText('ローカルへ書き出し中…')).toBeInTheDocument();
    expect(screen.queryByText('版数')).not.toBeInTheDocument();
  });

  it('paused 状態では停止理由を画面に残し、「保存先を選び直す」ボタンで resume を呼ぶ（fil-0142）', () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    const lastModified = new Date(2026, 6, 17, 17, 30).getTime();
    renderOverlay({
      session: {
        status: 'paused',
        lastVersionNo: 5,
        lastLocalModified: lastModified,
        lastError: 'サーバーから Forbidden が返りました',
        stop,
        resume,
      },
    });

    // 停止状態のタイトル＋直近エラーメッセージが画面に残る（トーストが消えても状況が分かる）。
    expect(screen.getByText('監視を停止しました')).toBeInTheDocument();
    expect(screen.getByText('サーバーから Forbidden が返りました')).toBeInTheDocument();

    // フッタは「保存先を選び直す」ボタンに切り替わり、押下で resume() が呼ばれる。
    // 「監視を停止」は paused では出ない（監視中ボタンの重複を避ける）。
    expect(screen.queryByRole('button', { name: '監視を停止' })).not.toBeInTheDocument();
    const resumeBtn = screen.getByRole('button', { name: '保存先を選び直す' });
    fireEvent.click(resumeBtn);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it('paused 状態で lastError が null のときもフォールバック文言を出す（fil-0142・defensive）', () => {
    renderOverlay({
      session: {
        status: 'paused',
        lastVersionNo: 1,
        lastLocalModified: null,
        lastError: null,
        stop: vi.fn(),
        resume: vi.fn(),
      },
    });
    expect(screen.getByText('自動アップロードに失敗しました')).toBeInTheDocument();
  });
});
