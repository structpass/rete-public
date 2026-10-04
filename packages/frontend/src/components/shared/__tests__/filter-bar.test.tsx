import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { CircleCheckBig } from 'lucide-react';
import { FilterBar, FilterChipSelect, FilterClear, FilterSearchInput } from '../filter-bar';

const OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'active', label: '有効' },
  { value: 'locked', label: 'ロック中' },
] as const;

function Harness() {
  const [value, setValue] = useState<'all' | 'active' | 'locked'>('all');
  return (
    <FilterBar>
      <FilterChipSelect
        icon={CircleCheckBig}
        label="状態"
        ariaLabel="状態で絞り込み"
        value={value}
        onChange={setValue}
        options={[...OPTIONS]}
      />
    </FilterBar>
  );
}

describe('FilterSearchInput', () => {
  it('入力で onChange に値を渡す', () => {
    const onChange = vi.fn();
    render(<FilterSearchInput placeholder="名前で検索..." value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('名前で検索...'), { target: { value: '山田' } });
    expect(onChange).toHaveBeenCalledWith('山田');
  });

  it('値ありで Escape → クリアし伝搬を止める（値なしは素通し・mdl-0033）', () => {
    const onChange = vi.fn();
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <FilterSearchInput placeholder="名前で検索..." value="山田" onChange={onChange} />
      </div>,
    );
    const input = screen.getByPlaceholderText('名前で検索...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
    expect(onOuterKeyDown).not.toHaveBeenCalled();
  });

  it('値なしの Escape は親へ伝搬する（オーバーレイの Esc 閉じを壊さない）', () => {
    const onChange = vi.fn();
    const onOuterKeyDown = vi.fn();
    render(
      <div onKeyDown={onOuterKeyDown}>
        <FilterSearchInput placeholder="名前で検索..." value="" onChange={onChange} />
      </div>,
    );
    fireEvent.keyDown(screen.getByPlaceholderText('名前で検索...'), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(onOuterKeyDown).toHaveBeenCalled();
  });
});

describe('FilterChipSelect', () => {
  it('チップクリックで listbox が開き、option 選択で値確定と同時に閉じる', () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: '状態で絞り込み' });
    // 既定値ではラベルのみ・非アクティブ。
    expect(chip).toHaveTextContent('状態');
    expect(chip).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'ロック中' }));

    // 選択で閉じ、chip は is-active になる。ラベルは固定表示のまま
    // （「ラベル: 選択値」形式は複数選択に対応できないため不採用・mdl-0033）。
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(chip).toHaveTextContent('状態');
    expect(chip).not.toHaveTextContent('ロック中');
    expect(chip.parentElement).toHaveClass('is-active');
  });

  it('既定値（先頭 option）を選び直すと非アクティブへ戻る', () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: '状態で絞り込み' });
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole('option', { name: '有効' }));
    expect(chip.parentElement).toHaveClass('is-active');

    fireEvent.click(chip);
    fireEvent.click(screen.getByRole('option', { name: 'すべて' }));
    expect(chip.parentElement).not.toHaveClass('is-active');
    expect(chip).toHaveTextContent('状態');
  });

  it('Enter キーでも option を選択できる（a11y）', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '状態で絞り込み' }));
    fireEvent.keyDown(screen.getByRole('option', { name: '有効' }), { key: 'Enter' });
    // ラベルは固定表示のため、選択の成立は is-active で確認する（mdl-0033）。
    expect(screen.getByRole('button', { name: '状態で絞り込み' }).parentElement).toHaveClass(
      'is-active',
    );
  });
});

describe('FilterClear', () => {
  it('クリックで onClick が呼ばれる（RotateCcw+「クリア」常設ボタン）', () => {
    const onClick = vi.fn();
    render(<FilterClear onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'フィルタをクリア' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
