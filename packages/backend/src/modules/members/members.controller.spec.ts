import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { Role } from '@rete/shared';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.service';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  exportCsv: jest.fn(),
  unlockLockout: jest.fn(),
  resetMfa: jest.fn(),
  setSystemRole: jest.fn(),
};

const ACTOR: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@rete.local',
  name: 'システム管理者',
  role: Role.ADMIN,
};

/**
 * 監査記録のアクセス元（IP・UA）を controller が取り出せることを検証するための Request スタブ。
 * clientIp / clientUserAgent（common/net/client-ip）が読む項目だけを持たせる（rete-members-0001）。
 */
const REQ = {
  ip: '203.0.113.9',
  socket: { remoteAddress: '203.0.113.9' },
  headers: { 'user-agent': 'Mozilla/5.0 (test)' },
} as unknown as Request;

/** controller → service へ渡るはずのアクセス元（4 エンドポイント共通）。 */
const EXPECTED_CLIENT = { ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0 (test)' };

describe('MembersController', () => {
  let controller: MembersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [{ provide: MembersService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MembersController>(MembersController);
  });

  it('findAll は service.findAll へ委譲すること', async () => {
    const expected = { success: true, data: [] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll()).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledTimes(1);
  });

  it('findOne は id を service.findOne へ委譲すること', async () => {
    const expected = { success: true, data: { id: 'a1' } };
    mockService.findOne.mockResolvedValue(expected);

    expect(await controller.findOne('a1')).toBe(expected);
    expect(mockService.findOne).toHaveBeenCalledWith('a1');
  });

  it('exportCsv は service.exportCsv の文字列を返し Content-Disposition を設定すること', async () => {
    mockService.exportCsv.mockResolvedValue('﻿表示名\r\n');
    const res = { setHeader: jest.fn() };

    const result = await controller.exportCsv(res as never);

    expect(result).toBe('﻿表示名\r\n');
    expect(mockService.exportCsv).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('members'),
    );
  });

  it('update は id・dto・actor とアクセス元（IP/UA）を service.update へ委譲すること（email 監査のため actor 全体を渡す）', async () => {
    const dto = { isActive: false };
    const expected = { success: true, data: { id: 'a1', isActive: false } };
    mockService.update.mockResolvedValue(expected);

    expect(await controller.update('a1', dto, ACTOR, REQ)).toBe(expected);
    expect(mockService.update).toHaveBeenCalledWith('a1', dto, ACTOR, EXPECTED_CLIENT);
  });

  it('unlockLockout は id・actor とアクセス元（IP/UA）を service.unlockLockout へ委譲すること', async () => {
    const expected = { success: true, data: { id: 'a1', lockedUntil: null } };
    mockService.unlockLockout.mockResolvedValue(expected);

    expect(await controller.unlockLockout('a1', ACTOR, REQ)).toBe(expected);
    expect(mockService.unlockLockout).toHaveBeenCalledWith('a1', ACTOR, EXPECTED_CLIENT);
  });

  it('resetMfa は id・actor とアクセス元（IP/UA）を service.resetMfa へ委譲すること', async () => {
    const expected = { success: true, data: { id: 'a1', mfaEnabled: false } };
    mockService.resetMfa.mockResolvedValue(expected);

    expect(await controller.resetMfa('a1', ACTOR, REQ)).toBe(expected);
    expect(mockService.resetMfa).toHaveBeenCalledWith('a1', ACTOR, EXPECTED_CLIENT);
  });

  it('setSystemRole は id・role・actor とアクセス元（IP/UA）を service.setSystemRole へ委譲すること', async () => {
    const expected = { success: true, data: { id: 'a1', role: Role.ADMIN } };
    mockService.setSystemRole.mockResolvedValue(expected);

    const result = await controller.setSystemRole('a1', { role: Role.ADMIN }, ACTOR, REQ);

    expect(result).toBe(expected);
    expect(mockService.setSystemRole).toHaveBeenCalledWith(
      'a1',
      Role.ADMIN,
      ACTOR,
      EXPECTED_CLIENT,
    );
  });

  it('User-Agent 未送出でも委譲は失敗せず userAgent=null で渡ること（取れない時に壊れない）', async () => {
    const reqWithoutUa = {
      ip: '203.0.113.9',
      socket: { remoteAddress: '203.0.113.9' },
      headers: {},
    } as unknown as Request;
    mockService.unlockLockout.mockResolvedValue({ success: true, data: { id: 'a1' } });

    await controller.unlockLockout('a1', ACTOR, reqWithoutUa);

    expect(mockService.unlockLockout).toHaveBeenCalledWith('a1', ACTOR, {
      ipAddress: '203.0.113.9',
      userAgent: null,
    });
  });
});
