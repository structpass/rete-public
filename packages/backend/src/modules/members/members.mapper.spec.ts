import { toMemberDto } from './members.mapper';
import type { MemberWithRelations } from './repositories/members.repository';
import { makeMemberWithRelations } from '../../__tests__/factories';

describe('members.mapper', () => {
  describe('toMemberDto', () => {
    it('Account を MemberDto へ変換する（機密列は型から不在）', () => {
      const entity = makeMemberWithRelations({
        id: 'a1',
        name: '田中 太郎',
        email: 'tanaka@struct-pass.example',
        isActive: true,
      });

      const dto = toMemberDto(entity);

      expect(dto).toEqual({
        id: 'a1',
        name: '田中 太郎',
        familyName: '田中',
        givenName: '太郎',
        email: 'tanaka@struct-pass.example',
        isActive: true,
        lockedUntil: null,
        mfaEnabled: false,
        createdAt: '2026-05-29T01:23:45.000Z',
        updatedAt: '2026-05-29T01:23:45.000Z',
      });
    });

    it('mfaSetting.enabled を mfaEnabled へ写し、行不在（null）は false にする（set-0033）', () => {
      const enabled = toMemberDto(makeMemberWithRelations({ mfaSetting: { enabled: true } }));
      expect(enabled.mfaEnabled).toBe(true);

      const notSetup = toMemberDto(makeMemberWithRelations({ mfaSetting: null }));
      expect(notSetup.mfaEnabled).toBe(false);

      // 未確認（enabled=false）の設定は mfaEnabled=false（確認済みのみ true）。
      const unconfirmed = toMemberDto(makeMemberWithRelations({ mfaSetting: { enabled: false } }));
      expect(unconfirmed.mfaEnabled).toBe(false);
    });

    it('lockedUntil（ロックアウト解除予定）を ISO 文字列へ変換し、null はそのまま null にする', () => {
      const at = new Date('2026-06-26T03:00:00.000Z');
      const locked = toMemberDto(makeMemberWithRelations({ lockedUntil: at }));
      expect(locked.lockedUntil).toBe('2026-06-26T03:00:00.000Z');

      const unlocked = toMemberDto(makeMemberWithRelations({ lockedUntil: null }));
      expect(unlocked.lockedUntil).toBeNull();
    });

    it('passwordHash / role 等の機密・内部キーを露出しない', () => {
      const dto = toMemberDto(makeMemberWithRelations());
      expect(Object.keys(dto).sort()).toEqual([
        'createdAt',
        'email',
        'familyName',
        'givenName',
        'id',
        'isActive',
        'lockedUntil',
        'mfaEnabled',
        'name',
        'updatedAt',
      ]);
    });

    // cmn-0060: 全権 ADMIN（系統 Account.role）秘匿の不変条件。一般向けメンバー一覧 DTO に
    // 系統ロール（ADMIN/MEMBER 区分）を載せない。入力に系統 role を混入させても DTO へ
    // 漏れないことで、将来 mapper が role を写すよう変更されたら fail させ漏れを検知する。
    it('系統 Account.role を混入させても MemberDto へ漏らさない（全権 ADMIN 秘匿・cmn-0060）', () => {
      const leaky = {
        ...makeMemberWithRelations(),
        role: 'ADMIN',
      } as MemberWithRelations & { role: string };

      const dto = toMemberDto(leaky);

      expect(dto).not.toHaveProperty('role');
    });
  });
});
