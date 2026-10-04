import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flush } from '@/test-utils/flush';
import { getListColumn, getListLayoutOrder } from '@/test-utils/list-layout';
import { type InviteDto, type InviteImportResultDto, type SpaceDto, SpaceKind } from '@rete/shared';
import { InvitesScreen } from '../invites-screen';

// ── API モック ─cmn-0142: vi.hoisted 化─
const {
  mockFetchInvites,
  mockFetchMailStatus,
  mockCreateInvite,
  mockResendInvite,
  mockDeleteInvite,
  mockDownloadTemplate,
  mockImportCsv,
  mockFetchGroupSpaces,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockFetchInvites: vi.fn(),
  mockFetchMailStatus: vi.fn(),
  mockCreateInvite: vi.fn(),
  mockResendInvite: vi.fn(),
  mockDeleteInvite: vi.fn(),
  mockDownloadTemplate: vi.fn(),
  mockImportCsv: vi.fn(),
  mockFetchGroupSpaces: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock('../../lib/invites-api', () => ({
  fetchInvites: () => mockFetchInvites(),
  fetchMailStatus: () => mockFetchMailStatus(),
  createInvite: (input: unknown) => mockCreateInvite(input),
  resendInvite: (id: string) => mockResendInvite(id),
  deleteInvite: (id: string) => mockDeleteInvite(id),
  downloadInviteTemplate: () => mockDownloadTemplate(),
  importInvitesCsv: (file: File, spaceId: string) => mockImportCsv(file, spaceId),
}));

vi.mock('../../lib/spaces-api', () => ({
  fetchGroupSpaces: () => mockFetchGroupSpaces(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: (m: string) => mockToastSuccess(m), error: (m: string) => mockToastError(m) },
}));

// ── useSession モック（role を外部変数で切り替えられるようにする・set-0057）──
let mockRole = 'ADMIN';
vi.mock('@/features/auth/components/session-provider', () => ({
  useSessionContext: () => ({
    user: { id: 'u1', email: 'admin@rete.local', name: 'Admin', role: mockRole },
    loading: false,
    menuItems: [],
  }),
}));

// ロールをリセットする
beforeEach(() => {
  mockRole = 'ADMIN';
});

// ── フィクスチャ ──
const invite = (over: Partial<InviteDto>): InviteDto => ({
  id: 'inv-1',
  email: 'tanaka@struct-pass.io',
  status: 'PENDING',
  invitedAt: '2026-04-28T09:00:00.000Z',
  expiresAt: '2026-05-05T09:00:00.000Z',
  acceptedAt: null,
  invitedByName: '管理者',
  ...over,
});

const i1 = invite({ id: 'inv-1', email: 'tanaka@struct-pass.io', status: 'PENDING' });
const i2 = invite({ id: 'inv-2', email: 'suzuki@struct-pass.io', status: 'EXPIRED' });

const space1: SpaceDto = {
  id: 'space-1',
  kind: SpaceKind.GROUP,
  projectId: null,
  ownerId: null,
  peerAccountId: null,
  name: '営業部',
  sortOrder: 0,
  archived: false,
  canManageMembers: false,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

async function renderScreen() {
  render(<InvitesScreen />);
  await flush();
}

/** 共通 Select（button trigger）を開いて option を選ぶ（set-0142・task-create-overlay と同イディオム）。 */
async function pickOption(triggerLabel: string, optionName: string) {
  await userEvent.click(screen.getByLabelText(triggerLabel));
  await userEvent.click(screen.getByRole('option', { name: optionName }));
}

/** 発行フォームを開き、メール + 初期 Space を埋める。 */
async function fillIssueForm(email: string) {
  fireEvent.click(screen.getByRole('button', { name: '招待メールを発行' }));
  fireEvent.change(screen.getByLabelText('招待先メールアドレス'), { target: { value: email } });
  await pickOption('初期 Space（受諾時に参加）', '営業部');
}

describe('InvitesScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchInvites.mockResolvedValue([i1, i2]);
    mockFetchMailStatus.mockResolvedValue({ configured: true });
    mockFetchGroupSpaces.mockResolvedValue([space1]);
  });

  it('招待一覧（メール・状態バッジ）を描画する', async () => {
    await renderScreen();
    expect(screen.getByText('tanaka@struct-pass.io')).toBeInTheDocument();
    expect(screen.getByText('suzuki@struct-pass.io')).toBeInTheDocument();
    expect(screen.getAllByText('招待中').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('期限切れ').length).toBeGreaterThanOrEqual(1);
  });

  it('補助アクションと隠しファイル入力は絞り込み帯の外の独立行にある（set-0152）', async () => {
    const { container } = render(<InvitesScreen />);
    await flush();
    for (const name of ['CSV インポート', 'CSV テンプレートをダウンロード', '招待メールを発行']) {
      const action = screen.getByRole('button', { name });
      expect(action.closest('.sp-filter-bar')).toBeNull();
      expect(action.closest('.sp-list-action-row')).not.toBeNull();
    }
    // 隠し file input もアクションと同じ行へ移す（インポート操作の起点が離れないこと）。
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput!.closest('.sp-list-action-row')).not.toBeNull();
    // 検索窓は帯の中に残る（帯側のクラス名が変わって「常に null」で緑になる形を防ぐ対比）。
    expect(
      screen.getByPlaceholderText('メールアドレスで検索...').closest('.sp-filter-bar'),
    ).not.toBeNull();
    // 帰属だけでは行が表より下へ動いても緑のままなので、並び順も検査する（set-0150）。
    expect(getListLayoutOrder(container)).toEqual(['sp-filter-bar', 'sp-list-action-row', 'table']);
  });

  it('アクション行と表が同じ幅の列に収まる（v2-180）', async () => {
    const { container } = render(<InvitesScreen />);
    await flush();
    const column = getListColumn(container);
    // 表だけを絞ると右寄せのアクションが表の右端から外れる（実測 393px ずれ）ため、行と表を同じ枠へ入れる。
    expect(column?.style.maxWidth).toBe('760px');
    expect(column?.contains(container.querySelector('table'))).toBe(true);
  });

  it('上部サマリーカードを表示しない（set-0115）', async () => {
    await renderScreen();
    expect(screen.queryByText('合計')).not.toBeInTheDocument();
    // ステータスバッジ（行内）は維持される
    expect(screen.getAllByText('招待中').length).toBeGreaterThanOrEqual(1);
  });

  it('メール検索で一致する行だけ残す', async () => {
    await renderScreen();
    fireEvent.change(screen.getByPlaceholderText('メールアドレスで検索...'), {
      target: { value: 'tanaka' },
    });
    // set-0055: 一致箇所が sp-search-hl でハイライトされ text が分割されるため、
    // 完全一致テキストを持つ SPAN を狙い撃ちで探す（getByText の単純完全一致は破綻する）。
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'SPAN' && el.textContent === 'tanaka@struct-pass.io',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('suzuki@struct-pass.io')).not.toBeInTheDocument();
  });

  it('検索キーワード指定時、一覧のメールセルの一致箇所を sp-search-hl でハイライトする（set-0055）', async () => {
    const { container } = render(<InvitesScreen />);
    await flush();
    fireEvent.change(screen.getByPlaceholderText('メールアドレスで検索...'), {
      target: { value: 'tanaka' },
    });
    const marks = container.querySelectorAll('mark.sp-search-hl');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks[0].textContent).toBe('tanaka');
  });

  it('招待一覧に丸アイコン（??）と操作オーバーレイ導線が無い（set-0121）', async () => {
    await renderScreen();
    expect(screen.queryByText('??')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /の操作$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('招待の操作')).not.toBeInTheDocument();
  });

  it('検索キーワード未指定はハイライトしない（set-0055）', async () => {
    const { container } = render(<InvitesScreen />);
    await flush();
    expect(container.querySelectorAll('mark.sp-search-hl').length).toBe(0);
  });

  it('状態フィルタ「招待中」で PENDING のみ残す', async () => {
    await renderScreen();
    // mdl-0026: 絞り込みは native select → FilterChipSelect（チップ→listbox）へ移行。
    fireEvent.click(screen.getByRole('button', { name: '状態で絞り込み' }));
    fireEvent.click(screen.getByRole('option', { name: '招待中' }));
    expect(screen.getByText('tanaka@struct-pass.io')).toBeInTheDocument();
    expect(screen.queryByText('suzuki@struct-pass.io')).not.toBeInTheDocument();
  });

  it('初期 Space 未選択では発行ボタンが無効', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: '招待メールを発行' }));
    expect(screen.queryByLabelText('権限（受諾時に付与）')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('招待先メールアドレス'), {
      target: { value: 'x@example.com' },
    });
    // Space 未選択 → 送信ボタン無効
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
    // Space 選択 → 有効
    await pickOption('初期 Space（受諾時に参加）', '営業部');
    expect(screen.getByRole('button', { name: '送信' })).not.toBeDisabled();
  });

  it('発行フォームで email + Space を入れて送信すると権限なしで createInvite を呼ぶ', async () => {
    const newInvite = invite({ id: 'inv-3', email: 'new@example.com', status: 'PENDING' });
    mockCreateInvite.mockResolvedValue(newInvite);

    await renderScreen();
    await fillIssueForm('new@example.com');
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await flush();

    expect(mockCreateInvite).toHaveBeenCalledWith({
      email: 'new@example.com',
      spaceId: 'space-1',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('new@example.com'));
  });

  it('mail-status が未設定なら「招待」「インポート」を無効化しバナーを出す（論点2）', async () => {
    mockFetchMailStatus.mockResolvedValue({ configured: false });
    await renderScreen();
    expect(screen.getByText(/メール送信が未設定/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待メールを発行' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'CSV インポート' })).toBeDisabled();
  });

  it('createInvite が 503 を返すと SMTP バナーを表示し「招待」ボタンを無効化する', async () => {
    mockCreateInvite.mockRejectedValue({ response: { status: 503 } });
    await renderScreen();
    await fillIssueForm('smtp@example.com');
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await flush();

    expect(screen.getByText(/メール送信が未設定/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待メールを発行' })).toBeDisabled();
  });

  it('createInvite が 400 を返すと「既に招待中」トーストを表示する', async () => {
    mockCreateInvite.mockRejectedValue({ response: { status: 400 } });
    await renderScreen();
    await fillIssueForm('dup@example.com');
    fireEvent.click(screen.getByRole('button', { name: '送信' }));
    await flush();

    expect(mockToastError).toHaveBeenCalledWith('このメールアドレスは既に招待中です');
  });

  it('行のゴミ箱から削除確認→OK で deleteInvite を呼ぶ（set-0121）', async () => {
    mockDeleteInvite.mockResolvedValue(undefined);
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'tanaka@struct-pass.io を削除' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'OK' }));
    await flush();

    expect(mockDeleteInvite).toHaveBeenCalledWith('inv-1');
    expect(mockToastSuccess).toHaveBeenCalledWith('招待を削除しました');
  });

  it('削除確認をキャンセルすると deleteInvite を呼ばない（set-0121）', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'tanaka@struct-pass.io を削除' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'キャンセル' }),
    );
    await flush();
    expect(mockDeleteInvite).not.toHaveBeenCalled();
  });

  it('招待中の行の「メール再送」確認 OK で resendInvite を呼ぶ（set-0121）', async () => {
    const updated = { ...i1, invitedAt: '2026-05-10T09:00:00.000Z' };
    mockResendInvite.mockResolvedValue(updated);
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'tanaka@struct-pass.io をメール再送' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'OK' }));
    await flush();

    expect(mockResendInvite).toHaveBeenCalledWith('inv-1');
    expect(mockToastSuccess).toHaveBeenCalledWith('招待メールを再送しました');
  });

  it('期限切れの行にはメール再送ボタンが出ない（set-0121）', async () => {
    await renderScreen();
    expect(
      screen.queryByRole('button', { name: 'suzuki@struct-pass.io をメール再送' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'suzuki@struct-pass.io を削除' }),
    ).toBeInTheDocument();
  });

  it('resendInvite が 503 を返すと SMTP バナーを表示し「招待」ボタンを無効化する', async () => {
    mockResendInvite.mockRejectedValue({ response: { status: 503 } });
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'tanaka@struct-pass.io をメール再送' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'OK' }));
    await flush();

    expect(screen.getByText(/メール送信が未設定/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待メールを発行' })).toBeDisabled();
  });

  it('「サンプル」ボタンで downloadInviteTemplate を呼びファイルをダウンロードする', async () => {
    mockDownloadTemplate.mockResolvedValue(new Blob(['email\r\n'], { type: 'text/csv' }));
    const createUrl = vi.fn(() => 'blob:mock');
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'CSV テンプレートをダウンロード' }));
    await flush();

    expect(mockDownloadTemplate).toHaveBeenCalledTimes(1);
    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('CSV インポート設定で Space のみを選び、権限なしで importInvitesCsv を呼ぶ', async () => {
    const result: InviteImportResultDto = {
      issued: 3,
      skipped: 1,
      skippedDetails: [{ email: 'bad@x.io', reason: 'invalid_email', row: 2 }],
    };
    mockImportCsv.mockResolvedValue(result);

    await renderScreen();

    // インポート設定オーバーレイを開く。
    fireEvent.click(screen.getByRole('button', { name: 'CSV インポート' }));
    expect(screen.getByText('CSV 一括インポート')).toBeInTheDocument();
    expect(screen.queryByLabelText('権限（受諾時に付与）')).not.toBeInTheDocument();
    await pickOption('初期 Space（受諾時に参加）', '営業部');

    // 隠し file input への直接変更でインポートをトリガー。
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['email\r\ntest@x.io\r\n'], 'test.csv', { type: 'text/csv' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);
    await flush();

    expect(mockImportCsv).toHaveBeenCalledWith(file, 'space-1');
    expect(screen.getByText('CSV インポート結果')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    // 行番号 + 日本語化理由（論点4）。
    expect(screen.getByText('形式不正')).toBeInTheDocument();
    expect(screen.getByText('bad@x.io')).toBeInTheDocument();
    // 行番号列（row=2）が描画される（サマリ件数の '2' とも重複するため件数で確認）。
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    // 失敗行再投入導線。
    expect(screen.getByRole('button', { name: /失敗行を CSV でダウンロード/ })).toBeInTheDocument();
  });

  it('一覧が空の時「招待がありません」を表示する', async () => {
    mockFetchInvites.mockResolvedValue([]);
    await renderScreen();
    expect(screen.getByText('招待がありません')).toBeInTheDocument();
  });

  // 背面ボタンは OverlayDialog 表示中アクセシビリティツリーから外れる（aria-modal）ため、
  // role 検索では引けない。DOM から直接引いて disabled を確認する（set-0117 項目1）。
  const bgButton = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  it('招待発行オーバーレイ表示中は背面の操作ボタンと行操作を無効化する（set-0117 / set-0121）', async () => {
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: '招待メールを発行' }));
    expect(bgButton('CSV インポート')).toBeDisabled();
    expect(bgButton('CSV テンプレートをダウンロード')).toBeDisabled();
    // 行操作も aria-modal 背面で role 検索外 → DOM 直参照
    expect(bgButton('tanaka@struct-pass.io をメール再送')).toBeDisabled();
    expect(bgButton('tanaka@struct-pass.io を削除')).toBeDisabled();
  });

  it('MEMBER ユーザーにはタイトルのみ示し一覧・フェッチを行わない（set-0057）', async () => {
    mockRole = 'MEMBER';
    await renderScreen();
    expect(screen.getByRole('heading', { name: '招待管理' })).toBeInTheDocument();
    expect(screen.queryByText('tanaka@struct-pass.io')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '招待メールを発行' })).not.toBeInTheDocument();
    expect(screen.queryByText(/このページはシステム管理者のみ/)).not.toBeInTheDocument();
    expect(mockFetchInvites).not.toHaveBeenCalled();
    expect(mockFetchMailStatus).not.toHaveBeenCalled();
    expect(mockFetchGroupSpaces).not.toHaveBeenCalled();
  });
});
