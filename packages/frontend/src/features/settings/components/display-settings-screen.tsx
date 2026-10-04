'use client';

import { useState } from 'react';
import { Palette } from 'lucide-react';
import { HexColorPicker, setNonce } from 'react-colorful';
import toast from 'react-hot-toast';
import type { DisplayPreferenceDto } from '@rete/shared';
import { STRIPE_COLOR_DEFAULT, STRIPE_COLOR_PATTERN } from '@rete/shared';
import { FormActions, FormButton, FormCard, FormLabel, PageTitle } from './primitives';
import { useMountedFetch } from '@/hooks/use-mounted-fetch';
import { fetchDisplayPreference, saveDisplayPreference } from '../lib/display-preference-api';
import { getClientCspNonce } from '@/lib/csp-nonce';

// cmn-0351: カラーピッカーの <style> 注入を CSP で許可する nonce を設定する。
// モジュールロード時（クライアント側のみ）に一度呼べば、以降の全インスタンスへ効く。
// dev では window.__nonce__ が未設定（CSP が style-src のみ）なので nonce なし＝従来どおり。
if (typeof window !== 'undefined') {
  const nonce = getClientCspNonce();
  if (nonce) setNonce(nonce);
}

/** 未保存アカウントの画面上の初期値（CSS 既定と同じ＝縞 ON・#FAFCFF・mdl-0052）。 */
const DEFAULT_PREF: DisplayPreferenceDto = {
  stripeEnabled: true,
  stripeColor: STRIPE_COLOR_DEFAULT,
};

/** 3 桁 hex は許容せず #RRGGBB のみ有効（backend DTO と同じ SSOT パターン）。 */
function isValidStripeColor(v: string): boolean {
  return STRIPE_COLOR_PATTERN.test(v);
}

/** 縞模様のプレビュー（選択中の色・ON/OFF を保存前に確認できるサンプル明細）。 */
function StripePreview({ enabled, color }: { enabled: boolean; color: string }) {
  const rows = [
    '明細行のサンプル 1',
    '明細行のサンプル 2',
    '明細行のサンプル 3',
    '明細行のサンプル 4',
  ];
  return (
    <div
      aria-label="縞模様プレビュー"
      style={{
        border: '1px solid var(--sp-line-warm-2)',
        borderRadius: '0.375rem',
        overflow: 'hidden',
      }}
    >
      {rows.map((label, i) => (
        <div
          key={label}
          className="text-[0.8125rem] text-[var(--sp-text-warm)]"
          style={{
            padding: '0.5rem 0.75rem',
            background: enabled && i % 2 === 1 ? color : 'var(--sp-card)',
            borderBottom: i < rows.length - 1 ? '1px solid var(--sp-line-warm-2)' : undefined,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

/**
 * 表示設定画面（設定タブ / 個人設定カテゴリ / mdl-0022）。
 * 明細（テーブル/一覧）の縞模様の ON/OFF と縞色を本人単位で保存する
 * （backend `accounts/me/display-preference`）。反映は再ログイン時（セッション初期化で
 * --sp-row-stripe を上書きする方式のため、保存しただけでは現在の画面は変わらない）。
 */
export function DisplaySettingsScreen() {
  const [pref, setPref] = useState<DisplayPreferenceDto | null>(null);
  // hex 直接入力は入力途中の不完全な値を保持する必要があるため pref とは別 state で持ち、
  // 有効な 6 桁 hex になった時だけ pref へ反映する。
  const [hexInput, setHexInput] = useState<string>(DEFAULT_PREF.stripeColor);
  const [saving, setSaving] = useState(false);

  useMountedFetch(async (alive) => {
    try {
      const saved = await fetchDisplayPreference();
      if (!alive()) return;
      const initial = saved ?? DEFAULT_PREF;
      setPref(initial);
      setHexInput(initial.stripeColor);
    } catch {
      if (!alive()) return;
      // 取得失敗でも既定値で編集を続けられるようにする（保存時に改めてエラー通知される）。
      setPref(DEFAULT_PREF);
      toast.error('表示設定の読み込みに失敗しました');
    }
  }, []);

  const setColor = (color: string) => {
    setHexInput(color);
    if (isValidStripeColor(color)) {
      setPref((cur) => (cur ? { ...cur, stripeColor: color } : cur));
    }
  };

  async function handleSave() {
    if (!pref || saving) return;
    if (!isValidStripeColor(pref.stripeColor)) {
      toast.error('縞模様の色は #RRGGBB 形式で入力してください');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDisplayPreference(pref);
      setPref(saved);
      setHexInput(saved.stripeColor);
      toast.success('表示設定を保存しました。次回ログイン時に反映されます');
    } catch {
      toast.error('表示設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="sp-page" style={{ overflowY: 'auto' }}>
      <PageTitle title="表示設定" />

      {/* v2-180: 全幅(1153px)で間延びしていたフォームを内容に合う幅へ絞り左寄せにする
          （表のある画面と同じ 680px。カラーピッカー200px + プレビューの2列は 680px でも収まる）。 */}
      <div style={{ maxWidth: 680 }}>
        <FormCard
          icon={<Palette className="h-4 w-4" />}
          title="明細の縞模様"
          description="明細の偶数行に薄い背景色を敷いて行を追いやすくします。"
        >
          <label
            className="text-[0.8125rem] text-[var(--sp-text-warm)]"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={pref?.stripeEnabled ?? true}
              disabled={!pref}
              onChange={(e) =>
                setPref((cur) => (cur ? { ...cur, stripeEnabled: e.target.checked } : cur))
              }
              style={{
                width: 16,
                height: 16,
                accentColor: 'var(--sp-accent-ink)',
                cursor: 'pointer',
              }}
            />
            縞模様を表示する
          </label>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div>
              <FormLabel>縞模様の色</FormLabel>
              <HexColorPicker
                color={pref?.stripeColor ?? DEFAULT_PREF.stripeColor}
                onChange={setColor}
                style={{ width: 200, height: 160 }}
              />
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: '1px solid var(--sp-line-warm)',
                    background: isValidStripeColor(hexInput) ? hexInput : 'transparent',
                    flexShrink: 0,
                  }}
                />
                <input
                  type="text"
                  className="sp-input"
                  aria-label="縞模様の色（カラーコード）"
                  value={hexInput}
                  onChange={(e) => setColor(e.target.value.trim())}
                  placeholder={STRIPE_COLOR_DEFAULT}
                  spellCheck={false}
                  style={{
                    width: '7rem',
                    fontFamily: "'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                    letterSpacing: '0.04em',
                  }}
                />
                <FormButton
                  variant="secondary"
                  onClick={() => setColor(STRIPE_COLOR_DEFAULT)}
                  disabled={!pref}
                >
                  既定色に戻す
                </FormButton>
              </div>
              {!isValidStripeColor(hexInput) && (
                <p
                  className="text-[0.6875rem] text-[var(--sp-accent-red)]"
                  style={{ marginTop: '0.375rem' }}
                >
                  #RRGGBB 形式（例: {STRIPE_COLOR_DEFAULT}）で入力してください
                </p>
              )}
            </div>

            <div style={{ flex: '1 1 16rem', minWidth: '14rem' }}>
              <FormLabel>プレビュー</FormLabel>
              <StripePreview
                enabled={pref?.stripeEnabled ?? true}
                color={pref?.stripeColor ?? DEFAULT_PREF.stripeColor}
              />
              <p
                className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]"
                style={{ marginTop: '0.375rem' }}
              >
                既定色は {STRIPE_COLOR_DEFAULT}
                （薄い青み白）。濃い色は文字の読みやすさが落ちるため薄いトーンを推奨します。
              </p>
            </div>
          </div>

          <FormActions>
            <FormButton variant="primary" onClick={handleSave} disabled={!pref} loading={saving}>
              保存
            </FormButton>
          </FormActions>
        </FormCard>
      </div>
    </main>
  );
}
