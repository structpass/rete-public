import { Role } from '@rete/shared';
import { toAccountResponse } from './auth.mapper';
import type { AuthenticatedUser } from './auth.service';

describe('auth.mapper', () => {
  describe('toAccountResponse', () => {
    const user: AuthenticatedUser = {
      id: 'acc-1',
      email: 'user@example.com',
      name: '山田太郎',
      role: Role.MEMBER,
    };

    it('id / email / name / role を公開 DTO に写すこと', () => {
      const dto = toAccountResponse(user);
      expect(dto).toEqual({
        id: 'acc-1',
        email: 'user@example.com',
        name: '山田太郎',
        role: Role.MEMBER,
      });
    });

    it('公開フィールドは id/email/name/role の 4 つのみで秘密フィールドを漏らさないこと（§1 DTO 境界）', () => {
      const dto = toAccountResponse(user);
      expect(Object.keys(dto).sort()).toEqual(['email', 'id', 'name', 'role']);
    });
  });
});
