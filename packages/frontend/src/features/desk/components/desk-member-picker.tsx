'use client';

import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { SpaceDto } from '@rete/shared';
import type { Account } from '@/features/tasks/lib/api';
import { useOutsideClose } from '@/hooks/use-outside-close';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { avatarClassFor, avatarChar } from '../lib/avatar';

/**
 * 検索付きメンバーピッカー（CM-2 rete-desk-0144・個人タブ「ダイレクトメッセージ」（旧「関係者」）の
 * 「＋」で開く。dsk-0308 で DM 専用実装から正本化し、dsk-0306 グループメンバー管理でも同型のまま再利用する）。
 * candidates＝呼び出し側で除外済のアカウント候補。選択で onPick を呼び、成功（truthy 返却）で
 * onClose する。Esc で破棄。候補が多い場合に備え簡易絞り込み入力を持つ（名前部分一致）。
 *
 * dsk-0353: 呼び出し側が `getConfirmMessage` を渡した時のみ、候補クリックは即 onPick せず確認ステップ
 * （「{name} とダイレクトメッセージを開始しますか？」相当）を挟む。グループ追加（dsk-0306）のように
 * 確認が不要な呼び出しは prop を渡さず従来動作を維持する。
 */
export function DeskMemberPicker({
  candidates,
  onPick,
  onClose,
  submitting,
  placeholder = 'メンバーを検索',
  ariaLabel = 'メンバーを検索',
  emptyMessage = '追加できるメンバーがいません',
  /** サイドバー直下など、既存一覧を押し下げず浮遊ポップアップとして出す（dsk-0308）。モーダル内は false のまま。 */
  floating = false,
  /** 白地カード（メンバー設定モーダル等）上で使う時のライト配色（dsk-0365）。サイドバー（ダーク地）は false のまま。 */
  light = false,
  /**
   * 候補クリック時に確認ダイアログを挟む場合の文言生成関数。文字列を返すと確認ステップに入り、
   * undefined を返すと従来通り即 onPick を呼ぶ。DM のように誤クリックで副作用が出る文脈でだけ渡す。
   */
  getConfirmMessage,
}: {
  candidates: Account[];
  onPick: (accountId: string) => Promise<SpaceDto | null>;
  onClose: () => void;
  submitting: boolean;
  /** 検索入力の placeholder（呼び出し文脈に合わせて上書き可。既定はメンバー用文言）。 */
  placeholder?: string;
  /** 検索入力の aria-label（既定はメンバー用文言）。 */
  ariaLabel?: string;
  /** 候補ゼロ時の空メッセージ（既定はメンバー用文言）。 */
  emptyMessage?: string;
  floating?: boolean;
  /** ライト配色 variant（白地カード上用・dsk-0365）。 */
  light?: boolean;
  /** dsk-0353: 候補クリックで確認ステップを挟む時の文言。undefined なら確認スキップ。 */
  getConfirmMessage?: (account: Account) => string | undefined;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  /** 確認ステップと一覧で共通の外側 div ref（dsk-0358: useOutsideClose の内側判定用）。 */
  const containerRef = useRef<HTMLDivElement>(null);
  /** 確認ステップで保留中の候補（dsk-0353）。null 時は一覧表示。 */
  const [pendingConfirm, setPendingConfirm] = useState<Account | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // dsk-0358: floating 時は外側クリック／Esc で閉じる。floating=false（モーダル内利用）の時は
  // 呼び出し側の閉じる経路に委ねる。Esc は下の handleKeyDown（input フォーカス時の即時反応）と
  // useOutsideClose の document 監視で重複するが、どちらも onClose を呼ぶ冪等な操作なので害なし。
  useOutsideClose({
    active: floating && pendingConfirm === null,
    refs: [containerRef],
    onClose,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((a) => a.name.toLowerCase().includes(q));
  }, [candidates, query]);

  async function pick(accountId: string) {
    if (submitting) return;
    const created = await onPick(accountId);
    if (created) onClose();
  }

  function requestPick(account: Account) {
    if (submitting) return;
    // 確認 prop があれば確認ステップへ。文字列を返した時だけ確認ダイアログを出す（undefined は
    // 旧動作＝即 onPick）。
    if (getConfirmMessage) {
      const msg = getConfirmMessage(account);
      if (msg !== undefined) {
        setPendingConfirm(account);
        return;
      }
    }
    void pick(account.id);
  }

  async function confirmPick() {
    if (!pendingConfirm || submitting) return;
    const target = pendingConfirm;
    // 先にクリアして多重確定を防ぐ（onPick 中の再クリック抑止）。
    setPendingConfirm(null);
    await pick(target.id);
  }

  function cancelConfirm() {
    setPendingConfirm(null);
    // AlertDialog の通常の復帰先はクリックした候補。確認ステップの既存契約どおり検索へ戻す。
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'sidebar-member-picker',
          floating && 'sidebar-member-picker--floating',
          light && 'sidebar-member-picker--light',
        )}
      >
        <input
          ref={inputRef}
          type="text"
          className="sidebar-create-input"
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {filtered.length === 0 ? (
          <p className="sidebar-member-picker-empty">
            {candidates.length === 0 ? emptyMessage : '一致するメンバーがいません'}
          </p>
        ) : (
          filtered.map((account, i) => (
            <button
              key={account.id}
              type="button"
              className="sidebar-member-picker-option"
              disabled={submitting}
              onClick={() => requestPick(account)}
            >
              <span className={cn('sidebar-member-avatar', avatarClassFor(i))}>
                {avatarChar(account.name)}
              </span>
              <span className="sidebar-member-name">{account.name}</span>
            </button>
          ))
        )}
      </div>
      <ConfirmDialog
        open={pendingConfirm !== null}
        message={
          pendingConfirm
            ? (getConfirmMessage?.(pendingConfirm) ??
              `${pendingConfirm.name} とダイレクトメッセージを開始します。`)
            : 'ダイレクトメッセージを開始します。'
        }
        destructive={false}
        busy={submitting}
        onConfirm={() => void confirmPick()}
        onCancel={cancelConfirm}
      />
    </>
  );
}
