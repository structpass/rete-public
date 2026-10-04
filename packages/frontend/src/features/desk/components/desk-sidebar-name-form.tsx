'use client';

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { ORG_ENTITY_NAME_MAX_LEN } from '@rete/shared';
import { useDiscardConfirm } from '@/hooks/use-discard-confirm';
import { DiscardConfirmDialog } from '@/components/ui/discard-confirm-dialog';

/**
 * サイドバーの名前入力インラインフォーム（CM-2・グループ作成 / チャネル作成 / チャネル改名 / 自分メモ作成で共有 / §3 コピペ回避）。
 *
 * 名前を入力 → 確定で onSubmit を呼び、成功（truthy 返却）で onClose する。Esc／キャンセルで破棄。
 * 既定では空名は確定不可（80字上限は backend と同じ ORG_ENTITY_NAME_MAX_LEN）。allowEmpty=true の呼び出し元
 * （自分メモ作成）のみ空欄のまま確定でき、backend の既定名フォールバックに委ねる。initialValue を渡すと改名用のプリフィルになる。
 * A1 状態機械とは無関係の局所 UI（サイドバー内のみで開閉）。
 */
export function SidebarNameForm({
  placeholder,
  ariaLabel,
  submitLabel,
  initialValue = '',
  allowEmpty = false,
  onSubmit,
  onClose,
  submitting,
}: {
  placeholder: string;
  ariaLabel: string;
  submitLabel: string;
  initialValue?: string;
  /** true なら空名のまま確定できる（backend が既定名へフォールバックするケース用・既定 false）。 */
  allowEmpty?: boolean;
  /** 確定ハンドラ。成功時に truthy（作成/更新後の DTO 等）、失敗時に null を返す契約。 */
  onSubmit: (name: string) => Promise<unknown>;
  onClose: () => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initialValue);
  // 自前の送信中フラグ。呼び出し側 submitting は API 完了で false に戻るが、その後の一覧 reload 完了
  // （= onClose）までの数十 ms に確定ボタンが再活性化する二重サブミット窓を本フラグで閉じる。
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const canSubmit = (allowEmpty || trimmed.length > 0) && !submitting && !pending;

  // 初期値からの変更がある間だけ Esc / キャンセルに破棄確認を挟む（mdl-0034 規約②）。
  const dirty = trimmed !== initialValue.trim();
  const discard = useDiscardConfirm();
  const requestClose = () => discard.request(dirty, onClose);

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    const result = await onSubmit(trimmed);
    // 成功時は onClose で本フォームが unmount される。失敗時のみ再入力できるよう pending を解除。
    if (result) onClose();
    else setPending(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // IME 変換中の Esc / Enter は変換操作であってフォーム操作ではない（mdl-0034 規約⑤と同方針）。
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      requestClose();
    }
  }

  return (
    <div className="sidebar-create-form">
      <input
        ref={inputRef}
        type="text"
        className="sidebar-create-input"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={name}
        maxLength={ORG_ENTITY_NAME_MAX_LEN}
        disabled={submitting}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="sidebar-create-actions">
        <button type="button" className="sidebar-create-btn is-ghost" onClick={requestClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="sidebar-create-btn is-primary"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitLabel}
        </button>
      </div>
      <DiscardConfirmDialog
        open={discard.open}
        onConfirm={discard.onConfirm}
        onCancel={discard.onCancel}
      />
    </div>
  );
}
