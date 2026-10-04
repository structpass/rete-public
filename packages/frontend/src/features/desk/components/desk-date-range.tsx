'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useController, type Control } from 'react-hook-form';
import type { TaskFormData } from '@/features/tasks/lib/validations';
import { formatDate } from '@/lib/utils';
import { useOutsideClose } from '@/hooks/use-outside-close';
import { computeFlipPosition } from '../lib/compute-flip-position';

export interface DateRange {
  from: string;
  to: string;
}

interface DeskDateRangePopoverProps {
  from: string;
  to: string;
  onChange: (range: DateRange) => void;
  /** From/To 入力の id 接頭辞（`<prefix>-from` / `<prefix>-to`）。呼び出し元ごとに一意にする。 */
  idPrefix: string;
  /** dialog の aria-label。既定はフィルタの chip 名と同じ「期日範囲」。 */
  ariaLabel?: string;
  /** popover 本体のクラス。既定はフィルタ用の `.desk-filter-daterange-popup`。 */
  className?: string;
  /** 位置（属性パネルの portal 描画で top/left を与える）。 */
  style?: React.CSSProperties;
  /** フィルタ用途の閉じ状態（属性パネルは開いている時だけ描画するため不要）。 */
  hidden?: boolean;
  /**
   * 左（from）の入力ラベル。呼び出し元の項目名に合わせる（v2-170 追補: タスク属性では「開始日」、
   * フィルタの期日範囲では従来どおり「From 日付」）。aria-label も同じ語を使う。
   */
  startLabel?: string;
  /** 右（to）の入力ラベル。タスク属性では「期日」、フィルタでは「To 日付」。 */
  endLabel?: string;
  /** 開いた直後にフォーカスする入力。開始日側から開けば From、期日側から開けば To。 */
  focusField?: 'from' | 'to';
  /** popover 本体の ref（portal 描画側が outside-click 判定に使う）。 */
  popupRef?: React.Ref<HTMLDivElement>;
}

/**
 * 期日範囲 popover の本体（From 日付 / To 日付 + クリア）。v2-170。
 *
 * タスク属性（DeskTaskFields の開始日・期日）と Desk フィルタの期日範囲が**同じ markup を共有する
 * 単一ソース**（architecture-invariants §3 コピペ回避）。位置決めだけをホスト側が持つ:
 * フィルタは chip 直下の absolute（既定クラス）、属性パネルは portal + fixed（`.desk-detail-info` /
 * `.desk-pane-body` の overflow では absolute の popover がクリップされるため）。
 * From/To は入力のたびに onChange へ流す（呼び出し元が即時反映する）。入力ラベルは呼び出し元の
 * 項目名を渡せる（タスク属性=開始日 / 期日・フィルタ=From 日付 / To 日付）。
 */
export function DeskDateRangePopover({
  from,
  to,
  onChange,
  idPrefix,
  ariaLabel = '期日範囲',
  className = 'desk-filter-daterange-popup',
  style,
  hidden,
  startLabel = 'From 日付',
  endLabel = 'To 日付',
  focusField,
  popupRef,
}: DeskDateRangePopoverProps) {
  return (
    <div
      ref={popupRef}
      className={className}
      role="dialog"
      aria-label={ariaLabel}
      style={style}
      hidden={hidden}
      data-testid={`daterange-popover-${idPrefix}`}
    >
      <div className="desk-filter-daterange-grid">
        <div className="desk-filter-daterange-col">
          <label className="desk-filter-daterange-label" htmlFor={`${idPrefix}-from`}>
            {startLabel}
          </label>
          <input
            type="date"
            className="desk-filter-daterange-input"
            id={`${idPrefix}-from`}
            aria-label={startLabel}
            value={from}
            autoFocus={focusField === 'from'}
            onChange={(e) => onChange({ from: e.target.value, to })}
          />
        </div>
        <div className="desk-filter-daterange-col">
          <label className="desk-filter-daterange-label" htmlFor={`${idPrefix}-to`}>
            {endLabel}
          </label>
          <input
            type="date"
            className="desk-filter-daterange-input"
            id={`${idPrefix}-to`}
            aria-label={endLabel}
            value={to}
            autoFocus={focusField === 'to'}
            onChange={(e) => onChange({ from, to: e.target.value })}
          />
        </div>
      </div>
      <div className="desk-filter-daterange-actions">
        <button
          type="button"
          className="desk-filter-daterange-clear-btn"
          onClick={() => onChange({ from: '', to: '' })}
        >
          クリア
        </button>
      </div>
    </div>
  );
}

interface DeskDateRangeFieldsProps {
  /** RHF control（DeskTaskFields が受け取るものをそのまま渡す）。 */
  control: Control<TaskFormData>;
  /** 開始日のフィールドエラー文言。 */
  startError?: string;
  /** 期日のフィールドエラー文言。 */
  dueError?: string;
}

/**
 * タスク属性（開始日 / 期日）の1コンポーネント入力。v2-170。
 *
 * 従来は `type="date"` の入力欄が2つ並び、それぞれが別々のネイティブピッカーを開いていた
 * （同じ日付範囲を入れるのに2回開く必要があった）。行の構成はモック準拠のまま残し、
 * **どちらの行から開いても同じ期日範囲 popover** を出して From/To を1画面で入れる。開始日から
 * 開けば From に、期日から開けば To にフォーカスが入る。入力は即座に RHF の値（startDate /
 * dueDate）へ流すので、閉じた後の行表示（`YYYY/MM/DD`・未設定は「—」）と保存内容が一致する。
 * popover の位置はどちらの行から開いても期日行の下に揃える（2項目を同時に見せるため）。
 *
 * popover は `createPortal` で document.body 直下へ描く（`.desk-detail-info` → `.desk-pane-body` が
 * overflow を持つため absolute 配置ではクリップされる）。位置はトリガ行の実測から与える。
 */
export function DeskDateRangeFields({ control, startError, dueError }: DeskDateRangeFieldsProps) {
  const start = useController({ control, name: 'startDate' });
  const due = useController({ control, name: 'dueDate' });
  const [openField, setOpenField] = useState<'start' | 'due' | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const startBoxRef = useRef<HTMLDivElement>(null);
  const dueBoxRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const dueButtonRef = useRef<HTMLButtonElement>(null);

  useOutsideClose({
    active: openField !== null,
    refs: [startBoxRef, dueBoxRef, popupRef],
    onClose: () => setOpenField(null),
  });

  // popover の位置（期日行の真下・左揃え）。スクロール / リサイズでも追随させる
  // （ToggleFilter の portal popover と同じ扱い）。
  //
  // 開始日・期日は1画面で同時に編集する項目なので、**どちらの行から開いても期日行の下**へ開く
  // （開始日行の下に開くと期日行が popover に隠れ、同時に編集する2項目が見えなくなる）。
  useLayoutEffect(() => {
    if (!openField) return;
    const reposition = () => {
      const anchor = dueButtonRef.current;
      if (!anchor) return;
      const popup = popupRef.current;
      const rect = anchor.getBoundingClientRect();
      setPos(
        computeFlipPosition(
          rect,
          { width: popup?.offsetWidth ?? 0, height: popup?.offsetHeight ?? 0 },
          { preferAbove: false, margin: 8, gap: 4 },
        ),
      );
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [openField]);

  const startValue = start.field.value ?? '';
  const dueValue = due.field.value ?? '';

  // どちらの行から開いても From/To の両方を更新する（1画面で両方をセットできる）。
  const apply = ({ from, to }: DateRange) => {
    if (from !== startValue) start.field.onChange(from);
    if (to !== dueValue) due.field.onChange(to);
  };

  const toggle = (field: 'start' | 'due') => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenField((current) => (current === field ? null : field));
  };

  return (
    <>
      <div className="desk-detail-info-field" ref={startBoxRef}>
        <label className="desk-detail-info-label" htmlFor="dtf-start">
          開始日
        </label>
        <button
          type="button"
          id="dtf-start"
          ref={startButtonRef}
          className="desk-ticket-input desk-daterange-trigger"
          aria-haspopup="dialog"
          aria-expanded={openField === 'start'}
          onClick={toggle('start')}
        >
          {formatDate(startValue)}
        </button>
        {startError && <p className="mt-1 text-xs text-[var(--sp-accent-red)]">{startError}</p>}
      </div>

      <div className="desk-detail-info-field" ref={dueBoxRef}>
        <label className="desk-detail-info-label" htmlFor="dtf-due">
          期日
        </label>
        <button
          type="button"
          id="dtf-due"
          ref={dueButtonRef}
          className="desk-ticket-input desk-daterange-trigger"
          aria-haspopup="dialog"
          aria-expanded={openField === 'due'}
          onClick={toggle('due')}
        >
          {formatDate(dueValue)}
        </button>
        {dueError && <p className="mt-1 text-xs text-[var(--sp-accent-red)]">{dueError}</p>}
      </div>

      {openField !== null &&
        createPortal(
          <DeskDateRangePopover
            from={startValue}
            to={dueValue}
            onChange={apply}
            idPrefix="dtf-daterange"
            ariaLabel="開始日・期日の範囲"
            startLabel="開始日"
            endLabel="期日"
            className="desk-filter-daterange-popup desk-detail-daterange-popup"
            style={{ top: pos.top, left: pos.left }}
            focusField={openField === 'start' ? 'from' : 'to'}
            popupRef={popupRef}
          />,
          document.body,
        )}
    </>
  );
}
