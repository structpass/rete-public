'use client';

import { useState, useRef } from 'react';
import { useOutsideClose } from './use-outside-close';

/**
 * 軽量ドロップダウン（ポップオーバー）の開閉制御フック（hom-0099）。
 * メニュー外クリック / Escape で閉じる挙動を TagFilterDropdown と SelectDropdown で共有する（§3）。
 * ref はトリガー＋メニューを包むルート要素へ付ける（contains 判定の基準）。
 *
 * cmn-0354: 中身を共通基盤 useOutsideClose への委譲へ差し替え（統合方向の反転）。
 * 旧実装（生 window mousedown/keydown）では Esc がシェルまで伝播し IME 変換中の Esc で
 * 誤閉じする地雷があったが、委譲により Esc 消費（useEscapeConsume）・IME ガード・
 * 開いている間だけのリスナー登録が useOutsideClose 経由で自動的に揃う。
 * 外側判定は pointerdown（押した瞬間に閉じる・Desk 系メニューと同一タイミング）で、
 * 旧実装の「外側を押した時点で閉じる」タイミングを維持する。
 *
 * cmn-0354 付随差分（意図的・parity 記録）: Esc は useEscapeConsume のスタック末尾消費
 * （cmn-0280）になるため、同一画面で複数インスタンスが同時に open した場合は Esc 1 押しで
 * 末尾の 1 個だけが閉じる（旧実装は全インスタンスが同時に閉じた）。tags の消費者 2 件に
 * 同時 open の運用は無く、desk 全体の慣行（スタック末尾のみ消費）と一致するため受け入れる。
 */
export function useDropdownPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClose({
    active: open,
    refs: [ref],
    onClose: () => setOpen(false),
    eventType: 'pointerdown',
  });

  return { open, setOpen, ref };
}
