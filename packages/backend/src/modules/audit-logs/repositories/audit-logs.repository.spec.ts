import { AUDIT_SYSTEM_COMMON } from '@rete/shared';
import {
  AuditLogsRepository,
  buildAuditLogWhere,
  decodeCursor,
  encodeCursor,
} from './audit-logs.repository';

describe('buildAuditLogWhere', () => {
  it('空フィルタは空 where（全件）', () => {
    expect(buildAuditLogWhere({})).toEqual({});
  });

  it('search はユーザー名 / メールの大文字小文字無視 OR 部分一致', () => {
    expect(buildAuditLogWhere({ search: '田中' })).toEqual({
      OR: [
        { actorName: { contains: '田中', mode: 'insensitive' } },
        { actorEmail: { contains: '田中', mode: 'insensitive' } },
      ],
    });
  });

  it('actionType は等価フィルタ', () => {
    expect(buildAuditLogWhere({ actionType: 'delete' })).toEqual({ actionType: 'delete' });
  });

  it('systemId 実値は等価、AUDIT_SYSTEM_COMMON は systemId IS NULL（横断操作）', () => {
    expect(buildAuditLogWhere({ systemId: 'SYS-001' })).toEqual({ systemId: 'SYS-001' });
    expect(buildAuditLogWhere({ systemId: AUDIT_SYSTEM_COMMON })).toEqual({ systemId: null });
  });

  it('from / to は createdAt の gte / lte に写す', () => {
    const from = new Date('2026-05-01T00:00:00.000Z');
    const to = new Date('2026-05-08T23:59:59.999Z');
    expect(buildAuditLogWhere({ from, to })).toEqual({ createdAt: { gte: from, lte: to } });
    expect(buildAuditLogWhere({ from })).toEqual({ createdAt: { gte: from } });
  });
});

describe('AuditLogsRepository.deleteOlderThan', () => {
  const cutoff = new Date('2025-06-13T00:00:00.000Z');
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let repo: AuditLogsRepository;

  beforeEach(() => {
    findMany = jest.fn();
    deleteMany = jest.fn();
    repo = new AuditLogsRepository({ auditLog: { findMany, deleteMany } } as never);
  });

  it('対象 0 件なら delete を呼ばず 0 を返す', async () => {
    findMany.mockResolvedValueOnce([]);
    const deleted = await repo.deleteOlderThan(cutoff, 1000);
    expect(deleted).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('batchSize 未満の 1 バッチで完了し、createdAt < cutoff の id を delete する', async () => {
    findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    deleteMany.mockResolvedValueOnce({ count: 2 });

    const deleted = await repo.deleteOlderThan(cutoff, 1000);

    expect(deleted).toBe(2);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { createdAt: { lt: cutoff } },
      take: 1000,
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
  });

  it('batchSize ちょうどなら次バッチを引き、空になるまでループして総件数を返す', async () => {
    findMany
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }]) // 1st batch == batchSize
      .mockResolvedValueOnce([{ id: '3' }]); // 2nd batch < batchSize → 終了
    deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });

    const deleted = await repo.deleteOlderThan(cutoff, 2);

    expect(deleted).toBe(3);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe('AuditLogsRepository.search（keyset ページング）', () => {
  const rowA = { id: 'a', createdAt: new Date('2026-05-08T00:00:00.000Z') };
  const rowB = { id: 'b', createdAt: new Date('2026-05-07T00:00:00.000Z') };

  let findMany: jest.Mock;
  let count: jest.Mock;
  let repo: AuditLogsRepository;

  beforeEach(() => {
    findMany = jest.fn();
    count = jest.fn().mockResolvedValue(5);
    repo = new AuditLogsRepository({ auditLog: { findMany, count } } as never);
  });

  it('encodeCursor/decodeCursor は (createdAt, id) を可逆に符号化する', () => {
    const token = encodeCursor(rowA);
    expect(decodeCursor(token)).toEqual({ createdAt: rowA.createdAt, id: rowA.id });
  });

  it('direction 省略（First）は createdAt/id 降順・cursor 境界なしで取得する', async () => {
    findMany.mockResolvedValue([rowA, rowB]);
    const res = await repo.search({}, { limit: 20 });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
    });
    expect(res.data).toEqual([rowA, rowB]);
    expect(res.total).toBe(5);
    // limit+1 の先読みに引っかからない（2件しか無い）ため、続きなし = 両方 null。
    expect(res.cursors.next).toBeNull();
    expect(res.cursors.prev).toBeNull();
  });

  it('direction=next は cursor より古い行を降順で取得する（OFFSET を使わない前進）', async () => {
    findMany.mockResolvedValue([rowB]);
    const cursor = encodeCursor(rowA);
    await repo.search({}, { limit: 20, direction: 'next', cursor });

    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.where).toEqual({
      AND: [
        {},
        {
          OR: [
            { createdAt: { lt: rowA.createdAt } },
            { createdAt: rowA.createdAt, id: { lt: rowA.id } },
          ],
        },
      ],
    });
  });

  it('direction=prev は cursor より新しい行を昇順で取得し、表示順（降順）へ反転して返す', async () => {
    // DB からは昇順（古い→新しい）で返るため rowB→rowA の順で来る想定。
    findMany.mockResolvedValue([rowB, rowA]);
    const cursor = encodeCursor(rowA);
    const res = await repo.search({}, { limit: 20, direction: 'prev', cursor });

    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(args.where).toEqual({
      AND: [
        {},
        {
          OR: [
            { createdAt: { gt: rowA.createdAt } },
            { createdAt: rowA.createdAt, id: { gt: rowA.id } },
          ],
        },
      ],
    });
    // 反転済みで表示順（新しい→古い）= [rowA, rowB]
    expect(res.data).toEqual([rowA, rowB]);
  });

  it('direction=last は cursor 無しで昇順取得し、id タイブレークのまま反転して表示順にする', async () => {
    findMany.mockResolvedValue([rowB, rowA]);
    const res = await repo.search({}, { limit: 20, direction: 'last' });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 21,
    });
    expect(findMany.mock.calls[0][0].where).toEqual({});
    expect(res.data).toEqual([rowA, rowB]);
  });

  it('フィルタ + cursor を併用しても where が AND で結合される', async () => {
    findMany.mockResolvedValue([]);
    const cursor = encodeCursor(rowA);
    await repo.search({ actionType: 'delete' }, { limit: 20, direction: 'next', cursor });

    const args = findMany.mock.calls[0][0];
    expect(args.where.AND[0]).toEqual({ actionType: 'delete' });
  });

  it('decodeCursor は壊れた base64/JSON・空 id・不正日時を BadRequestException で弾く', () => {
    expect(() => decodeCursor('not-base64url-json!!')).toThrow('cursor の形式が不正です');
    const badJson = Buffer.from('{"c":"2026-05-08T00:00:00.000Z"}', 'utf8').toString('base64url');
    expect(() => decodeCursor(badJson)).toThrow('cursor の形式が不正です');
    const badDate = Buffer.from(JSON.stringify({ c: 'not-a-date', id: 'x' }), 'utf8').toString(
      'base64url',
    );
    expect(() => decodeCursor(badDate)).toThrow('cursor の形式が不正です');
  });

  it('has-more peek: limit+1 件目が無ければ First の next は null（続きなし）', async () => {
    findMany.mockResolvedValue([rowA, rowB]); // limit=2 ちょうど → 続きなし
    const res = await repo.search({}, { limit: 2 });

    expect(findMany.mock.calls[0][0].take).toBe(3);
    expect(res.data).toEqual([rowA, rowB]);
    expect(res.cursors.next).toBeNull();
    expect(res.cursors.prev).toBeNull();
  });

  it('has-more peek: limit+1 件目があれば First の next は non-null（続きあり）で余分な1件は捨てる', async () => {
    const rowC = { id: 'c', createdAt: new Date('2026-05-06T00:00:00.000Z') };
    findMany.mockResolvedValue([rowA, rowB, rowC]); // limit=2 に対し 3 件 = 続きあり
    const res = await repo.search({}, { limit: 2 });

    expect(res.data).toEqual([rowA, rowB]);
    expect(res.cursors.prev).toBeNull();
    expect(decodeCursor(res.cursors.next as string)).toEqual({
      createdAt: rowB.createdAt,
      id: rowB.id,
    });
  });

  it('direction=next: prev は常に non-null（到達済み方向）、next は has-more peek 次第', async () => {
    findMany.mockResolvedValue([rowB]); // limit=2 に対し 1 件 → 続きなし
    const cursor = encodeCursor(rowA);
    const res = await repo.search({}, { limit: 2, direction: 'next', cursor });

    expect(decodeCursor(res.cursors.prev as string)).toEqual({
      createdAt: rowB.createdAt,
      id: rowB.id,
    });
    expect(res.cursors.next).toBeNull();
  });

  it('direction=last: next は常に null（終端）、prev は has-more peek 次第', async () => {
    findMany.mockResolvedValue([rowB, rowA]); // limit=2 ちょうど → 続きなし
    const res = await repo.search({}, { limit: 2, direction: 'last' });

    expect(res.cursors.next).toBeNull();
    expect(res.cursors.prev).toBeNull();
  });
});
