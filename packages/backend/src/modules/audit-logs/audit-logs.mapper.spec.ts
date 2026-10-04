import type { AuditLog } from '@prisma/client';
import { toAuditLogDto } from './audit-logs.mapper';

const row: AuditLog = {
  id: 'a1',
  actorAccountId: 'acc-1',
  actorName: '田中 太郎',
  actorEmail: 'tanaka@struct-pass.io',
  systemId: 'SYS-001',
  systemName: 'system-A 商品管理',
  actionType: 'update',
  feature: '在庫管理',
  summary: 'SKU-1024 在庫数 120 → 170',
  details: null,
  ipAddress: '203.0.113.42',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2026-05-08T00:42:08.000Z'),
};

describe('toAuditLogDto', () => {
  it('表示に必要な列だけを写像し、内部列（actorAccountId / systemId / userAgent / details）は出さない', () => {
    const dto = toAuditLogDto(row);
    expect(dto).toEqual({
      id: 'a1',
      actorName: '田中 太郎',
      actorEmail: 'tanaka@struct-pass.io',
      systemName: 'system-A 商品管理',
      actionType: 'update',
      feature: '在庫管理',
      summary: 'SKU-1024 在庫数 120 → 170',
      ipAddress: '203.0.113.42',
      createdAt: '2026-05-08T00:42:08.000Z',
    });
    // 内部列が DTO に混入していないこと（§1 最小境界）。
    expect(dto).not.toHaveProperty('actorAccountId');
    expect(dto).not.toHaveProperty('systemId');
    expect(dto).not.toHaveProperty('userAgent');
    expect(dto).not.toHaveProperty('details');
  });

  it('ipAddress 不明（null）はそのまま null を返す', () => {
    expect(toAuditLogDto({ ...row, ipAddress: null }).ipAddress).toBeNull();
  });
});
