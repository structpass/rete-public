import { Role } from '@prisma/client';
import { toAccountSummary } from './accounts.mapper';
import type { AccountSummary } from './repositories/accounts.repository';
import { makeAccountEntity } from '../../__tests__/factories';

describe('accounts.mapper', () => {
  describe('toAccountSummary', () => {
    it('Account を id + 表示名のみの担当者サマリへ変換する（§1 DTO 境界）', () => {
      const dto = toAccountSummary({ id: 'acc-1', name: '田中 太郎' });
      expect(dto).toEqual({ id: 'acc-1', name: '田中 太郎' });
    });

    // cmn-0060: 担当者選択 API（一般ユーザーが触れる）に系統 Account.role を載せない不変条件。
    // 完全な Account（role / email / passwordHash 等を含む）を入力しても id + name のみを返し、
    // 将来 role を写すよう変更されたら fail させて漏れを検知する（全権 ADMIN 秘匿）。
    it('系統 Account.role / email / passwordHash を混入させても漏らさない（全権 ADMIN 秘匿・cmn-0060）', () => {
      const full = makeAccountEntity({ id: 'acc-1', name: '田中 太郎', role: Role.ADMIN });

      const dto = toAccountSummary(full as unknown as AccountSummary);

      expect(Object.keys(dto).sort()).toEqual(['id', 'name']);
      expect(dto).not.toHaveProperty('role');
      expect(dto).not.toHaveProperty('email');
      expect(dto).not.toHaveProperty('passwordHash');
    });
  });
});
