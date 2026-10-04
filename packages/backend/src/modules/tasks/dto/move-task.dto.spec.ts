import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MoveTaskDto } from './move-task.dto';

/**
 * MoveTaskDto の検証境界テスト。
 * move payload は parentTaskId / afterTaskId が null 許容、categoryId は必須正整数。
 * class-validator のデコレータが期待通りに型・null を受理/拒否することを確認する。
 */
async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(MoveTaskDto, payload);
  return validate(dto);
}

describe('MoveTaskDto', () => {
  it('parentTaskId=number / afterTaskId=number / categoryId=number を受理すること', async () => {
    const errors = await errorsFor({ parentTaskId: 5, categoryId: 2, afterTaskId: 9 });
    expect(errors).toHaveLength(0);
  });

  it('parentTaskId=null / afterTaskId=null を受理すること（トップレベル先頭挿入）', async () => {
    const errors = await errorsFor({ parentTaskId: null, categoryId: 2, afterTaskId: null });
    expect(errors).toHaveLength(0);
  });

  it('categoryId が欠落していれば検証エラーになること（必須）', async () => {
    const errors = await errorsFor({ parentTaskId: null, afterTaskId: null });
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('parentTaskId が文字列なら検証エラーになること', async () => {
    const errors = await errorsFor({ parentTaskId: 'x', categoryId: 2, afterTaskId: null });
    expect(errors.some((e) => e.property === 'parentTaskId')).toBe(true);
  });

  it('afterTaskId が文字列なら検証エラーになること', async () => {
    const errors = await errorsFor({ parentTaskId: null, categoryId: 2, afterTaskId: 'x' });
    expect(errors.some((e) => e.property === 'afterTaskId')).toBe(true);
  });

  it('categoryId が 0 以下なら検証エラーになること（正整数）', async () => {
    const errors = await errorsFor({ parentTaskId: null, categoryId: 0, afterTaskId: null });
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  // parentTaskId / afterTaskId は「null 許容・undefined 拒否」。フィールド省略（undefined）は
  // @ValidateIf(value !== null) を素通りしてしまうため @IsDefined() で必須化する（指摘[2]）。
  it('parentTaskId が省略（undefined）なら検証エラーになること', async () => {
    const errors = await errorsFor({ categoryId: 2, afterTaskId: null });
    expect(errors.some((e) => e.property === 'parentTaskId')).toBe(true);
  });

  it('afterTaskId が省略（undefined）なら検証エラーになること', async () => {
    const errors = await errorsFor({ parentTaskId: null, categoryId: 2 });
    expect(errors.some((e) => e.property === 'afterTaskId')).toBe(true);
  });
});
