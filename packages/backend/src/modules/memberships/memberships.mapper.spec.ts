import { MembershipScopeType } from '@rete/shared';
import type { MembershipWithAccount } from './repositories/memberships.repository';
import { toMembershipDto } from './memberships.mapper';
import { makeMembershipWithAccount } from '../../__tests__/factories';

describe('memberships.mapper', () => {
  describe('toMembershipDto', () => {
    it('DTO は id/accountId/scopeType/scopeId/role/accountName の 6 キーを持ち createdAt/updatedAt を漏らさない（§1 DTO 境界）', () => {
      const dto = toMembershipDto(makeMembershipWithAccount());
      expect(Object.keys(dto).sort()).toEqual([
        'accountId',
        'accountName',
        'id',
        'role',
        'scopeId',
        'scopeType',
      ]);
      expect(dto).not.toHaveProperty('createdAt');
      expect(dto).not.toHaveProperty('updatedAt');
    });

    it('id / accountId / scopeId は実列をそのまま写す', () => {
      const row = makeMembershipWithAccount({
        id: 'mship-99',
        accountId: 'acc-42',
        scopeId: 'proj-7',
      });
      const dto = toMembershipDto(row);
      expect(dto.id).toBe('mship-99');
      expect(dto.accountId).toBe('acc-42');
      expect(dto.scopeId).toBe('proj-7');
    });

    it('scopeType は Prisma enum 文字列から MembershipScopeType へキャストされる', () => {
      const dto = toMembershipDto(
        makeMembershipWithAccount({ scopeType: 'ORGANIZATION' as MembershipScopeType }),
      );
      expect(dto.scopeType).toBe(MembershipScopeType.ORGANIZATION);

      const dto2 = toMembershipDto(
        makeMembershipWithAccount({ scopeType: 'PROJECT' as MembershipScopeType }),
      );
      expect(dto2.scopeType).toBe(MembershipScopeType.PROJECT);

      const dto3 = toMembershipDto(
        makeMembershipWithAccount({ scopeType: 'GROUP' as MembershipScopeType }),
      );
      expect(dto3.scopeType).toBe(MembershipScopeType.GROUP);
    });

    it('role は ADMIN / MEMBER をそのまま写す', () => {
      expect(
        toMembershipDto(
          makeMembershipWithAccount({ role: 'ADMIN' as MembershipWithAccount['role'] }),
        ).role,
      ).toBe('ADMIN');
      expect(
        toMembershipDto(
          makeMembershipWithAccount({ role: 'MEMBER' as MembershipWithAccount['role'] }),
        ).role,
      ).toBe('MEMBER');
    });

    it('accountName は account.name を写す（表示用結合・一覧表示用）', () => {
      const dto = toMembershipDto(makeMembershipWithAccount({}, '田中 太郎'));
      expect(dto.accountName).toBe('田中 太郎');
    });

    it('account が null / undefined のとき accountName は undefined になる（optional chaining）', () => {
      const row = makeMembershipWithAccount();
      // account を強制的に undefined にして optional chaining を検証
      (row as { account?: { name: string } | null }).account = undefined;
      const dto = toMembershipDto(row);
      expect(dto.accountName).toBeUndefined();
    });

    // cmn-0060: scope-ADMIN（Membership.role）は従来どおり載せ（ガバナンス透明性）、
    // account 由来の系統 Account.role（全権 ADMIN 区分）は accountName 以外に漏らさない。
    it('scope role は載せるが account の系統 role は漏らさない（cmn-0060）', () => {
      // scope-ADMIN は可視（criteria: scope-ADMIN は従来どおり含まれる）
      const adminDto = toMembershipDto(
        makeMembershipWithAccount({ role: 'ADMIN' as MembershipWithAccount['role'] }),
      );
      expect(adminDto.role).toBe('ADMIN');

      // account に系統 role（ADMIN）を混入させても DTO は 6 キーに留まり、role 値は
      // membership.role（MEMBER）由来のまま＝account.role で上書きされない。将来 mapper が
      // `role: row.account?.role ?? row.role` のように account.role を写す変更を入れたら
      // dto.role が 'ADMIN' になり本アサートが fail する（系統ロール漏れの検知）。
      const leaky = {
        ...makeMembershipWithAccount(), // role default = 'MEMBER'
        account: { name: 'テストユーザー', role: 'ADMIN' },
      } as unknown as MembershipWithAccount;
      const dto = toMembershipDto(leaky);
      expect(Object.keys(dto).sort()).toEqual([
        'accountId',
        'accountName',
        'id',
        'role',
        'scopeId',
        'scopeType',
      ]);
      expect(dto.role).toBe('MEMBER');
    });
  });
});
