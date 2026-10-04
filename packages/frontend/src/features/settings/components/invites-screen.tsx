'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CircleCheckBig,
  Download,
  FileText,
  Info,
  Mail,
  Plus,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { INVITE_STATUSES, Role } from '@rete/shared';
import type {
  InviteDto,
  InviteImportResultDto,
  InviteSkipDetail,
  InviteSkipReason,
  InviteStatus,
  SpaceDto,
} from '@rete/shared';
import { useSession } from '@/features/auth';
import { TableStatusRows } from './table-status-rows';
import { formatDate } from '@/lib/utils';
import {
  ActionButton,
  FormActions,
  FormButton,
  FormLabel,
  FormCard,
  ListActionRow,
  OverlayCancelButton,
  PageTitle,
  Pagination,
  RowDeleteButton,
  StatusBadge,
  TableCard,
} from './primitives';
import {
  FilterBar,
  FilterChipSelect,
  FilterClear,
  FilterSearchInput,
} from '@/components/shared/filter-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { INVITE_STATUS_LABEL, INVITE_STATUS_TONE } from '../lib/sample/invites';
import {
  createInvite,
  deleteInvite,
  downloadInviteTemplate,
  fetchInvites,
  fetchMailStatus,
  importInvitesCsv,
  resendInvite,
} from '../lib/invites-api';
import { fetchGroupSpaces } from '../lib/spaces-api';
import { extractErrorMessage } from '@/lib/error-utils';
import { OverlayDialog } from '@/components/ui/overlay-dialog';
import { useFileDownload } from '@/hooks/use-file-download';
import { saveBlobAsFile } from '@/lib/save-blob';
import { useMountedFetch } from '@/hooks/use-mounted-fetch';
import { useAsyncAction } from '@/hooks/use-async-action';
import { useDeleteConfirm } from '@/hooks/use-delete-confirm';
import { highlightMatches } from '@/lib/highlight';

// ─────────────────────────────────────────────────────────────────────────────
// 表示用ヘルパ（純関数）
// ─────────────────────────────────────────────────────────────────────────────

/** ISO 文字列 → YYYY/MM/DD は @/lib/utils の formatDate を使用（cmn-0278 で一本化）。
 *  ここにあった private な同名・別実装は取り違えの温床だったため撤去。 */

/** axios エラーから HTTP status を取り出す。 */
function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/** CSV インポートのスキップ理由を日本語に変換（論点4・set-0143: shared union で型付けし値域ズレを機械検出）。 */
const SKIP_REASON_LABEL: Record<InviteSkipReason, string> = {
  invalid_email: '形式不正',
  duplicate_pending: '有効な招待が既存',
  account_exists: '登録済み',
  mail_failed: '送信失敗',
};

/** 失敗行のメールから再投入用 CSV（ヘッダ + email 列）を組み立てる。 */
function buildRetryCsv(details: InviteSkipDetail[]): string {
  return ['email', ...details.map((d) => d.email)].join('\r\n') + '\r\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// 初期 Space 選択フィールド（招待発行 / CSV 設定で共有・set-0182）
// ─────────────────────────────────────────────────────────────────────────────

function SpaceField({
  idPrefix,
  spaces,
  spaceId,
  onSpaceChange,
  disabled,
}: {
  idPrefix: string;
  spaces: SpaceDto[];
  spaceId: string;
  onSpaceChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div style={{ marginBottom: '0.875rem' }}>
        <FormLabel htmlFor={`${idPrefix}-space`}>初期 Space（受諾時に参加）</FormLabel>
        <Select value={spaceId} onValueChange={onSpaceChange} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-space`} className="sp-select-compact">
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">選択してください</SelectItem>
            {spaces.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 招待発行フォーム（オーバーレイ）
// ─────────────────────────────────────────────────────────────────────────────

function IssueForm({
  email,
  spaceId,
  spaces,
  issuing,
  onEmailChange,
  onSpaceChange,
  onIssue,
  onCancel,
}: {
  email: string;
  spaceId: string;
  spaces: SpaceDto[];
  issuing: boolean;
  onEmailChange: (v: string) => void;
  onSpaceChange: (v: string) => void;
  onIssue: () => void;
  onCancel: () => void;
}) {
  // 発行可否: メール + 初期 Space が揃ってから（set-0182）。
  const canIssue = Boolean(email.trim() && spaceId);
  // いずれかの入力・選択がある間だけ破棄確認を挟む（mdl-0034 規約②）。
  const dirty = Boolean(email.trim() || spaceId);

  return (
    <OverlayDialog open onClose={onCancel} ariaLabel="招待メールを発行" dirty={dirty}>
      <FormCard icon={<Mail className="h-4 w-4" aria-hidden="true" />} title="招待メールを発行">
        <div style={{ marginBottom: '0.875rem' }}>
          <FormLabel htmlFor="issue-email">招待先メールアドレス</FormLabel>
          <input
            id="issue-email"
            type="email"
            value={email}
            className="sp-input"
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="invitee@example.com"
            disabled={issuing}
            style={{
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <SpaceField
          idPrefix="issue"
          spaces={spaces}
          spaceId={spaceId}
          onSpaceChange={onSpaceChange}
          disabled={issuing}
        />
        <FormActions>
          <OverlayCancelButton disabled={issuing} />
          <FormButton variant="primary" onClick={onIssue} loading={issuing} disabled={!canIssue}>
            送信
          </FormButton>
        </FormActions>
      </FormCard>
    </OverlayDialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV インポート設定フォーム（初期 Space をバッチ全行へ適用・set-0182）
// ─────────────────────────────────────────────────────────────────────────────

function ImportConfigForm({
  spaceId,
  spaces,
  importing,
  onSpaceChange,
  onPickFile,
  onCancel,
}: {
  spaceId: string;
  spaces: SpaceDto[];
  importing: boolean;
  onSpaceChange: (v: string) => void;
  onPickFile: () => void;
  onCancel: () => void;
}) {
  const canPick = Boolean(spaceId);
  // いずれかの選択がある間だけ破棄確認を挟む（mdl-0034 規約②）。
  const dirty = Boolean(spaceId);

  return (
    <OverlayDialog open onClose={onCancel} ariaLabel="CSV インポート設定" dirty={dirty}>
      <FormCard
        icon={<Upload className="h-4 w-4" aria-hidden="true" />}
        title="CSV 一括インポート"
        description="CSV の全メールアドレスへ、初期 Space を一括適用します。"
      >
        <SpaceField
          idPrefix="import"
          spaces={spaces}
          spaceId={spaceId}
          onSpaceChange={onSpaceChange}
          disabled={importing}
        />
        <FormActions>
          <OverlayCancelButton disabled={importing} />
          <FormButton
            variant="primary"
            onClick={onPickFile}
            loading={importing}
            disabled={!canPick}
          >
            CSV ファイルを選択
          </FormButton>
        </FormActions>
      </FormCard>
    </OverlayDialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV インポート結果オーバーレイ（論点4: 行番号 + 失敗行再投入）
// ─────────────────────────────────────────────────────────────────────────────

function ImportResultOverlay({
  result,
  onClose,
}: {
  result: InviteImportResultDto;
  onClose: () => void;
}) {
  // 失敗行のみを CSV で再ダウンロード → 修正して再アップロードできる導線（論点4）。
  function handleDownloadFailed() {
    const blob = new Blob([buildRetryCsv(result.skippedDetails)], { type: 'text/csv' });
    saveBlobAsFile(blob, 'invite_failed_rows.csv');
  }

  const hasSkips = result.skippedDetails.length > 0;

  return (
    <OverlayDialog open onClose={onClose} ariaLabel="CSV インポート結果" width="min(600px, 92vw)">
      <FormCard title="CSV インポート結果">
        <div
          className="text-[0.8125rem] text-[var(--sp-text-warm)]"
          style={{ marginBottom: '0.5rem' }}
        >
          <span>
            発行: <strong>{result.issued}</strong> 件
          </span>
          {result.skipped > 0 && (
            <span style={{ marginLeft: '1rem' }}>
              スキップ: <strong>{result.skipped}</strong> 件
            </span>
          )}
        </div>
        {result.issued > 0 && (
          <p className="text-xs text-[var(--sp-text-warm-mute)]" style={{ margin: '0 0 0.75rem' }}>
            成功した {result.issued} 件は登録済みです。
          </p>
        )}
        {hasSkips && (
          <div>
            <p
              className="text-xs font-semibold text-[var(--sp-text-warm-mute)]"
              style={{ marginBottom: '0.375rem' }}
            >
              スキップ詳細（行番号 = CSV の行・ヘッダ=1）
            </p>
            {/* mdl-0025: 独自 inline padding の素 table（行高約26px の別規格）を撤去し .sp-table へ収斂 */}
            <table className="sp-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', width: 56 }}>行</th>
                  <th style={{ textAlign: 'left' }}>メールアドレス</th>
                  <th style={{ textAlign: 'left', width: 140 }}>理由</th>
                </tr>
              </thead>
              <tbody>
                {result.skippedDetails.map((d) => (
                  <tr key={`${d.row}-${d.email}`}>
                    <td className="text-[var(--sp-text-warm-mute)]" style={{ textAlign: 'right' }}>
                      {d.row}
                    </td>
                    <td className="text-[var(--sp-text-warm)]">{d.email}</td>
                    <td className="text-[var(--sp-text-warm-mute)]">
                      {SKIP_REASON_LABEL[d.reason] ?? d.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '0.625rem' }}>
              <FormButton variant="secondary" onClick={handleDownloadFailed}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                失敗行を CSV でダウンロード
              </FormButton>
              <p
                className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]"
                style={{ margin: '0.375rem 0 0' }}
              >
                失敗行だけを書き出します。内容を修正して再アップロードしてください。
              </p>
            </div>
          </div>
        )}
        <FormActions>
          <FormButton variant="primary" onClick={onClose}>
            閉じる
          </FormButton>
        </FormActions>
      </FormCard>
    </OverlayDialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvitesScreen（エントリーポイント）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 招待管理画面（設定 > アカウント > 招待管理 / ST-5 Phase 2・set-0026）。
 * backend `api/v1/invites`（ADMIN 限定）に接続し、一覧表示・招待発行・再送・削除・CSV を実行する。
 * 招待発行は初期 Space のみを指定し、SMTP 未設定時は事前ブロック（論点2）する。
 * 受諾エンドポイントは公開ページ（/invite/accept）側が担う。
 */
export function InvitesScreen() {
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === Role.ADMIN;

  const [invites, setInvites] = useState<InviteDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** SMTP 未設定（mail-status configured=false / 503）なら true。発行 UI を graceful に無効化する。 */
  const [smtpDisabled, setSmtpDisabled] = useState(false);
  /** set-0126: SMTP が Mailpit 等のローカル catch-all を指しているか。true の時、開発環境案内バナーを表示。 */
  const [smtpCatchAll, setSmtpCatchAll] = useState(false);

  // ── 発行に使う初期 Space の候補（set-0182）──
  const [spaces, setSpaces] = useState<SpaceDto[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InviteStatus>('all');

  // ── 招待発行フォーム ──
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueEmail, setIssueEmail] = useState('');
  const [issueSpaceId, setIssueSpaceId] = useState('');
  const [issuing, setIssuing] = useState(false);

  // ── 行アクション（削除 / 再送・set-0121 で行直置き）──
  const [acting, setActing] = useState(false);
  const [resendTarget, setResendTarget] = useState<InviteDto | null>(null);

  // ── CSV インポート ──
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSpaceId, setImportSpaceId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<InviteImportResultDto | null>(null);

  // ── CSV テンプレDL ──
  const { downloading: exporting, download } = useFileDownload();

  // モーダル表示中は背面の操作ボタンと行操作を無効化（set-0117 項目1 / set-0121）
  const overlayOpen = issueOpen || importOpen || importResult !== null;

  const { run } = useAsyncAction();

  // ── 初回ロード（一覧 / SMTP 状態 / GROUP Space）──
  // 一覧(fetchInvites)を主、SMTP/Space を補助とし allSettled で分離する。
  // 補助 API の一時障害が一覧閲覧ごと潰すのを防ぐ（code-review HIGH）。補助が落ちた時は
  // 該当 UI を degraded（選択肢空・SMTP 既定有効扱い）にしつつトーストで警告する。
  useMountedFetch(
    async (alive) => {
      if (!isAdmin) return; // set-0057: 非 ADMIN はフェッチしない
      try {
        const list = await fetchInvites();
        if (alive()) setInvites(list);
      } catch {
        if (alive()) toast.error('招待一覧の読み込みに失敗しました');
      }

      const [mailRes, spaceRes] = await Promise.allSettled([fetchMailStatus(), fetchGroupSpaces()]);
      if (!alive()) return;
      if (mailRes.status === 'fulfilled') {
        setSmtpDisabled(!mailRes.value.configured);
        // set-0126: 開発環境案内バナーの表示判定。configured とは独立。
        setSmtpCatchAll(!!mailRes.value.catchAll);
      }
      if (spaceRes.status === 'fulfilled') setSpaces(spaceRes.value);
      if (spaceRes.status === 'rejected' || mailRes.status === 'rejected') {
        toast.error(
          '一部の設定情報の取得に失敗しました（招待発行に必要な項目が表示されない場合があります）',
        );
      }

      if (alive()) setIsLoading(false);
    },
    [isAdmin],
  );

  // ── フィルタ済み行 ──
  const rows = useMemo(() => {
    const byStatus =
      statusFilter === 'all' ? invites : invites.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    return q ? byStatus.filter((r) => r.email.toLowerCase().includes(q)) : byStatus;
  }, [invites, statusFilter, search]);

  const rowsPending = rows.filter((r) => r.status === 'PENDING').length;
  const rowsExpired = rows.filter((r) => r.status === 'EXPIRED').length;

  function resetIssueForm() {
    setIssueEmail('');
    setIssueSpaceId('');
  }

  // ── 招待発行 ──
  async function handleIssue() {
    const email = issueEmail.trim();
    if (!email || !issueSpaceId) return;
    await run(
      async () => {
        const created = await createInvite({
          email,
          spaceId: issueSpaceId,
        });
        setInvites((cur) => [created, ...cur]);
        toast.success(`${email} へ招待メールを送信しました`);
        setIssueOpen(false);
        resetIssueForm();
      },
      {
        onBusyChange: setIssuing,
        onError: (err) => {
          const status = httpStatus(err);
          if (status === 503) {
            setSmtpDisabled(true);
            toast.error('メールサーバーが設定されていないため招待を送信できません');
            setIssueOpen(false);
            resetIssueForm();
          } else if (status === 400) {
            toast.error('このメールアドレスは既に招待中です');
          } else {
            toast.error(extractErrorMessage(err, '招待の発行に失敗しました'));
          }
        },
      },
    );
  }

  // ── 再送（set-0121: 行の確認 OK 後）──
  async function handleResend(invite: InviteDto) {
    await run(
      async () => {
        const updated = await resendInvite(invite.id);
        setInvites((cur) => cur.map((inv) => (inv.id === updated.id ? updated : inv)));
        toast.success('招待メールを再送しました');
        setResendTarget(null);
      },
      {
        onBusyChange: setActing,
        onError: (err) => {
          const status = httpStatus(err);
          if (status === 503) {
            setSmtpDisabled(true);
            toast.error('メールサーバーが設定されていないため招待を送信できません');
            setResendTarget(null);
          } else {
            toast.error(extractErrorMessage(err, '再送に失敗しました'));
          }
        },
      },
    );
  }

  // ── 削除（set-0121: 行の確認 OK 後 / cmn-0112: 状態+実行を useDeleteConfirm へ共通化）──
  const { deleteTarget, setDeleteTarget, handleDelete } = useDeleteConfirm<InviteDto>({
    remove: async (id) => {
      let ok = false;
      await run(
        async () => {
          await deleteInvite(String(id));
          ok = true;
        },
        {
          onBusyChange: setActing,
          onError: (err) => toast.error(extractErrorMessage(err, '削除に失敗しました')),
        },
      );
      return ok;
    },
    onSuccess: (id) => {
      setInvites((cur) => cur.filter((inv) => inv.id !== id));
      toast.success('招待を削除しました');
    },
  });

  // ── CSV テンプレートダウンロード ──
  async function handleTemplateDownload() {
    await download(() => downloadInviteTemplate(), 'invite_template.csv', {
      onError: (err) =>
        toast.error(extractErrorMessage(err, 'テンプレートのダウンロードに失敗しました')),
    });
  }

  // ── CSV インポート（初期 Space は設定フォームで選択済み・set-0182）──
  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // 同じファイルを再選択しても onChange が発火するよう value をリセット。
    e.target.value = '';
    if (!importSpaceId) return;
    await run(
      async () => {
        const result = await importInvitesCsv(file, importSpaceId);
        // 発行された招待を反映するため一覧を再取得。
        const list = await fetchInvites();
        setInvites(list);
        setImportOpen(false);
        setImportSpaceId('');
        setImportResult(result);
      },
      {
        onBusyChange: setImporting,
        onError: (err) => toast.error(extractErrorMessage(err, 'CSV インポートに失敗しました')),
      },
    );
  }

  // ── 権限ガード（set-0057: organizations-screen と同型・タイトルのみ表示） ──
  if (sessionLoading) return null;
  if (!isAdmin) {
    return (
      <main className="sp-page" style={{ overflowY: 'auto' }}>
        <PageTitle title="招待管理" />
      </main>
    );
  }

  return (
    <main className="sp-page" style={{ overflowY: 'auto' }}>
      <PageTitle title="招待管理" />

      {/* SMTP 未設定バナー（mail-status configured=false / 503 受信後に表示・論点2） */}
      {smtpDisabled && (
        <div
          className="sp-card"
          style={{
            padding: '0.625rem 0.75rem',
            marginBottom: '0.75rem',
            background: 'hsl(var(--warning) / 0.10)',
            borderColor: 'hsl(var(--warning) / 0.35)',
          }}
        >
          <div
            className="text-[0.8125rem] text-[hsl(var(--warning))]"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              メール送信が未設定のため招待を送れません。管理者に SMTP 設定を依頼してください。
            </span>
          </div>
        </div>
      )}

      {/* set-0126: 開発環境案内バナー。SMTP_HOST が localhost 系（Mailpit 等ローカル catch-all）の時のみ表示。 */}
      {!smtpDisabled && smtpCatchAll && (
        <div
          className="sp-card"
          style={{
            padding: '0.625rem 0.75rem',
            marginBottom: '0.75rem',
            background: 'hsl(var(--info) / 0.08)',
            borderColor: 'hsl(var(--info) / 0.4)',
          }}
        >
          <div
            // cmn-0334: 文字に --info そのものを使うと白カード上 4.27:1 で AA に届かない。バナーは開発時のみ
            // 表示で、地の色と枠線で情報色の印象は保たれるため、本文色（--sp-text-warm）へ寄せる。
            className="text-[0.8125rem] text-[var(--sp-text-warm)]"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              開発環境のため、送信された招待メールは実受信箱に届きません。Mailpit（http://localhost:8025）で内容を確認できます。
            </span>
          </div>
        </div>
      )}

      {/* フィルタバー */}
      <FilterBar>
        <FilterSearchInput
          placeholder="メールアドレスで検索..."
          value={search}
          onChange={setSearch}
        />
        <FilterChipSelect
          icon={CircleCheckBig}
          label="状態"
          ariaLabel="状態で絞り込み"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'すべて' },
            ...INVITE_STATUSES.map((s) => ({ value: s, label: INVITE_STATUS_LABEL[s] })),
          ]}
        />
        <FilterClear
          onClick={() => {
            setSearch('');
            setStatusFilter('all');
          }}
        />
      </FilterBar>

      {/* set-0152: アクションは帯の外の独立行へ。隠し file input も操作の一部なので同じ行へ移す。
          v2-180: 表を内容に合う幅へ絞り左寄せにする。表だけを絞ると右寄せのアクション行はページ全幅のままなので、
          インポート/サンプル/招待のボタンが表の右端から外れて宙に浮く（実測 393px ずれ）。
          アクション行と TableCard を同じ max-width の枠へ入れて右端を揃える（実測: 自然幅721px・700px で折り返しなし）。 */}
      <div style={{ maxWidth: 760 }}>
        <ListActionRow>
          {/* 隠し file input（CSV インポート・設定フォームの「選択」から起動） */}
          <input
            ref={importInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            aria-hidden="true"
            onChange={handleImportFileChange}
          />
          <ActionButton
            icon={<Upload className="h-3.5 w-3.5" aria-hidden="true" />}
            ariaLabel="CSV インポート"
            onClick={() => {
              setImportSpaceId('');
              setImportOpen(true);
            }}
            disabled={overlayOpen || smtpDisabled}
            loading={importing}
          >
            インポート
          </ActionButton>
          <ActionButton
            icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
            ariaLabel="CSV テンプレートをダウンロード"
            onClick={handleTemplateDownload}
            disabled={overlayOpen || exporting}
          >
            サンプル
          </ActionButton>
          <ActionButton
            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            ariaLabel="招待メールを発行"
            onClick={() => {
              resetIssueForm();
              setIssueOpen(true);
            }}
            disabled={overlayOpen || smtpDisabled}
          >
            招待
          </ActionButton>
        </ListActionRow>

        {/* テーブル */}
        <TableCard hoverBand>
          <table className="sp-table sp-table--hoverband">
            <thead>
              <tr>
                <th>メールアドレス</th>
                <th style={{ width: 120 }}>状態</th>
                <th style={{ width: 110 }}>招待日</th>
                <th style={{ width: 110 }}>有効期限</th>
                <th style={{ width: 120 }}>発行者</th>
                {/* set-0121: 操作列はヘッダ無し（メール再送・削除） */}
                <th style={{ width: 168, textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isPending = row.status === 'PENDING';
                const isExpired = row.status === 'EXPIRED';
                const textColor = isExpired ? 'var(--sp-text-warm-mute)' : 'var(--sp-text-warm-2)';
                // 発行/インポート系オーバーレイ中・処理中は行操作を抑止（set-0121）
                const rowOpsDisabled = acting || overlayOpen;

                return (
                  <tr key={row.id} className="sp-row-pillable">
                    {/* メールアドレス列（set-0121: ?? 丸アイコン撤去・テキストのみ） */}
                    <td>
                      <span
                        style={{
                          color: isExpired ? 'var(--sp-text-warm-mute)' : 'var(--sp-text-warm)',
                        }}
                      >
                        {highlightMatches(row.email, search)}
                      </span>
                    </td>

                    {/* 状態バッジ（set-0124: 明細中央寄せ） */}
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge tone={INVITE_STATUS_TONE[row.status]}>
                        {INVITE_STATUS_LABEL[row.status]}
                      </StatusBadge>
                    </td>

                    {/* 招待日 */}
                    <td style={{ color: textColor }}>{formatDate(row.invitedAt)}</td>

                    {/* 有効期限 */}
                    <td style={{ color: textColor }}>{formatDate(row.expiresAt)}</td>

                    {/* 発行者 */}
                    <td style={{ color: textColor }}>{row.invitedByName}</td>

                    {/* 行操作: メール再送（招待中のみ）+ ゴミ箱削除（set-0121） */}
                    <td style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '0.375rem',
                        }}
                      >
                        {isPending && (
                          <button
                            type="button"
                            aria-label={`${row.email} をメール再送`}
                            disabled={rowOpsDisabled || smtpDisabled}
                            onClick={() => setResendTarget(row)}
                            className="sp-action-btn invite-resend-btn"
                            // set-0136: 寸法・字重は .invite-resend-btn（inline 撤去）。
                          >
                            メール再送
                          </button>
                        )}
                        {/* set-0144: ad-hoc Tailwind 直組みを廃し、permissions と同じ RowDeleteButton へ統一 */}
                        <RowDeleteButton
                          label={`${row.email} を削除`}
                          disabled={rowOpsDisabled}
                          onClick={() => setDeleteTarget(row)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}

              <TableStatusRows
                colSpan={6}
                isLoading={isLoading}
                empty={rows.length === 0}
                emptyLabel={search ? '招待が見つかりませんでした' : '招待がありません'}
              />
            </tbody>
          </table>

          <Pagination
            total={`全 ${rows.length} 件 (招待中 ${rowsPending} / 期限切れ ${rowsExpired})`}
          />
        </TableCard>
      </div>

      {/* 招待発行フォームオーバーレイ */}
      {issueOpen && (
        <IssueForm
          email={issueEmail}
          spaceId={issueSpaceId}
          spaces={spaces}
          issuing={issuing}
          onEmailChange={setIssueEmail}
          onSpaceChange={setIssueSpaceId}
          onIssue={handleIssue}
          onCancel={() => {
            setIssueOpen(false);
            resetIssueForm();
          }}
        />
      )}

      {/* CSV インポート設定オーバーレイ（初期 Space 選択 → ファイル選択・set-0182） */}
      {importOpen && (
        <ImportConfigForm
          spaceId={importSpaceId}
          spaces={spaces}
          importing={importing}
          onSpaceChange={setImportSpaceId}
          onPickFile={() => importInputRef.current?.click()}
          onCancel={() => {
            setImportOpen(false);
            setImportSpaceId('');
          }}
        />
      )}

      {/* set-0121: 再送確認（非破壊・AlertDialog） */}
      <ConfirmDialog
        open={resendTarget !== null}
        message={
          resendTarget
            ? `${resendTarget.email} へ招待メールを再送しますか？現在の招待リンクを同じ宛先へ再通知します。`
            : '招待メールを再送しますか？'
        }
        destructive={false}
        busy={acting}
        onConfirm={() => {
          if (resendTarget && !acting) void handleResend(resendTarget);
        }}
        onCancel={() => setResendTarget(null)}
      />

      {/* 削除確認（共通 ConfirmDialog） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        busy={acting}
        message={
          deleteTarget
            ? `${deleteTarget.email} の招待を削除しますか？削除するとリンクが無効になります。`
            : '削除しますか？'
        }
        destructive
        onConfirm={() => {
          if (!acting) void handleDelete();
        }}
        onCancel={() => {
          if (!acting) setDeleteTarget(null);
        }}
      />

      {/* CSV インポート結果オーバーレイ */}
      {importResult && (
        <ImportResultOverlay result={importResult} onClose={() => setImportResult(null)} />
      )}
    </main>
  );
}
