'use client';

import { useEffect, useRef } from 'react';
import { stepIndex, nearestIndexByCenter } from '../lib/keyboard-nav';
import { applyQuietFocus } from '../utils/quiet-focus';
// view 型は A1 状態機械（use-desk-view-state）が SSOT。ここでは再宣言せず import する。
import type { DeskLeftView, DeskRightView } from './use-desk-view-state';

/**
 * Desk キーボードナビ フック。
 *
 * モック `desk/index.html` のキーボード移動（↑↓ 行移動 / ←→ 反対ペイン最近傍 / Tab パネル移動）を
 * React の A1 状態機械（use-desk-view-state）の上に移植したもの。状態機械の構造は変えず、
 * 既存の view アクション（openThread / openTaskDetail / closeLeft / closeRight）を呼び分けるだけ。
 *
 * モックとの差分（意図は保持）:
 * - モックの closeLeft/closeRight は同期 DOM class トグルで、閉じた直後に最近傍を計算できる。
 *   React では state 更新→再描画が非同期のため、←→ でオーバーレイを閉じる場合は再描画後（view が
 *   is-active に戻った後）に最近傍を計算するよう effect に遅延させる。
 * - タスク行はモックでは div 想定だが React では `<button>`。「行内の別インタラクティブ要素では
 *   素通し」というガードの意図を保ちつつ、行ボタン自身へのフォーカス時は ↑↓ を有効にする。
 */

export interface DeskKeyboardNavArgs {
  leftView: DeskLeftView;
  rightView: DeskRightView;
  openThread: (themeId: string) => void;
  openTaskDetail: (taskId: number) => void;
  closeLeft: () => void;
  closeRight: () => void;
  /** アクティブ枠（単一カーソル）だけを移動先へ動かす（開かない・dsk-0410）。 */
  setActiveTheme: (themeId: string) => void;
  setActiveTask: (taskId: number) => void;
}

const LIST_SELECTOR = '[data-left-view="list"]';
const TREE_SELECTOR = '[data-right-view="tree"]';
const CHAT_CARD = '.desk-chat-card';
const TASK_ROW = '.desk-task-row';

/** 行/カードがナビ対象か。is-pending（仮挿入）/ is-hidden（検索で絞り込み）/ 非アクティブ view 配下を除外。 */
function isNavigable(el: Element): boolean {
  if (el.classList.contains('is-pending')) return false;
  if (el.classList.contains('is-hidden')) return false; // 統合検索で隠れた行はナビ対象外（C-検索）
  const view = el.closest('.desk-view');
  if (view && !view.classList.contains('is-active')) return false;
  return true;
}

function queryVisible(containerSelector: string, itemSelector: string): HTMLElement[] {
  const container = document.querySelector(containerSelector);
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(itemSelector)).filter(isNavigable);
}

const visibleCards = () => queryVisible(LIST_SELECTOR, CHAT_CARD);
const visibleRows = () => queryVisible(TREE_SELECTOR, TASK_ROW);

function centerOf(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
}

/** 最近傍行へフォーカスし、その要素を返す（対象なしは null・dsk-0410 で戻り値化）。 */
function focusNearest(items: HTMLElement[], sourceCenter: number): HTMLElement | null {
  const idx = nearestIndexByCenter(sourceCenter, items.map(centerOf));
  if (idx == null) return null;
  items[idx].focus();
  return items[idx];
}

function themeIdOf(el: HTMLElement): string | null {
  return el.getAttribute('data-theme-id');
}

/** data-task-id を正の整数として読む。非数値・不正値は null（openTaskDetail(NaN) を防ぐ防御ガード）。 */
function taskIdOf(el: HTMLElement): number | null {
  const raw = el.getAttribute('data-task-id');
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type PendingNav = { target: 'task' | 'chat'; sourceCenter: number };

export function useDeskKeyboardNav(args: DeskKeyboardNavArgs): void {
  const argsRef = useRef(args);
  argsRef.current = args;
  const pendingNav = useRef<PendingNav | null>(null);

  // ----- ←→ でオーバーレイを閉じた場合の遅延最近傍フォーカス（再描画で対象 view が可視化された後） -----
  useEffect(() => {
    const p = pendingNav.current;
    if (p?.target === 'task' && args.rightView === 'tree') {
      pendingNav.current = null;
      const el = focusNearest(visibleRows(), p.sourceCenter);
      // dsk-0410: アクティブ枠（単一カーソル）を移動先へ。移動元枠は view-state の相互排他で消える。
      const id = el ? taskIdOf(el) : null;
      if (id != null) argsRef.current.setActiveTask(id);
    }
  }, [args.rightView]);

  useEffect(() => {
    const p = pendingNav.current;
    if (p?.target === 'chat' && args.leftView === 'list') {
      pendingNav.current = null;
      const el = focusNearest(visibleCards(), p.sourceCenter);
      const id = el ? themeIdOf(el) : null;
      if (id != null) argsRef.current.setActiveTheme(id);
    }
  }, [args.leftView]);

  useEffect(() => {
    function moveAndFollow(
      current: HTMLElement | null,
      items: HTMLElement[],
      delta: number,
      e: KeyboardEvent,
      follow?: (el: HTMLElement) => void,
    ): void {
      if (!current) return;
      const idx = items.indexOf(current);
      const nextIdx = stepIndex(items.length, idx, delta);
      // edge-stop（端で null）時はモック準拠で preventDefault せず、ブラウザ標準の
      // フォーカス移動（Tab で明細の外へ抜ける / ↑↓ は何もしない）に委ねる（mock L3907）。
      if (nextIdx == null) return;
      e.preventDefault();
      const next = items[nextIdx];
      // dsk-0392: Esc/トグル閉じ直後（移動元が目印 data-quiet-focus 保持中）の行移動は、移動先も
      // :focus-visible に昇格して teal 枠が出るため、目印を移動先へ引き継いで枠のみ抑止する。
      // 目印なし（Tab ネイティブ到達など）の枠は従来通り＝WCAG 2.4.7 のカーソル可視化を退行させない。
      // 判定は focus() の前に取る（focus() の focusout で移動元の目印が外れるため）。
      const quiet = current.hasAttribute('data-quiet-focus');
      next.focus();
      if (quiet) applyQuietFocus(next);
      follow?.(next);
    }

    function horizontalTo(target: 'task' | 'chat', current: HTMLElement, e: KeyboardEvent): void {
      e.preventDefault();
      const a = argsRef.current;
      const sourceCenter = centerOf(current);
      // モック準拠（mock L3958/L4031）: 移動元のカーソルフォーカスを外す。最近傍が無く
      // focus() 移動が起きない場合でも明示的にカーソルを解除する意図。
      if (typeof current.blur === 'function') current.blur();
      const overlayOpen = target === 'task' ? a.rightView === 'thread' : a.leftView === 'detail';
      if (overlayOpen) {
        // 対象ペインはオーバーレイで hidden。閉じて再描画後に effect が最近傍へフォーカスする。
        // pendingNav は horizontalTo（overlayOpen 時）でのみセットされ、直後の closeLeft/closeRight が
        // A1 状態機械上で必ず target view を is-active に戻すため、対の effect が次サイクルで消費する。
        pendingNav.current = { target, sourceCenter };
        if (target === 'task') a.closeRight();
        else a.closeLeft();
      } else {
        const el = focusNearest(target === 'task' ? visibleRows() : visibleCards(), sourceCenter);
        // dsk-0410: アクティブ枠（単一カーソル）を移動先へ。最近傍が無い（対象ペイン空）時は
        // カーソル不動＝枠も動かさない。
        if (el) {
          if (target === 'task') {
            const id = taskIdOf(el);
            if (id != null) a.setActiveTask(id);
          } else {
            const id = themeIdOf(el);
            if (id != null) a.setActiveTheme(id);
          }
        }
      }
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') return; // ESC は desk-shell が処理
      const a = argsRef.current;
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;

      const list = document.querySelector(LIST_SELECTOR);
      const tree = document.querySelector(TREE_SELECTOR);
      const inChat = !!(list && list.contains(active));
      const inTask = !!(tree && tree.contains(active));

      // ----- Tab: オーバーレイ表示中、反対の明細にフォーカス時に隣へ送り詳細も切替 -----
      // Tab はオーバーレイ表示中しか発火せず follow の openThread/openTaskDetail が selected を動かす
      // ため、アクティブ枠は view-state 側の effect 経由で追従する（setActive* の明示呼びは不要・dsk-0410）。
      if (e.key === 'Tab') {
        if (a.rightView === 'thread' && inChat) {
          const current = active.closest(CHAT_CARD) as HTMLElement | null;
          moveAndFollow(current, visibleCards(), e.shiftKey ? -1 : 1, e, (el) => {
            const id = themeIdOf(el);
            if (id != null) a.openThread(id);
          });
        } else if (a.leftView === 'detail' && inTask) {
          const current = active.closest(TASK_ROW) as HTMLElement | null;
          moveAndFollow(current, visibleRows(), e.shiftKey ? -1 : 1, e, (el) => {
            const id = taskIdOf(el);
            if (id != null) a.openTaskDetail(id);
          });
        }
        return;
      }

      const isArrow =
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight';
      if (!isArrow) return;
      if (e.isComposing) return; // IME 変換中は素通し

      // ----- チャット明細: ↑↓ 行移動 / → タスク明細へ最近傍 -----
      if (inChat && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowRight')) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return;
        const current = active.closest(CHAT_CARD) as HTMLElement | null;
        if (!current) return;
        if (e.key === 'ArrowRight') {
          horizontalTo('task', current, e);
          return;
        }
        moveAndFollow(current, visibleCards(), e.key === 'ArrowDown' ? 1 : -1, e, (el) => {
          const id = themeIdOf(el);
          if (id == null) return;
          // dsk-0410: アクティブ枠（単一カーソル）は詳細の開閉に依らず常に追従。詳細は表示中のみ切替。
          a.setActiveTheme(id);
          if (a.rightView === 'thread') a.openThread(id);
        });
        return;
      }

      // ----- タスク明細: ↑↓ 行移動 / ← チャット明細へ最近傍 -----
      if (inTask && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft')) {
        const current = active.closest(TASK_ROW) as HTMLElement | null;
        if (!current) return;
        // 行ボタン自身は ↑↓ 対象。行内の別インタラクティブ要素にフォーカス時のみ素通し。
        if (active !== current) {
          const tag = active.tagName;
          if (
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            tag === 'BUTTON' ||
            tag === 'A' ||
            active.isContentEditable
          ) {
            return;
          }
        }
        if (e.key === 'ArrowLeft') {
          horizontalTo('chat', current, e);
          return;
        }
        moveAndFollow(current, visibleRows(), e.key === 'ArrowDown' ? 1 : -1, e, (el) => {
          const id = taskIdOf(el);
          if (id == null) return;
          // dsk-0410: 同上（タスク側）。
          a.setActiveTask(id);
          if (a.leftView === 'detail') a.openTaskDetail(id);
        });
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
