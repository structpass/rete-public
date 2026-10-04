import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import type { UseTagMasterResult } from '@/hooks/use-tag-master';
import { TagMasterOverlay } from '../tag-master-overlay';

// hom-0089: 一覧⇔フォーム（hom-0085）のビュー切替を TagMasterOverlay 単体で直接検証する。
// 既存の announcement-tag-master-overlay.test.tsx は TagMasterOverlay をスタブ化しており内部の
// view state 遷移は未検証だったため、本ファイルでコンポーネントを直接レンダリングして補う。

function buildMaster(overrides: Partial<UseTagMasterResult> = {}): UseTagMasterResult {
  return {
    tags: [],
    loading: false,
    error: false,
    mutating: false,
    reload: vi.fn(),
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as UseTagMasterResult;
}

describe('TagMasterOverlay — 一覧⇔フォームのビュー切替（hom-0085・hom-0089 単体検証）', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('新規登録→保存すると create が呼ばれ一覧ビューへ戻る', async () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    expect(screen.getByRole('heading', { name: 'タグ登録' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('タグ名'), { target: { value: '新規タグ' } });
    // hom-0093: 非同期の handleSubmit/resetForm の state 更新を act 内へ収め「not wrapped in act」警告を防ぐ。
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });

    await vi.waitFor(() =>
      expect(master.create).toHaveBeenCalledWith(
        '新規タグ',
        expect.any(String),
        expect.any(String),
      ),
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'タグ登録' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument();
  });

  it('編集開始で選択タグの初期値（名前/アイコン/色）がフォームに反映される', () => {
    const master = buildMaster({
      tags: [{ id: 't1', name: '元タグ', icon: 'Star', color: 'blue' }],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '元タグ を編集' }));

    expect(screen.getByRole('heading', { name: 'タグ編集' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('タグ名')).toHaveValue('元タグ');
    expect(screen.getByRole('radio', { name: 'Star' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'blue' })).toHaveAttribute('aria-checked', 'true');
  });

  it('入力ありのキャンセルは破棄確認を挟み、OK で一覧ビューへ戻る（mdl-0034 規約②）', async () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    fireEvent.change(screen.getByPlaceholderText('タグ名'), {
      target: { value: '破棄される入力' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    // 変更ありは即破棄せず確認ダイアログを出す。
    expect(screen.getByRole('heading', { name: 'タグ登録' })).toBeInTheDocument();
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('heading', { name: 'タグ登録' })).not.toBeInTheDocument();
    expect(master.create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    expect(screen.getByPlaceholderText('タグ名')).toHaveValue('');
  });

  it('未入力のキャンセルは確認なしで一覧ビューへ戻る', () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'タグ登録' })).not.toBeInTheDocument();
  });

  it('Esc は 2段階で閉じる（フォーム→一覧→onClose・fil-0081 OverlayDialog 移行で発火先を window → ダイアログ本体へ）', () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    expect(screen.getByRole('heading', { name: 'タグ登録' })).toBeInTheDocument();

    // OverlayDialog の onKeyDown は panel element（role="dialog"）側で受けるためテストも同要素へ発火。
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'タグ登録' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dirty フォームで Esc を押すと破棄確認を挟み、OK で一覧ビューへ戻る（fil-0081 OverlayDialog 統一挙動）', async () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    fireEvent.change(screen.getByPlaceholderText('タグ名'), {
      target: { value: '破棄される入力' },
    });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    // 確認は OverlayDialog 内の DiscardConfirmDialog がダイアログ本体と並ぶため alertdialog で拾う。
    expect(screen.getByRole('heading', { name: 'タグ登録' })).toBeInTheDocument();
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('heading', { name: 'タグ登録' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('dirty フォームで Esc の確認後にキャンセルを押すとフォームに留まる', async () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    fireEvent.change(screen.getByPlaceholderText('タグ名'), { target: { value: '残る入力' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    const confirm = await screen.findByRole('alertdialog');
    // フォーム側のキャンセルと破棄確認側のキャンセルが同名のため、confirm dialog 内でスコープを絞る。
    fireEvent.click(within(confirm).getByRole('button', { name: 'キャンセル' }));

    // 確認閉じ → フォーム継続
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'タグ登録' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('タグ名')).toHaveValue('残る入力');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('背景クリックはフォーム dirty 時に破棄確認を挟む（fil-0081 OverlayDialog 統一挙動）', async () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    fireEvent.change(screen.getByPlaceholderText('タグ名'), { target: { value: '破棄される' } });

    fireEvent.click(screen.getByTestId('overlay-backdrop'));

    await screen.findByRole('alertdialog');
    expect(onClose).not.toHaveBeenCalled();
    // 確認は OK で完了 → resetForm（一覧ビューへ戻る）
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('heading', { name: 'タグ登録' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('読み込み中は共通 Spinner を中央表示する（hom-0102）', () => {
    const master = buildMaster({ loading: true });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument();
  });
});

describe('TagMasterOverlay — archiveFilter 提供時のフィルタ行/新規登録の段分け（hom-0135）', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('新規登録ボタンはフィルタ行に同居せず、右寄せの独立行（tag-master-list-actions--end）に1個だけ存在する', () => {
    const master = buildMaster();
    render(
      <TagMasterOverlay
        master={master}
        onClose={onClose}
        archiveFilter={{ value: false, onChange: vi.fn() }}
      />,
    );

    // OverlayDialog は createPortal で document.body 直下に描画するため RTL container ではなく document を見る。
    const filterRow = document.querySelector('.tag-master-filter-row');
    expect(filterRow).not.toBeNull();
    expect(
      within(filterRow as HTMLElement).queryByRole('button', { name: '新規登録' }),
    ).not.toBeInTheDocument();

    const actionsRow = document.querySelector(
      '.tag-master-list-actions.tag-master-list-actions--end',
    );
    expect(actionsRow).not.toBeNull();
    expect(
      within(actionsRow as HTMLElement).getByRole('button', { name: '新規登録' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '新規登録' })).toHaveLength(1);
  });

  it('独立行の新規登録ボタンをクリックするとフォームビューへ遷移する', () => {
    const master = buildMaster();
    render(
      <TagMasterOverlay
        master={master}
        onClose={onClose}
        archiveFilter={{ value: false, onChange: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新規登録' }));
    expect(screen.getByRole('heading', { name: 'タグ登録' })).toBeInTheDocument();
  });

  it('File タグ管理（archiveFilter 無し）も右寄せ（fil-0093: Hub と同じ位置に揃える）', () => {
    const master = buildMaster();
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    const actionsRow = document.querySelector('.tag-master-list-actions');
    expect(actionsRow).not.toBeNull();
    expect(actionsRow).toHaveClass('tag-master-list-actions--end');
  });

  it('File 経路のフィルタ行には Archive chip が描画されない（fil-0093: archived 概念無し）', () => {
    const master = buildMaster({
      tags: [{ id: 't1', name: 'ファイルタグ', icon: 'Star', color: 'blue' }],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    expect(screen.getByRole('searchbox', { name: 'タグ名で検索' })).toBeInTheDocument();
    // Archive chip のラベル文言 "アーカイブ" は archiveFilter 提供時の ToggleFilter 専用。
    expect(screen.queryByText('アーカイブ')).not.toBeInTheDocument();
  });

  it('File 経路でも共通テーブル意匠で表示される（fil-0093）', () => {
    const master = buildMaster({
      tags: [{ id: 't1', name: 'ファイルタグ', icon: 'Star', color: 'blue' }],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    expect(document.querySelector('.tag-master-table-wrap .tag-master-table')).not.toBeNull();
    // 行毎のアーカイブボタンは File 経路では描画されない（archived 列が無い backend への空振り防止）。
    expect(
      screen.queryByRole('button', { name: 'ファイルタグ をアーカイブ' }),
    ).not.toBeInTheDocument();
    // 編集 / 削除ボタンは従来通り。
    expect(screen.getByRole('button', { name: 'ファイルタグ を編集' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ファイルタグ を削除' })).toBeInTheDocument();
  });

  it('File 経路で検索ボックスにキーワード入力で table が絞り込まれる（fil-0093）', () => {
    const master = buildMaster({
      tags: [
        { id: 't1', name: '契約', icon: 'Star', color: 'blue' },
        { id: 't2', name: 'Confidential', icon: 'Star', color: 'red' },
        { id: 't3', name: 'urgent', icon: 'Star', color: 'amber' },
      ],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'タグ名で検索' }), {
      target: { value: 'con' },
    });

    expect(screen.queryByRole('button', { name: '契約 を編集' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confidential を編集' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'urgent を編集' })).not.toBeInTheDocument();
  });

  it('File 経路でクリアボタン押下するとキーワードが空に戻り全件表示（fil-0093）', () => {
    const master = buildMaster({
      tags: [
        { id: 't1', name: '契約', icon: 'Star', color: 'blue' },
        { id: 't2', name: 'Confidential', icon: 'Star', color: 'red' },
      ],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'タグ名で検索' }), {
      target: { value: 'con' },
    });
    expect(screen.queryByRole('button', { name: '契約 を編集' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '検索をクリア' }));
    expect(screen.getByRole('searchbox', { name: 'タグ名で検索' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '契約 を編集' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confidential を編集' })).toBeInTheDocument();
  });

  it('File 経路でキーワードに一致が無い時は「検索条件に一致するタグがありません」を表示（fil-0093）', () => {
    const master = buildMaster({
      tags: [{ id: 't1', name: '契約', icon: 'Star', color: 'blue' }],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'タグ名で検索' }), {
      target: { value: 'xyz' },
    });
    expect(screen.getByText('検索条件に一致するタグがありません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '契約 を編集' })).not.toBeInTheDocument();
  });
});

// cmn-0384 項目6: 削除ダイアログのフロー（確定成功・remove 失敗・キャンセル）を component テストで固定する。
// フック単体契約は use-delete-confirm.test.tsx が持つが、本コンポーネント固有の配線（setPendingDelete の
// オブジェクト化・close-first・onSuccess の resetForm 分岐）は未カバーだった（cmn-0356 検証指摘）。
describe('TagMasterOverlay — 削除フロー 3 経路（cmn-0384・close-first 配線）', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('削除ボタン → 確定で remove が呼ばれ、確定直後にダイアログが閉じる（close-first）', async () => {
    let resolveRemove!: (v: boolean) => void;
    const master = buildMaster({
      tags: [{ id: 't1', name: '契約', icon: 'Star', color: 'blue' }],
      remove: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveRemove = resolve;
          }),
      ),
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '契約 を削除' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('タグ「契約」を削除しますか？元に戻せません。');

    fireEvent.click(within(confirm).getByRole('button', { name: 'OK' }));
    // remove が未解決の間も、確定直後にダイアログは閉じている（close-first・cmn-0352 リポ既定）。
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(master.remove).toHaveBeenCalledWith('t1');

    await act(async () => {
      resolveRemove(true);
    });
    // 削除完了後も一覧ビューのまま（フォームへ遷移しない）。
    expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument();
  });

  it('remove 失敗でもダイアログは閉じたまま（失敗の通知はトーストに委譲）', async () => {
    const master = buildMaster({
      tags: [{ id: 't1', name: '契約', icon: 'Star', color: 'blue' }],
      remove: vi.fn().mockResolvedValue(false),
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '契約 を削除' }));
    const confirm = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'OK' }));
    });

    expect(master.remove).toHaveBeenCalledWith('t1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    // 行は残ったまま（削除されていない）＝失敗時に一覧から消えない。
    expect(screen.getByRole('button', { name: '契約 を削除' })).toBeInTheDocument();
  });

  it('キャンセルで remove は呼ばれずダイアログだけ閉じる', async () => {
    const master = buildMaster({
      tags: [{ id: 't1', name: '契約', icon: 'Star', color: 'blue' }],
    });
    render(<TagMasterOverlay master={master} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '契約 を削除' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'キャンセル' }));

    expect(master.remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '契約 を削除' })).toBeInTheDocument();
  });
});
