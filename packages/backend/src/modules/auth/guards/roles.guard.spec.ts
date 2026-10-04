import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@rete/shared';
import { RolesGuard } from './roles.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('@Roles 未付与（メタデータ無し）の endpoint は role 制限なしで素通しする', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext({ id: 'a', role: Role.MEMBER }))).toBe(true);
  });

  it('空配列の @Roles も制限なし扱いで素通しする', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(makeContext({ id: 'a', role: Role.MEMBER }))).toBe(true);
  });

  it('要求ロールに合致する user は通す（ADMIN 限定 endpoint に ADMIN）', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(makeContext({ id: 'a', role: Role.ADMIN }))).toBe(true);
  });

  it('要求ロールに合致しない user は Forbidden（ADMIN 限定 endpoint に MEMBER）', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(makeContext({ id: 'a', role: Role.MEMBER }))).toThrow(
      ForbiddenException,
    );
  });

  it('req.user 不在（防御）なら Forbidden', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
