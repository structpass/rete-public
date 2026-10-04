import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryAuditLogsDto } from './query-audit-logs.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(QueryAuditLogsDto, payload);
  return { dto, errors: await validate(dto, { whitelist: true }) };
}

describe('QueryAuditLogsDto', () => {
  it('空クエリは既定 page=1 / limit=20 で受理する', async () => {
    const { dto, errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('page / limit を数値へ変換する（クエリ文字列由来）', async () => {
    const { dto, errors } = await errorsFor({ page: '3', limit: '50' });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it('limit が上限（100）を超えたら拒否する', async () => {
    const { errors } = await errorsFor({ limit: '101' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('正当な actionType / systemId / 期間を受理する', async () => {
    const { errors } = await errorsFor({
      actionType: 'login',
      systemId: 'SYS-001',
      from: '2026-05-01',
      to: '2026-05-08',
      search: '田中',
    });
    expect(errors).toHaveLength(0);
  });

  it('値域外の actionType を拒否する', async () => {
    const { errors } = await errorsFor({ actionType: 'destroy' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('日付形式でない from を拒否する', async () => {
    const { errors } = await errorsFor({ from: 'yesterday' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
