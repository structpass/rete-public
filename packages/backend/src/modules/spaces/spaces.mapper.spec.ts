import { SpaceKind } from '@rete/shared';
import { toSpaceDto } from './spaces.mapper';
import { makeSpaceRow } from '../../__tests__/factories';

describe('spaces.mapper', () => {
  describe('toSpaceDto', () => {
    it('DTO は 12 キーを持ち archivedAt を漏らさない（§1 DTO 境界）', () => {
      const dto = toSpaceDto(makeSpaceRow());
      expect(Object.keys(dto).sort()).toEqual([
        'archived',
        'canManageMembers',
        'createdAt',
        'id',
        'kind',
        'name',
        'ownerId',
        'peerAccountId',
        'peerName',
        'projectId',
        'sortOrder',
        'updatedAt',
      ]);
      expect(dto).not.toHaveProperty('archivedAt');
      expect(dto.canManageMembers).toBe(false);
    });

    it('canManageMembers は省略時 false・明示 true 時に true を返す（dsk-0354）', () => {
      const row = makeSpaceRow({ kind: 'GROUP', projectId: null });
      expect(toSpaceDto(row).canManageMembers).toBe(false);
      expect(toSpaceDto(row, { canManageMembers: true }).canManageMembers).toBe(true);
      expect(toSpaceDto(row, { canManageMembers: false }).canManageMembers).toBe(false);
    });

    it('archivedAt が null のとき archived は false', () => {
      const dto = toSpaceDto(makeSpaceRow({ archivedAt: null }));
      expect(dto.archived).toBe(false);
    });

    it('archivedAt が Date のとき archived は true（archivedAt → archived 畳み込み）', () => {
      const dto = toSpaceDto(makeSpaceRow({ archivedAt: new Date('2026-06-01T00:00:00.000Z') }));
      expect(dto.archived).toBe(true);
    });

    it('createdAt・updatedAt は ISO 8601 文字列に変換する（Date → string）', () => {
      const fixed = new Date('2026-05-29T01:23:45.000Z');
      const dto = toSpaceDto(makeSpaceRow({ createdAt: fixed, updatedAt: fixed }));
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
      expect(dto.updatedAt).toBe('2026-05-29T01:23:45.000Z');
    });

    it('kind は Prisma 文字列から SpaceKind 値へキャストする', () => {
      const dto = toSpaceDto(makeSpaceRow({ kind: 'GROUP' }));
      expect(dto.kind).toBe(SpaceKind.GROUP);
    });

    it('CHANNEL: id/name/sortOrder/projectId を正しく写す', () => {
      const dto = toSpaceDto(
        makeSpaceRow({
          id: 'space-abc',
          kind: 'CHANNEL',
          projectId: 'proj-1',
          name: 'general',
          sortOrder: 3,
          ownerId: null,
          peerAccountId: null,
        }),
      );
      expect(dto.id).toBe('space-abc');
      expect(dto.kind).toBe(SpaceKind.CHANNEL);
      expect(dto.projectId).toBe('proj-1');
      expect(dto.name).toBe('general');
      expect(dto.sortOrder).toBe(3);
      expect(dto.ownerId).toBeNull();
      expect(dto.peerAccountId).toBeNull();
    });

    it('PERSONAL_DM: ownerId と peerAccountId を非 null で写す', () => {
      const dto = toSpaceDto(
        makeSpaceRow({
          kind: 'PERSONAL_DM',
          ownerId: 'user-1',
          peerAccountId: 'user-2',
          projectId: null,
          name: 'DM',
        }),
      );
      expect(dto.kind).toBe(SpaceKind.PERSONAL_DM);
      expect(dto.ownerId).toBe('user-1');
      expect(dto.peerAccountId).toBe('user-2');
      expect(dto.projectId).toBeNull();
      // デフォルト（options 未指定）は null。他 kind では peerName は決して入らない設計。
      expect(dto.peerName).toBeNull();
    });

    it('PERSONAL_DM: options.peerName を渡すと dto.peerName に写る（dsk-0325）', () => {
      const dto = toSpaceDto(
        makeSpaceRow({
          kind: 'PERSONAL_DM',
          ownerId: 'user-1',
          peerAccountId: 'user-2',
          name: 'DM',
        }),
        { peerName: '相手 太郎' },
      );
      expect(dto.peerName).toBe('相手 太郎');
    });

    it('PERSONAL_DM: peerName に空文字を渡しても空文字のまま素通し（フォールバック責務は mapper 外）', () => {
      const dto = toSpaceDto(
        makeSpaceRow({
          kind: 'PERSONAL_DM',
          ownerId: 'user-1',
          peerAccountId: 'user-2',
          name: 'DM',
        }),
        { peerName: '' },
      );
      expect(dto.peerName).toBe('');
    });

    it('PERSONAL_DM: peerName に null を明示しても null（退会相手など解決不能ケース）', () => {
      const dto = toSpaceDto(
        makeSpaceRow({
          kind: 'PERSONAL_DM',
          ownerId: 'user-1',
          peerAccountId: 'user-2',
          name: 'DM',
        }),
        { peerName: null },
      );
      expect(dto.peerName).toBeNull();
    });

    it('PERSONAL_MEMO: ownerId 非 null / peerAccountId は null', () => {
      const dto = toSpaceDto(
        makeSpaceRow({
          kind: 'PERSONAL_MEMO',
          ownerId: 'user-1',
          peerAccountId: null,
          projectId: null,
        }),
      );
      expect(dto.kind).toBe(SpaceKind.PERSONAL_MEMO);
      expect(dto.ownerId).toBe('user-1');
      expect(dto.peerAccountId).toBeNull();
    });
  });
});
