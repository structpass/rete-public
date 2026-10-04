'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { normalizeExtension } from '../lib/api';

/**
 * 拡張子を1件ずつ追加・解除する入力部品（v2-203）。
 *
 * 変更前は「カンマ区切りの値を1本のテキストボックスへ書く」方式だったため、値が増えるほど
 * どこまでが1件か読み取りにくかった。ここでは入力欄＋追加ボタンで1件ずつ足し、足した値は
 * 枠線なしのラベルとして並べ、右横の ✕ で1件だけ外す（表示と操作を1件単位に揃える）。
 *
 * 追加・解除は親の state を書き換えるだけで保存はしない（保存ボタンを押すまで確定しない）。
 * 設定画面（/settings/file-upload）と Files の設定オーバーレイの2面で同じ見た目・同じ操作に
 * するため、この部品へ集約する（architecture-invariants §3 の2モジュール目の法則）。
 */
export function ExtensionListEditor({
  id,
  values,
  onAdd,
  onRemove,
  disabled = false,
  inputAriaLabel,
}: {
  /** 入力欄の id（ラベルの htmlFor と対応させる）。 */
  id: string;
  values: string[];
  /** 1件足す。'added' | 'duplicate' | 'invalid' を返し、画面がメッセージを出し分ける。 */
  onAdd: (raw: string) => 'added' | 'duplicate' | 'invalid';
  onRemove: (ext: string) => void;
  disabled?: boolean;
  /** 入力欄の読み上げラベル（欄の見出しと揃える）。 */
  inputAriaLabel: string;
}) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  const submit = () => {
    const result = onAdd(draft);
    if (result === 'added') {
      setDraft('');
      setNotice('');
      return;
    }
    // 入らなかった理由を残す（黙って消えると「押しても何も起きない」に見える）。
    setNotice(
      result === 'duplicate'
        ? `${normalizeExtension(draft)} は既に追加されています`
        : '拡張子を入力してください',
    );
  };

  return (
    <div data-ext-group={id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <input
          id={id}
          type="text"
          className="sp-input"
          placeholder=".ps1"
          aria-label={inputAriaLabel}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            if (notice) setNotice('');
          }}
          onKeyDown={(e) => {
            // Enter でも追加できる（1件ずつ足す操作の自然な抜け道）。フォーム送信は起こさない。
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          style={{ width: '100%', maxWidth: '12rem' }}
        />
        <button
          type="button"
          className="sp-action-btn"
          onClick={submit}
          disabled={disabled}
          aria-label={`${inputAriaLabel}を追加`}
        >
          追加
        </button>
      </div>

      {/* 追加済みの値は枠線なしのラベルとして並べ、右横の ✕ で1件だけ外す（要求の 2・3）。 */}
      <ul
        aria-label={`${inputAriaLabel}の一覧`}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.25rem 0.75rem',
          listStyle: 'none',
          margin: '0.5rem 0 0',
          padding: 0,
          minHeight: '1.5rem',
        }}
      >
        {values.length === 0 ? (
          <li className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]" data-ext-empty="true">
            まだ追加されていません
          </li>
        ) : (
          values.map((ext) => (
            <li
              key={ext}
              data-ext-chip={ext}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.125rem' }}
            >
              <span className="text-[0.8125rem] text-[var(--sp-text-warm)]">{ext}</span>
              <button
                type="button"
                onClick={() => onRemove(ext)}
                disabled={disabled}
                aria-label={`${ext} を解除`}
                title={`${ext} を解除`}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  margin: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '1rem',
                  height: '1rem',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  color: 'var(--sp-text-warm-mute)',
                }}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>

      {notice && (
        <p
          role="status"
          className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]"
          style={{ marginTop: '0.25rem' }}
        >
          {notice}
        </p>
      )}
    </div>
  );
}

/** 常に拒否する拡張子（コード固定）の読み取り専用表示。追加・解除の対象にしない（v2-197 要求版2）。 */
export function FixedExtensionList({ values }: { values: string[] }) {
  return (
    <ul
      aria-label="常に拒否する拡張子の一覧"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.25rem 0.75rem',
        listStyle: 'none',
        margin: 0,
        padding: 0,
      }}
    >
      {values.map((ext) => (
        <li
          key={ext}
          data-ext-chip={ext}
          className="text-[0.8125rem] text-[var(--sp-text-warm-mute)]"
        >
          {ext}
        </li>
      ))}
    </ul>
  );
}
