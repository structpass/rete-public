import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeskParentField } from '../components/desk-parent-field';
import { useTaskForm } from '@/features/tasks/hooks/use-task-form';
import type { ParentTaskOption } from '@/features/tasks/lib/api';

const parents: ParentTaskOption[] = [
  { id: 10, title: '親A', categoryId: 1 },
  { id: 20, title: '親B', categoryId: 2 },
];

/**
 * useTaskForm の register/watch/setValue で DeskParentField を駆動し、
 * 分類連動（親選択→分類強制 / 分類手動変更→親クリア）を検証するためのホスト。
 * 分類は別 select として並置し、双方向の cross-field 挙動を観測する。
 */
function Host({ defaultValues }: { defaultValues?: Parameters<typeof useTaskForm>[0] }) {
  const {
    register,
    watch,
    setValue,
    formState: { isDirty },
  } = useTaskForm(defaultValues);
  return (
    <form aria-label="host">
      <output aria-label="dirty">{isDirty ? 'dirty' : 'clean'}</output>
      <select aria-label="分類" {...register('categoryId')}>
        <option value="">未選択</option>
        <option value="1">入荷</option>
        <option value="2">出荷</option>
      </select>
      <DeskParentField
        register={register}
        watch={watch}
        setValue={setValue}
        parentTasks={parents}
      />
    </form>
  );
}

describe('DeskParentField — 親 picker の分類連動（rete-desk-0072）', () => {
  it('親を選ぶと分類がその親の分類へ強制されること', () => {
    render(<Host />);
    const category = screen.getByLabelText('分類') as HTMLSelectElement;
    const parent = screen.getByLabelText('親タスク') as HTMLSelectElement;
    expect(category.value).toBe('');

    fireEvent.change(parent, { target: { value: '20' } }); // 親B (categoryId=2)
    expect(category.value).toBe('2');
    expect(parent.value).toBe('20');
  });

  it('分類を親と異なる値へ手動変更すると親選択がクリアされること', () => {
    render(<Host />);
    const category = screen.getByLabelText('分類') as HTMLSelectElement;
    const parent = screen.getByLabelText('親タスク') as HTMLSelectElement;

    fireEvent.change(parent, { target: { value: '10' } }); // 親A (categoryId=1)
    expect(category.value).toBe('1');

    fireEvent.change(category, { target: { value: '2' } }); // 親A の分類(1)と不一致
    expect(parent.value).toBe(''); // 親はクリア
    expect(category.value).toBe('2'); // 分類はユーザー選択を維持
  });

  // dsk-0229: 子の分類が親の分類と食い違って保存されている（No27 = 子cat1 / 親No25 cat2）タスクを
  // 開いただけで、マウント時 linkage が分類を親へ自動補正して phantom dirty になり、未編集なのに
  // 閉じる時の破棄確認が誤発火していた。マウント時は補正を発火させず clean のままであることを担保する。
  it('親と分類が食い違う子タスクを開いてもマウント時に dirty にならないこと', async () => {
    render(<Host defaultValues={{ parentTaskId: '20', categoryId: '1' }} />); // 親B=cat2 vs 子=cat1
    const dirty = screen.getByLabelText('dirty');
    const category = screen.getByLabelText('分類') as HTMLSelectElement;
    // effect が一巡しても分類は保存値(1)のまま・dirty にならない（自動補正しない）。
    await waitFor(() => expect(dirty).toHaveTextContent('clean'));
    expect(category.value).toBe('1');
  });

  it('マウント後にユーザーが親を変えた時は従来どおり分類連動が働くこと', () => {
    render(<Host defaultValues={{ parentTaskId: '20', categoryId: '1' }} />);
    const category = screen.getByLabelText('分類') as HTMLSelectElement;
    const parent = screen.getByLabelText('親タスク') as HTMLSelectElement;
    expect(category.value).toBe('1'); // マウント時は補正しない
    fireEvent.change(parent, { target: { value: '10' } }); // 親A=cat1 へ変更…ではなく
    fireEvent.change(parent, { target: { value: '20' } }); // 親B=cat2 を選び直す（実変更）
    expect(category.value).toBe('2'); // ユーザー操作なら親の分類へ連動する
  });

  it('「親なし（トップレベル）」を選ぶと分類は変更されないこと', () => {
    render(<Host />);
    const category = screen.getByLabelText('分類') as HTMLSelectElement;
    const parent = screen.getByLabelText('親タスク') as HTMLSelectElement;

    fireEvent.change(category, { target: { value: '2' } });
    fireEvent.change(parent, { target: { value: '' } }); // 親なし
    expect(category.value).toBe('2'); // 強制されない
  });
});
