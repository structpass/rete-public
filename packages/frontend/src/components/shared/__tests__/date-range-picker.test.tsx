import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { computePopoverLeft, FilterDateRange, type DateRangeValue } from '../date-range-picker';

/**
 * v2-185: 期間（From/To）を1つのピッカーで選ぶ部品。
 *
 * 要求版2で「2カレンダー」から「1ピッカー・連続2ヶ月の範囲選択」へ変えた。初期値が無い時の月は
 * 実行時の当月になるため、月を固定する検査は初期値を与える（2026-09 は 30 日・2026-10 は 31 日）。
 * 実行時の月に依存する検査は、その月のラベルを組み立てて指す（5日・10日はどの月にも存在する）。
 */
function Harness({ initial = { from: '', to: '' } }: { initial?: DateRangeValue }) {
  const [value, setValue] = useState<DateRangeValue>(initial);
  return (
    <div>
      <FilterDateRange from={value.from} to={value.to} onChange={setValue} />
      <div data-testid="outside">外側</div>
      <output data-testid="value">{`${value.from}|${value.to}`}</output>
    </div>
  );
}

const picker = () => screen.getByRole('group', { name: '期間のカレンダー' });
const months = () => Array.from(picker().querySelectorAll('.sp-daterange-month')) as HTMLElement[];
const titles = () =>
  months().map((m) => m.querySelector('.sp-daterange-cal-title')?.textContent ?? '');
const day = (monthIndex: number, name: string) =>
  within(months()[monthIndex]).getByRole('button', { name });
const value = () => screen.getByTestId('value').textContent;
const openFrom = () => fireEvent.click(screen.getByRole('button', { name: '開始日' }));
const openTo = () => fireEvent.click(screen.getByRole('button', { name: '終了日' }));

const pad = (n: number) => `${n}`.padStart(2, '0');
const now = new Date();
const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const monthTitle = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月`;
const dayName = (d: Date, n: number) => `${d.getFullYear()}年${d.getMonth() + 1}月${n}日`;
const dayValue = (d: Date, n: number) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(n)}`;

describe('FilterDateRange', () => {
  it('開始日の欄から開くと、1つのピッカーに連続する2ヶ月が並ぶ', () => {
    render(<Harness initial={{ from: '2026-09-01', to: '' }} />);
    // 開く前は popover を描かない。
    expect(screen.queryByRole('dialog', { name: '期間の範囲' })).not.toBeInTheDocument();

    openFrom();

    // ピッカー（カレンダー）は1つだけ。dialog も1つ。
    expect(screen.getByRole('dialog', { name: '期間の範囲' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: '期間のカレンダー' })).toHaveLength(1);
    // 開始日の月と、その翌月が同時に見える。
    expect(titles()).toEqual(['2026年9月', '2026年10月']);
    expect(within(months()[0]).getAllByRole('button')).toHaveLength(30);
    expect(within(months()[1]).getAllByRole('button')).toHaveLength(31);
  });

  it('終了日の欄から開いても同じ1つのピッカーが出る', () => {
    render(<Harness initial={{ from: '2026-09-01', to: '' }} />);
    openTo();
    expect(screen.getAllByRole('dialog', { name: '期間の範囲' })).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: '期間のカレンダー' })).toHaveLength(1);
    expect(titles()).toEqual(['2026年9月', '2026年10月']);
  });

  it('1回目のクリックで開始日、2回目のクリックで終了日が呼び出し元へ入る', () => {
    render(<Harness />);
    openFrom();

    fireEvent.click(day(0, dayName(now, 10)));
    expect(value()).toBe(`${dayValue(now, 10)}|`);
    // 呼び出し元の欄（trigger）にも即時反映する（YYYY/MM/DD 表示）。
    expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent(
      `${now.getFullYear()}/${pad(now.getMonth() + 1)}/10`,
    );

    // 2回目は翌月の日付（月跨ぎでも1画面で選べる）。
    fireEvent.click(day(1, dayName(next, 5)));
    expect(value()).toBe(`${dayValue(now, 10)}|${dayValue(next, 5)}`);
    expect(screen.getByRole('button', { name: '終了日' })).toHaveTextContent(
      `${next.getFullYear()}/${pad(next.getMonth() + 1)}/05`,
    );
  });

  it('両方入った後に日付を押すと新しい開始日になり、終了日は空へ戻る', () => {
    render(<Harness initial={{ from: '2026-09-10', to: '2026-09-15' }} />);
    openFrom();

    fireEvent.click(day(0, '2026年9月20日'));

    expect(value()).toBe('2026-09-20|');
  });

  it('開始日より前の日を2回目に押すと、開始日がその日へ移る', () => {
    render(<Harness initial={{ from: '2026-09-10', to: '' }} />);
    openFrom();

    fireEvent.click(day(0, '2026年9月5日'));

    expect(value()).toBe('2026-09-05|');
  });

  it('選択した開始日・終了日と、その間の日が区別して塗られる（月跨ぎ）', () => {
    render(<Harness initial={{ from: '2026-09-10', to: '2026-10-05' }} />);
    openFrom();

    expect(day(0, '2026年9月10日')).toHaveClass('is-selected');
    expect(day(0, '2026年9月12日')).toHaveClass('is-in-range');
    expect(day(0, '2026年9月9日')).not.toHaveClass('is-in-range');
    expect(day(1, '2026年10月5日')).toHaveClass('is-selected');
    expect(day(1, '2026年10月1日')).toHaveClass('is-in-range');
    expect(day(1, '2026年10月6日')).not.toHaveClass('is-in-range');
  });

  it('月送りで2ヶ月が1ヶ月ずつ一緒に動く', () => {
    render(<Harness initial={{ from: '2026-09-01', to: '' }} />);
    openFrom();

    fireEvent.click(screen.getByRole('button', { name: '次の月' }));
    expect(titles()).toEqual(['2026年10月', '2026年11月']);

    fireEvent.click(screen.getByRole('button', { name: '前の月' }));
    fireEvent.click(screen.getByRole('button', { name: '前の月' }));
    expect(titles()).toEqual(['2026年8月', '2026年9月']);
  });

  it('開き直すと選択済みの月へ戻る（前回の月送りを引き継がない）', () => {
    render(<Harness initial={{ from: '2026-09-10', to: '' }} />);
    openFrom();
    fireEvent.click(screen.getByRole('button', { name: '次の月' }));
    expect(titles()).toEqual(['2026年10月', '2026年11月']);

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    openFrom();

    expect(titles()).toEqual(['2026年9月', '2026年10月']);
  });

  it('クリアで両方が空に戻る', () => {
    render(<Harness initial={{ from: '2026-09-10', to: '2026-09-15' }} />);
    openFrom();

    fireEvent.click(screen.getByRole('button', { name: 'クリア' }));

    expect(value()).toBe('|');
    expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent('開始日');
    expect(screen.getByRole('button', { name: '終了日' })).toHaveTextContent('終了日');
  });

  it('Esc で閉じる', () => {
    render(<Harness />);
    openFrom();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '期間の範囲' })).not.toBeInTheDocument();
  });

  it('外側クリックで閉じる', () => {
    render(<Harness />);
    openFrom();
    fireEvent.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('dialog', { name: '期間の範囲' })).not.toBeInTheDocument();
  });

  it('閉じるボタンで閉じる', () => {
    render(<Harness />);
    openFrom();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog', { name: '期間の範囲' })).not.toBeInTheDocument();
  });

  it('実在しない日付は月の決定に使わない（Date の繰り上げで別の月へずれない）', () => {
    render(<Harness initial={{ from: '2026-02-31', to: '' }} />);
    openFrom();
    // 2026-02-31 は実在しない。繰り上がった 2026年3月 を出さず、当月へフォールバックする。
    expect(titles()).toEqual([monthTitle(now), monthTitle(next)]);
  });

  it('欄は値の表示だけを行うボタンで、未設定は項目名・設定後は YYYY/MM/DD を出す', () => {
    render(<Harness />);
    const fromTrigger = screen.getByRole('button', { name: '開始日' });
    expect(fromTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(fromTrigger).toHaveTextContent('開始日');
    expect(screen.getByRole('button', { name: '終了日' })).toHaveTextContent('終了日');
  });

  it('どちらの欄から開いても、同じ trigger をもう一度押すと閉じる', () => {
    render(<Harness />);
    openFrom();
    openTo();
    expect(screen.getByRole('dialog', { name: '期間の範囲' })).toBeInTheDocument();

    openTo();
    expect(screen.queryByRole('dialog', { name: '期間の範囲' })).not.toBeInTheDocument();
  });

  it('「下限を設定」で開始日に 1900/01/01 が入り、終了日は残る', () => {
    render(<Harness initial={{ from: '', to: '2026-10-05' }} />);
    openFrom();

    fireEvent.click(screen.getByRole('button', { name: '下限を設定' }));

    expect(value()).toBe('1900-01-01|2026-10-05');
    expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent('1900/01/01');
  });

  it('「上限を設定」で終了日に 9999/12/31 が入り、開始日は残る', () => {
    render(<Harness initial={{ from: '2026-09-10', to: '' }} />);
    openFrom();

    fireEvent.click(screen.getByRole('button', { name: '上限を設定' }));

    expect(value()).toBe('2026-09-10|9999-12-31');
    expect(screen.getByRole('button', { name: '終了日' })).toHaveTextContent('9999/12/31');
  });

  it('下限・上限を入れた後に開き直しても、1900年1月や9999年12月を出さない', () => {
    render(<Harness initial={{ from: '1900-01-01', to: '9999-12-31' }} />);
    openFrom();

    expect(titles()).toEqual([monthTitle(now), monthTitle(next)]);
  });

  it('両端とも下限・上限の時は範囲を塗らない（端を開いた状態）', () => {
    render(<Harness initial={{ from: '1900-01-01', to: '9999-12-31' }} />);
    openFrom();

    expect(picker().querySelectorAll('.sp-daterange-day.is-in-range')).toHaveLength(0);
    expect(picker().querySelectorAll('.sp-daterange-day.is-selected')).toHaveLength(0);
  });

  it('終了日だけの状態で日付を押すと、開始日が入り終了日は残る', () => {
    render(<Harness initial={{ from: '', to: '2026-10-05' }} />);
    openFrom();

    fireEvent.click(day(0, '2026年10月3日'));

    expect(value()).toBe('2026-10-03|2026-10-05');
  });
});

/**
 * v2-187: 開く位置を表示領域内へ収める算出。
 *
 * 引数の数値は実測値（1440x900 / 1024x768 / 800x600・admin の実画面）を使う。
 * 期間欄グループの実寸は 292px（260..552 の時は左端 260）、popover の幅は 514px。
 */
describe('computePopoverLeft', () => {
  const WIDTH = 514;

  it('右端基準で収まる時は右端を基準にする（1440x900 / 1024x768 の実測値）', () => {
    // 1440x900: 期間欄グループ 637.6..929.6・可視範囲 248..1425
    expect(
      computePopoverLeft({ left: 637.6, right: 929.6 }, WIDTH, { left: 248, right: 1425 }),
    ).toBe(415.6);
    // 1024x768: 同じグループ位置・可視範囲 248..1009
    expect(
      computePopoverLeft({ left: 637.6, right: 929.6 }, WIDTH, { left: 248, right: 1009 }),
    ).toBe(415.6);
  });

  it('右端基準では左へはみ出す時は左端基準へ切り替える（800x600 の実測値）', () => {
    // 800x600: 期間欄グループ 260..552・可視範囲 248..785。右端基準だと左端 38 で 210px はみ出す。
    expect(computePopoverLeft({ left: 260, right: 552 }, WIDTH, { left: 248, right: 785 })).toBe(
      260,
    );
  });

  it('どちらでも収まらない時は表示領域の左端へ寄せる', () => {
    expect(computePopoverLeft({ left: 400, right: 700 }, WIDTH, { left: 300, right: 700 })).toBe(
      300,
    );
  });

  it('可視範囲が popover より狭い時も左端を表示領域の内側に置く', () => {
    expect(computePopoverLeft({ left: 260, right: 552 }, WIDTH, { left: 248, right: 500 })).toBe(
      248,
    );
  });
});
