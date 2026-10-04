import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

/**
 * CreateTaskDto の検証境界テスト（rete-desk-0062 回帰）。
 * assigneeId は nullable-optional: null（割当解除）と undefined（未指定）を受理し、UUID 以外の文字列は拒否する。
 * 旧バグ: @IsUUID + @IsOptional のみだと explicit null を弾き、未割当 create/update が全て 400 になっていた。
 * service spec は repository mock が DTO 検証を素通りするため検出できず、DTO 層で固める。
 */
const VALID_UUID = '11111111-1111-4111-8111-111111111111';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateTaskDto, payload);
  return validate(dto);
}

describe('CreateTaskDto — assigneeId 境界', () => {
  const base = { title: 'タスク', categoryId: 1 };

  it('assigneeId=UUID を受理すること（割当）', async () => {
    const errors = await errorsFor({ ...base, assigneeId: VALID_UUID });
    expect(errors.some((e) => e.property === 'assigneeId')).toBe(false);
  });

  it('assigneeId=null を受理すること（割当解除）', async () => {
    const errors = await errorsFor({ ...base, assigneeId: null });
    expect(errors.some((e) => e.property === 'assigneeId')).toBe(false);
  });

  it('assigneeId 省略（undefined）を受理すること（未指定）', async () => {
    const errors = await errorsFor({ ...base });
    expect(errors.some((e) => e.property === 'assigneeId')).toBe(false);
  });

  it('assigneeId が UUID でない文字列なら検証エラーになること', async () => {
    const errors = await errorsFor({ ...base, assigneeId: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'assigneeId')).toBe(true);
  });
});
