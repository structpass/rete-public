'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Globe, Info, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import type { IpWhitelistEntryDto, IpWhitelistEntryInput, PasswordPolicyDto } from '@rete/shared';
import { PASSWORD_MIN_LENGTH_CEIL, PASSWORD_MIN_LENGTH_FLOOR, Role } from '@rete/shared';
import { FormActions, FormButton, FormCard, FormLabel, PageTitle } from './primitives';
import { useSessionContext } from '@/features/auth/components/session-provider';
import { Spinner } from '@/components/ui/spinner';
import {
  fetchIpWhitelist,
  fetchPasswordPolicy,
  saveIpWhitelist,
  savePasswordPolicy,
} from '../lib/login-settings-api';
import {
  confirmMfa,
  disableMfa,
  fetchMfaStatus,
  regenerateBackupCodes,
  setupMfa,
} from '../lib/mfa-api';
import { useMountedFetch } from '@/hooks/use-mounted-fetch';
import { useAsyncAction } from '@/hooks/use-async-action';
import { extractValidationErrorMessage } from '@/lib/error-utils';

// ─── 純関数ヘルパ ────────────────────────────────────────────────────────────

/** IP エントリ配列 → textarea 文字列（"CIDR,備考" / 備考空は CIDR のみ・1 行 1 件）。 */
function serializeEntries(entries: IpWhitelistEntryDto[]): string {
  return entries.map((e) => (e.note ? `${e.cidr},${e.note}` : e.cidr)).join('\n');
}

/** textarea 文字列 → IP エントリ入力配列（空行除去・最初の ',' で CIDR/備考 分割・両端 trim）。 */
function parseEntries(text: string): IpWhitelistEntryInput[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(',');
      const cidr = (i < 0 ? line : line.slice(0, i)).trim();
      const note = (i < 0 ? '' : line.slice(i + 1)).trim();
      return { cidr, note };
    });
}

/** 必須文字種チェックボックスの定義（label/notation 表示 ↔ DTO bool フィールドの写像）。 */
const CHAR_REQUIREMENTS: {
  key: 'requireUppercase' | 'requireLowercase' | 'requireNumber' | 'requireSymbol';
  label: string;
  notation: string;
}[] = [
  { key: 'requireUppercase', label: '大文字英字', notation: 'A-Z' },
  { key: 'requireLowercase', label: '小文字英字', notation: 'a-z' },
  { key: 'requireNumber', label: '数字', notation: '0-9' },
  { key: 'requireSymbol', label: '記号', notation: '!@#$%^&*…' },
];

// ─── Local: チェックボックス行 ──────────────────────────────────────────────

function CheckboxRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className="text-[0.8125rem] text-[var(--sp-text-warm)]"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.375rem 0.625rem',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background-color 0.12s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLLabelElement).style.backgroundColor = 'var(--sp-accent-soft)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLLabelElement).style.backgroundColor = '';
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 16,
          height: 16,
          accentColor: 'var(--sp-accent-ink)',
          cursor: 'pointer',
        }}
      />
      {children}
    </label>
  );
}

// ─── Local: インフォバナー / 警告バナー ─────────────────────────────────────

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]"
      style={{
        marginTop: '0.625rem',
        padding: '0.625rem 0.75rem',
        background: 'var(--sp-paper)',
        borderRadius: '0.375rem',
        display: 'flex',
        gap: '0.375rem',
        alignItems: 'flex-start',
      }}
    >
      <Info className="h-3 w-3" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[0.6875rem] text-[var(--sp-text-warm)]"
      style={{
        marginTop: '0.625rem',
        padding: '0.625rem 0.75rem',
        background: 'hsl(var(--warning) / 0.10)',
        border: '1px solid hsl(var(--warning) / 0.35)',
        borderRadius: '0.375rem',
        display: 'flex',
        gap: '0.375rem',
        alignItems: 'flex-start',
      }}
    >
      <AlertTriangle
        className="h-3 w-3 text-[hsl(var(--warning))]"
        style={{ flexShrink: 0, marginTop: 1 }}
        aria-hidden="true"
      />
      <span>{children}</span>
    </div>
  );
}

// ─── Local: モノスペースコードスパン ─────────────────────────────────────────

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-[0.6875rem]"
      style={{
        background: 'var(--sp-paper-2)',
        padding: '1px 4px',
        borderRadius: 3,
        fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
      }}
    >
      {children}
    </code>
  );
}

// ─── §1 パスワードポリシーセクション ────────────────────────────────────────

function PasswordPolicySection() {
  // set-0057: テナント全体ポリシーの編集は ADMIN 限定（MfaEnforcementRow と同型のセクション単位ガード）。
  const { user } = useSessionContext();
  const isAdmin = user?.role === Role.ADMIN;
  const [policy, setPolicy] = useState<PasswordPolicyDto | null>(null);
  const [saving, setSaving] = useState(false);
  const { run } = useAsyncAction();

  useMountedFetch(
    async (alive) => {
      if (!isAdmin) return;
      try {
        const p = await fetchPasswordPolicy();
        if (alive()) setPolicy(p);
      } catch {
        if (alive()) toast.error('パスワードポリシーの読み込みに失敗しました');
      }
    },
    [isAdmin],
  );

  if (!isAdmin) return null;

  const setField = (key: keyof PasswordPolicyDto, v: boolean | number) =>
    setPolicy((cur) => (cur ? { ...cur, [key]: v } : cur));

  async function handleSave() {
    if (!policy || saving) return;
    await run(
      async () => {
        const clamped = Math.min(
          PASSWORD_MIN_LENGTH_CEIL,
          Math.max(
            PASSWORD_MIN_LENGTH_FLOOR,
            Number.isFinite(policy.minLength) ? policy.minLength : 8,
          ),
        );
        const saved = await savePasswordPolicy({ ...policy, minLength: clamped });
        setPolicy(saved);
        toast.success('パスワードポリシーを保存しました');
      },
      {
        onBusyChange: setSaving,
        onError: () => toast.error('パスワードポリシーの保存に失敗しました'),
      },
    );
  }

  return (
    <FormCard
      icon={<KeyRound className="h-4 w-4" />}
      title="パスワードポリシー"
      description="新規パスワード設定時に必ず満たすべき文字種と長さを定義します。"
    >
      <FormLabel>必須文字種（チェックした種別を 1 文字以上含むことを必須とする）</FormLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '1rem' }}>
        {CHAR_REQUIREMENTS.map((req) => (
          <CheckboxRow
            key={req.key}
            checked={policy ? policy[req.key] : false}
            onChange={(v) => setField(req.key, v)}
          >
            {req.label}{' '}
            <span
              className="text-[var(--sp-text-warm-mute)] text-[0.6875rem]"
              style={{
                fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
              }}
            >
              {req.notation}
            </span>
          </CheckboxRow>
        ))}
      </div>

      <FormLabel>最小桁数</FormLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="number"
          className="sp-input"
          aria-label="最小桁数"
          min={PASSWORD_MIN_LENGTH_FLOOR}
          max={PASSWORD_MIN_LENGTH_CEIL}
          value={policy ? policy.minLength : ''}
          onChange={(e) => setField('minLength', Number(e.target.value))}
          style={{
            /* set-0113: 数値入力の標準幅 4rem（set-0094 の 3.75rem を標準値へ揃える） */
            width: '4rem',
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span className="text-[0.8125rem] text-[var(--sp-text-warm-2)]">桁以上</span>
      </div>

      <FormActions>
        <FormButton variant="primary" onClick={handleSave} disabled={!policy || saving}>
          保存
        </FormButton>
      </FormActions>
    </FormCard>
  );
}

// ─── §2 二段階認証（MFA / TOTP）セクション ──────────────────────────────────

/** 個人 MFA 登録フローの段階。secret は保持せず otpauthUri / バックアップコードは一度きりの表示用に持つ。 */
type MfaPhase =
  | { step: 'loading' }
  | { step: 'error' }
  | { step: 'disabled' }
  | { step: 'enrolling'; otpauthUri: string }
  | { step: 'backup'; codes: string[] }
  | { step: 'enabled'; confirmedAt: string | null };

/** otpauth URI から手動入力用の secret（base32）を取り出す（QR を読めない端末向けの控え）。 */
function extractSecret(uri: string): string | null {
  try {
    return new URL(uri).searchParams.get('secret');
  } catch {
    return null;
  }
}

/** TOTP / バックアップコードの入力欄（数字主体・等幅）。 */
function CodeInput({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      className="sp-input"
      aria-label="認証コード"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder="123456"
      style={{
        width: '11rem',
        letterSpacing: '0.12em',
        fontVariantNumeric: 'tabular-nums',
      }}
    />
  );
}

/** バックアップコード一覧（confirm / regenerate 直後の一度きり表示・コピー可）。 */
function BackupCodesPanel({ codes }: { codes: string[] }) {
  return (
    <div style={{ marginTop: '0.25rem' }}>
      <WarningBanner>
        バックアップコードは<strong>今だけ</strong>
        表示されます。認証アプリを失った時の復旧手段なので安全な場所に保管してください（各コードは 1
        回のみ使用可能）。
      </WarningBanner>
      <div
        style={{
          marginTop: '0.625rem',
          display: 'grid',
          /* set-0114: 固定2列を廃し狭幅で折り返す可変グリッドへ */
          gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
          gap: '0.375rem',
        }}
      >
        {codes.map((c) => (
          <code
            key={c}
            className="text-[0.8125rem]"
            style={{
              background: 'var(--sp-paper-2)',
              padding: '0.375rem 0.625rem',
              borderRadius: 4,
              fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
              letterSpacing: '0.06em',
              textAlign: 'center',
            }}
          >
            {c}
          </code>
        ))}
      </div>
    </div>
  );
}

/** 全体強制トグル（ADMIN 限定・mfaEnforced は password-policy に同居）。非 ADMIN には描画しない。 */
function MfaEnforcementRow() {
  const { user } = useSessionContext();
  const isAdmin = user?.role === Role.ADMIN;
  const [enforced, setEnforced] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const { run } = useAsyncAction();

  useMountedFetch(
    async (alive) => {
      if (!isAdmin) return;
      try {
        const p = await fetchPasswordPolicy();
        if (alive()) setEnforced(p.mfaEnforced);
      } catch {
        if (alive()) setEnforced(null);
      }
    },
    [isAdmin],
  );

  if (!isAdmin) return null;

  async function handleToggle(next: boolean) {
    if (saving) return;
    await run(
      async () => {
        // パスワードポリシー側の未保存編集を巻き戻さないよう、保存直前に最新値を取り直して mfaEnforced のみ反転する。
        const latest = await fetchPasswordPolicy();
        const saved = await savePasswordPolicy({ ...latest, mfaEnforced: next });
        setEnforced(saved.mfaEnforced);
        toast.success(next ? '全体強制を有効にしました' : '全体強制を無効にしました');
      },
      { onBusyChange: setSaving, onError: () => toast.error('全体強制設定の保存に失敗しました') },
    );
  }

  return (
    <div
      style={{
        marginTop: '1rem',
        paddingTop: '0.875rem',
        borderTop: '1px solid var(--sp-line-warm-2)',
      }}
    >
      <FormLabel>全体強制（管理者）</FormLabel>
      <CheckboxRow checked={enforced ?? false} onChange={handleToggle}>
        <span className="text-sm">テナント全メンバーに二段階認証を必須にする</span>
      </CheckboxRow>
      <InfoBanner>
        ローカル認証の全メンバーは次回ログイン以降、二段階認証の設定が必須になります（OIDC SSO
        は対象外）。 未設定のユーザーは設定を済ませるまで保護された画面へ到達できません。
      </InfoBanner>
    </div>
  );
}

function TwoFactorSection() {
  const { user, setUser } = useSessionContext();
  const [phase, setPhase] = useState<MfaPhase>({ step: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { run } = useAsyncAction();
  // enabled 時の追加操作（無効化 / バックアップ再生成）はそれぞれコード再確認を挟む。
  const [activeAction, setActiveAction] = useState<null | 'disable' | 'regenerate'>(null);

  // 状態取得（マウント時 / 再読み込みボタン）。取得失敗を未設定扱いにすると、有効化済みユーザーへ
  // 「設定」ボタンを誤表示し、押下で secret を巻き戻す事故になるため、失敗は明示的に error phase へ倒す。
  async function loadStatus() {
    setPhase({ step: 'loading' });
    try {
      const s = await fetchMfaStatus();
      setPhase(s.enabled ? { step: 'enabled', confirmedAt: s.confirmedAt } : { step: 'disabled' });
    } catch {
      setPhase({ step: 'error' });
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetInput = () => {
    setCode('');
    setActiveAction(null);
  };

  async function handleSetup() {
    if (busy) return;
    await run(
      async () => {
        const { otpauthUri } = await setupMfa();
        setCode('');
        setPhase({ step: 'enrolling', otpauthUri });
      },
      {
        onBusyChange: setBusy,
        onError: (err) =>
          toast.error(extractValidationErrorMessage(err, 'セットアップを開始できませんでした')),
      },
    );
  }

  async function handleConfirm() {
    if (busy || !code.trim()) return;
    await run(
      async () => {
        // 通信断等で応答が届かなかっただけで実際はサーバー側で有効化済みのケースがある（set-0040④）。
        // リカバリ成功時は return で正常終了扱い（onError は呼ばれない）、リカバリ失敗時は throw で外側に渡す。
        // useAsyncAction の onError は await しない制約があるため、ネストした try/catch によるリカバリは
        // action コールバック内で完結させる（design set-0060 ④）。
        try {
          const { backupCodes } = await confirmMfa(code.trim());
          setCode('');
          setPhase({ step: 'backup', codes: backupCodes });
          toast.success('二段階認証を有効化しました');
          // MFA 設定完了＝強制ゲート解除（set-0032）。context の mfaSetupRequired を落とし、
          // backup コードを閉じた後に他画面へ遷移できるようにする（横断ガードが再ブロックしない）。
          if (user) setUser({ ...user, mfaSetupRequired: false });
          return;
        } catch (err) {
          // loadStatus でサーバーの実状態を再確認し、食い違ったまま mfaSetupRequired が残るのを防ぐ。
          try {
            const s = await fetchMfaStatus();
            if (s.enabled) {
              setCode('');
              setPhase({ step: 'enabled', confirmedAt: s.confirmedAt });
              toast(
                '設定は完了している可能性があります（通信が不安定でした）。バックアップコードは一度きりの表示のため再表示できません。',
              );
              if (user) setUser({ ...user, mfaSetupRequired: false });
              return;
            }
          } catch {
            // 再確認自体が失敗した場合は通常のエラー案内にフォールバックする。
          }
          throw err;
        }
      },
      {
        onBusyChange: setBusy,
        onError: (err) =>
          toast.error(extractValidationErrorMessage(err, '認証コードが正しくありません')),
      },
    );
  }

  async function handleDisable() {
    if (busy || !code.trim()) return;
    await run(
      async () => {
        await disableMfa(code.trim());
        resetInput();
        setPhase({ step: 'disabled' });
        toast.success('二段階認証を無効化しました');
      },
      {
        onBusyChange: setBusy,
        onError: (err) =>
          toast.error(extractValidationErrorMessage(err, 'コードが正しくありません')),
      },
    );
  }

  async function handleRegenerate() {
    if (busy || !code.trim()) return;
    await run(
      async () => {
        const { backupCodes } = await regenerateBackupCodes(code.trim());
        resetInput();
        setPhase({ step: 'backup', codes: backupCodes });
        toast.success('バックアップコードを再生成しました');
      },
      {
        onBusyChange: setBusy,
        onError: (err) =>
          toast.error(extractValidationErrorMessage(err, 'コードが正しくありません')),
      },
    );
  }

  // backup 表示を閉じる時、最新状態を取り直して enabled へ確定する。
  async function handleBackupDone() {
    await run(
      async () => {
        const s = await fetchMfaStatus();
        setPhase(
          s.enabled ? { step: 'enabled', confirmedAt: s.confirmedAt } : { step: 'disabled' },
        );
      },
      {
        onBusyChange: setBusy,
        // 失敗時：トーストを出さず冪等な enabled 救済状態へ倒す（catch 本体と同じ振る舞い・set-0060）。
        onError: () => {
          setPhase({ step: 'enabled', confirmedAt: null });
        },
      },
    );
  }

  const isOn = phase.step === 'enabled' || phase.step === 'backup';
  const secret = phase.step === 'enrolling' ? extractSecret(phase.otpauthUri) : null;

  return (
    <FormCard
      icon={<ShieldCheck className="h-4 w-4" />}
      title="二段階認証（認証アプリ）"
      description="ログイン時に認証アプリ（TOTP）の 6 桁コードを必須にします。"
      badge={
        /* set-0109: 2値ステータスは素テキスト（R6 バッジ規則・装飾ピル廃止） */
        <span
          className="text-[0.6875rem] font-semibold text-[var(--sp-text-warm-mute)]"
          style={{ marginLeft: '0.25rem' }}
        >
          {isOn ? '有効' : '無効'}
        </span>
      }
    >
      {phase.step === 'loading' && (
        <div className="flex justify-center py-2">
          <Spinner className="h-4 w-4" />
        </div>
      )}

      {phase.step === 'error' && (
        <>
          <WarningBanner>
            二段階認証の状態を取得できませんでした。設定の巻き戻し事故を防ぐため操作を保留しています。再読み込みしてください。
          </WarningBanner>
          <FormActions>
            <FormButton variant="secondary" onClick={() => void loadStatus()}>
              再読み込み
            </FormButton>
          </FormActions>
        </>
      )}

      {phase.step === 'disabled' && (
        <>
          <InfoBanner>
            認証アプリで QR を読み取り、6 桁コードで本人確認すると有効化できます。
          </InfoBanner>
          <FormActions>
            <FormButton variant="primary" onClick={handleSetup} disabled={busy}>
              保存
            </FormButton>
          </FormActions>
        </>
      )}

      {phase.step === 'enrolling' && (
        <>
          <FormLabel>1. 認証アプリで QR コードを読み取る</FormLabel>
          <div
            style={{
              display: 'inline-flex',
              padding: '0.75rem',
              background: 'var(--sp-card)',
              borderRadius: '0.5rem',
              border: '1px solid var(--sp-line-warm-2)',
            }}
          >
            <QRCodeSVG value={phase.otpauthUri} size={160} />
          </div>
          {secret && (
            <p
              className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]"
              style={{ marginTop: '0.5rem' }}
            >
              QR を読み取れない場合は手動でキーを入力: <Code>{secret}</Code>
            </p>
          )}

          <div style={{ marginTop: '1rem' }}>
            <FormLabel>2. アプリに表示された 6 桁コードを入力</FormLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Smartphone className="h-4 w-4 text-[var(--sp-text-warm-mute)]" aria-hidden="true" />
              <CodeInput value={code} onChange={setCode} onEnter={handleConfirm} />
            </div>
          </div>

          <FormActions>
            <FormButton
              variant="ghost"
              onClick={() => setPhase({ step: 'disabled' })}
              disabled={busy}
            >
              キャンセル
            </FormButton>
            <FormButton variant="primary" onClick={handleConfirm} disabled={busy || !code.trim()}>
              有効化
            </FormButton>
          </FormActions>
        </>
      )}

      {phase.step === 'backup' && (
        <>
          <BackupCodesPanel codes={phase.codes} />
          <FormActions>
            <FormButton
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(phase.codes.join('\n'));
                toast.success('バックアップコードをコピーしました');
              }}
            >
              全コードをコピー
            </FormButton>
            <FormButton variant="primary" onClick={handleBackupDone} disabled={busy}>
              保管した・完了
            </FormButton>
          </FormActions>
        </>
      )}

      {phase.step === 'enabled' && (
        <>
          <InfoBanner>
            二段階認証は有効です
            {phase.confirmedAt
              ? `（${new Date(phase.confirmedAt).toLocaleString('ja-JP')} に設定）`
              : ''}
            。無効化やバックアップコードの再生成には認証コードの入力が必要です。
          </InfoBanner>

          {activeAction && (
            <div style={{ marginTop: '0.75rem' }}>
              <FormLabel>
                {activeAction === 'disable'
                  ? '無効化するには認証コードを入力'
                  : '再生成するには認証コードを入力'}
              </FormLabel>
              <CodeInput
                value={code}
                onChange={setCode}
                onEnter={activeAction === 'disable' ? handleDisable : handleRegenerate}
              />
            </div>
          )}

          <FormActions>
            {activeAction ? (
              <>
                <FormButton variant="ghost" onClick={resetInput} disabled={busy}>
                  キャンセル
                </FormButton>
                <FormButton
                  variant="primary"
                  onClick={activeAction === 'disable' ? handleDisable : handleRegenerate}
                  disabled={busy || !code.trim()}
                >
                  {activeAction === 'disable' ? '無効化' : '再生成'}
                </FormButton>
              </>
            ) : (
              <>
                <FormButton
                  variant="secondary"
                  onClick={() => {
                    setCode('');
                    setActiveAction('regenerate');
                  }}
                  disabled={busy}
                >
                  バックアップコードを再生成
                </FormButton>
                <FormButton
                  variant="secondary"
                  onClick={() => {
                    setCode('');
                    setActiveAction('disable');
                  }}
                  disabled={busy}
                >
                  無効化
                </FormButton>
              </>
            )}
          </FormActions>
        </>
      )}

      <MfaEnforcementRow />
    </FormCard>
  );
}

// ─── §3 IP アドレスフィルタセクション ──────────────────────────────────────

function IpFilterSection() {
  // set-0057: テナント全体の IP フィルタ編集は ADMIN 限定（MfaEnforcementRow と同型のセクション単位ガード）。
  const { user } = useSessionContext();
  const isAdmin = user?.role === Role.ADMIN;
  const [allowList, setAllowList] = useState('');
  const [currentIp, setCurrentIp] = useState('');
  const [saving, setSaving] = useState(false);
  const { run } = useAsyncAction();

  useMountedFetch(
    async (alive) => {
      if (!isAdmin) return;
      try {
        const wl = await fetchIpWhitelist();
        if (!alive()) return;
        setAllowList(serializeEntries(wl.entries));
        setCurrentIp(wl.currentIp);
      } catch {
        if (alive()) toast.error('IP 許可リストの読み込みに失敗しました');
      }
    },
    [isAdmin],
  );

  if (!isAdmin) return null;

  /** 現在 IP を単一ホスト CIDR として末尾行へ追記する（IPv6 は /128・IPv4 は /32）。 */
  const handleAddCurrentIp = () => {
    if (!currentIp) return;
    const hostSuffix = currentIp.includes(':') ? '/128' : '/32';
    setAllowList((prev) => {
      const base = prev.trimEnd();
      return (base ? `${base}\n` : '') + `${currentIp}${hostSuffix},自分の現在 IP`;
    });
  };

  async function handleSave() {
    if (saving) return;
    await run(
      async () => {
        const saved = await saveIpWhitelist({ entries: parseEntries(allowList) });
        setAllowList(serializeEntries(saved.entries));
        setCurrentIp(saved.currentIp);
        toast.success('IP フィルタを保存しました');
      },
      {
        onBusyChange: setSaving,
        // CIDR の DTO バリデーション失敗は error.message が generic な 'Validation failed' になり
        // 詳細が details.validationErrors[] に入るため、共有ヘルパが詳細を優先して返す（v2-198）。
        onError: (err) =>
          toast.error(extractValidationErrorMessage(err, 'IP フィルタの保存に失敗しました')),
      },
    );
  }

  return (
    <FormCard
      icon={<Globe className="h-4 w-4" />}
      title="IP アドレスフィルタ"
      description="登録された CIDR からのアクセスのみ許可します。空欄の場合は制限なし。"
    >
      {/* set-0131: ラベル行右端へ「現在IP」表示+「現在IPを追加」ボタンを配置（フッターから移動） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
      >
        <FormLabel>
          許可リスト（1 行 1 エントリ / 形式: <Code>CIDR,備考</Code>）
        </FormLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span className="text-xs text-[var(--sp-text-warm-mute)]">
            現在IP: <Code>{currentIp || '検出中…'}</Code>
          </span>
          <FormButton
            variant="secondary"
            onClick={handleAddCurrentIp}
            disabled={!currentIp || saving}
          >
            現在 IP を追加
          </FormButton>
        </div>
      </div>
      <textarea
        className="sp-input"
        spellCheck={false}
        aria-label="IP 許可リスト"
        value={allowList}
        onChange={(e) => setAllowList(e.target.value)}
        placeholder={
          '203.0.113.0/24,本社オフィス\n198.51.100.42/32,代表者自宅\n192.0.2.0/27,大阪支社 VPN'
        }
        style={{
          width: '100%',
          minHeight: '8rem',
          fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
          lineHeight: 1.55,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />

      <WarningBanner>
        注意：将来 enforcement を有効化すると、登録 CIDR 外からのアクセスは遮断されます。自身の現在
        IP（
        <Code>{currentIp || '検出中…'}</Code>）が含まれていることを確認してください。
      </WarningBanner>

      <FormActions>
        <FormButton variant="primary" onClick={handleSave} disabled={saving}>
          保存
        </FormButton>
      </FormActions>
    </FormCard>
  );
}

// ─── 画面ルート ───────────────────────────────────────────────────────────────

/**
 * ログイン設定画面（設定タブ / セキュリティカテゴリ）。
 * パスワードポリシー（ST-2-1）/ 二段階認証（ST-2-2 / MFA・TOTP）/ IP アドレスフィルタ（ST-2-3）を
 * backend `settings/login` `settings/mfa` へ実 API 接続。MFA は個人登録（本人・全ロール）と全体強制トグル
 * （ST-2-2b・ADMIN 限定・mfaEnforced）の 2 層。IP フィルタの enforcement（遮断 middleware）は hardening 連携で後回し。
 */
export function LoginSettingsScreen() {
  return (
    <main className="sp-page" style={{ overflowY: 'auto' }}>
      {/* set-0093: PageTitle の説明文は不要 */}
      <PageTitle title="ログイン設定" />

      {/* v2-180: 全幅(1153px)で間延びしていたフォームを内容に合う幅へ絞り左寄せにする
          （表のある画面と同じ 680px。ページ幅いっぱいに伸ばすと入力欄と本文が離れて読みにくい）。 */}
      <div style={{ maxWidth: 680 }}>
        <PasswordPolicySection />
        <TwoFactorSection />
        <IpFilterSection />
      </div>
    </main>
  );
}
