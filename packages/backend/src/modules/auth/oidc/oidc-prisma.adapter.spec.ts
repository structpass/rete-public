import type { Adapter } from 'oidc-provider';
import { createOidcPrismaAdapter } from './oidc-prisma.adapter';
import type { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  oidcPayload: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const NOW = new Date('2026-06-03T00:00:00.000Z');

describe('createOidcPrismaAdapter (PrismaAdapter)', () => {
  let adapter: Adapter;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    const PrismaAdapter = createOidcPrismaAdapter(mockPrisma as unknown as PrismaService);
    adapter = new PrismaAdapter('Session');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('upsert', () => {
    it('expiresIn から expiresAt を算出し、type/modelId 複合キーで upsert すること', async () => {
      await adapter.upsert(
        'sid-1',
        { grantId: 'g-1', userCode: 'uc-1', uid: 'uid-1' } as never,
        3600,
      );

      const arg = mockPrisma.oidcPayload.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ type_modelId: { type: 'Session', modelId: 'sid-1' } });
      expect(arg.create).toMatchObject({
        type: 'Session',
        modelId: 'sid-1',
        grantId: 'g-1',
        userCode: 'uc-1',
        uid: 'uid-1',
        expiresAt: new Date(NOW.getTime() + 3600 * 1000),
      });
      expect(arg.update.expiresAt).toEqual(new Date(NOW.getTime() + 3600 * 1000));
    });

    it('expiresIn が 0 なら expiresAt は null（無期限扱い）', async () => {
      await adapter.upsert('sid-2', {} as never, 0);

      const arg = mockPrisma.oidcPayload.upsert.mock.calls[0][0];
      expect(arg.create.expiresAt).toBeNull();
      expect(arg.create.grantId).toBeNull();
      expect(arg.create.userCode).toBeNull();
      expect(arg.create.uid).toBeNull();
    });
  });

  describe('find / toPayload', () => {
    it('期限内・未消費の行は payload をそのまま返すこと', async () => {
      mockPrisma.oidcPayload.findUnique.mockResolvedValue({
        payload: { foo: 'bar' },
        expiresAt: new Date(NOW.getTime() + 1000),
        consumedAt: null,
      });

      const result = await adapter.find('sid-1');

      expect(mockPrisma.oidcPayload.findUnique).toHaveBeenCalledWith({
        where: { type_modelId: { type: 'Session', modelId: 'sid-1' } },
      });
      expect(result).toEqual({ foo: 'bar' });
    });

    it('行が無ければ undefined を返すこと', async () => {
      mockPrisma.oidcPayload.findUnique.mockResolvedValue(null);
      expect(await adapter.find('missing')).toBeUndefined();
    });

    it('期限切れの行は undefined を返すこと（失効トークンを渡さない）', async () => {
      mockPrisma.oidcPayload.findUnique.mockResolvedValue({
        payload: { foo: 'bar' },
        expiresAt: new Date(NOW.getTime() - 1000),
        consumedAt: null,
      });
      expect(await adapter.find('expired')).toBeUndefined();
    });

    it('消費済みの行は payload.consumed に消費時刻(epoch秒)を埋めて返すこと', async () => {
      const consumedAt = new Date('2026-06-02T23:59:00.000Z');
      mockPrisma.oidcPayload.findUnique.mockResolvedValue({
        payload: { foo: 'bar' },
        expiresAt: new Date(NOW.getTime() + 1000),
        consumedAt,
      });

      const result = await adapter.find('consumed');

      expect(result).toMatchObject({
        foo: 'bar',
        consumed: Math.floor(consumedAt.getTime() / 1000),
      });
    });
  });

  describe('findByUserCode / findByUid', () => {
    it('findByUserCode は type + userCode で検索すること', async () => {
      mockPrisma.oidcPayload.findFirst.mockResolvedValue(null);
      await adapter.findByUserCode('uc-1');
      expect(mockPrisma.oidcPayload.findFirst).toHaveBeenCalledWith({
        where: { type: 'Session', userCode: 'uc-1' },
      });
    });

    it('findByUid は type + uid で検索すること', async () => {
      mockPrisma.oidcPayload.findFirst.mockResolvedValue(null);
      await adapter.findByUid('uid-1');
      expect(mockPrisma.oidcPayload.findFirst).toHaveBeenCalledWith({
        where: { type: 'Session', uid: 'uid-1' },
      });
    });
  });

  describe('consume', () => {
    it('consumedAt を現在時刻で更新すること', async () => {
      await adapter.consume('sid-1');
      expect(mockPrisma.oidcPayload.update).toHaveBeenCalledWith({
        where: { type_modelId: { type: 'Session', modelId: 'sid-1' } },
        data: { consumedAt: NOW },
      });
    });
  });

  describe('destroy / revokeByGrantId', () => {
    it('destroy は deleteMany で冪等削除すること（不在でも throw しない）', async () => {
      await adapter.destroy('sid-1');
      expect(mockPrisma.oidcPayload.deleteMany).toHaveBeenCalledWith({
        where: { type: 'Session', modelId: 'sid-1' },
      });
    });

    it('revokeByGrantId は grantId に紐づく全 type の行を削除すること', async () => {
      await adapter.revokeByGrantId('g-1');
      expect(mockPrisma.oidcPayload.deleteMany).toHaveBeenCalledWith({
        where: { grantId: 'g-1' },
      });
    });
  });
});
