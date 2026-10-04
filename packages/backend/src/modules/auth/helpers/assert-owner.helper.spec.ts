import { ForbiddenException } from '@nestjs/common';
import { Role } from '@rete/shared';
import { assertOwnerOrAdmin } from './assert-owner.helper';

describe('assertOwnerOrAdmin', () => {
  const admin = { id: 'admin-1', role: Role.ADMIN };
  const member = { id: 'user-1', role: Role.MEMBER };
  const other = { id: 'user-2', role: Role.MEMBER };

  it('ADMIN ユーザーは所有者に関わらず許可すること', () => {
    expect(() => assertOwnerOrAdmin('user-99', admin)).not.toThrow();
  });

  it('ADMIN ユーザーは ownerId=null でも許可すること', () => {
    expect(() => assertOwnerOrAdmin(null, admin)).not.toThrow();
  });

  it('所有者本人（ownerId === user.id）は許可すること', () => {
    expect(() => assertOwnerOrAdmin('user-1', member)).not.toThrow();
  });

  it('他者（ownerId !== user.id）は ForbiddenException を投げること', () => {
    expect(() => assertOwnerOrAdmin('user-1', other)).toThrow(ForbiddenException);
  });

  it('ownerId が null かつ MEMBER は ForbiddenException を投げること（既存行バックフィル未設定）', () => {
    expect(() => assertOwnerOrAdmin(null, member)).toThrow(ForbiddenException);
  });

  it('HIGH-2: ownerId が undefined かつ MEMBER は ForbiddenException を投げること（DTO 脱落防御）', () => {
    expect(() => assertOwnerOrAdmin(undefined, member)).toThrow(ForbiddenException);
  });

  it('HIGH-2: ownerId が undefined かつ ADMIN は許可すること', () => {
    expect(() => assertOwnerOrAdmin(undefined, admin)).not.toThrow();
  });
});
