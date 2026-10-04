import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ParseEnumPipe, ParseUUIDPipe } from '@nestjs/common';
import type { Request } from 'express';
import { MembershipScopeType, Role } from '@rete/shared';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

/**
 * MembershipsController のユニットテスト。
 * - service への委譲（findByScope の引数受け渡し）を検証。
 * - rete-common-0014: findByScope が wire する検証パイプ（ParseEnumPipe / ParseUUIDPipe）の契約を検証。
 *   不正 enum / 非 UUID は 400 に正規化され、生 string が service→Prisma へ流れて
 *   PrismaClientValidationError → 500+スタック露出になる経路を塞ぐ。
 */

const mockService = {
  findPermissionMatrix: jest.fn(),
  add: jest.fn(),
  findByScope: jest.fn(),
  remove: jest.fn(),
  updateRole: jest.fn(),
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

/** controller → service へ渡るはずのアクセス元（add / remove / updateRole 共通）。 */
const EXPECTED_CLIENT = { ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0 (test)' };

describe('MembershipsController', () => {
  let controller: MembershipsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembershipsController],
      providers: [{ provide: MembershipsService, useValue: mockService }],
    }).compile();

    controller = module.get<MembershipsController>(MembershipsController);
  });

  it('findPermissionMatrix は一括 read model を service へ委譲する', async () => {
    const expected = { success: true, data: { scopes: [], groups: [], accounts: [] } };
    mockService.findPermissionMatrix.mockResolvedValue(expected);

    await expect(controller.findPermissionMatrix()).resolves.toBe(expected);
    expect(mockService.findPermissionMatrix).toHaveBeenCalledTimes(1);
  });

  it('findPermissionMatrix は system ADMIN のみに公開する', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      MembershipsController.prototype.findPermissionMatrix,
    );

    expect(roles).toEqual([Role.ADMIN]);
  });

  it('findByScope は scopeType / scopeId / requesterId を service へ委譲する', async () => {
    const expected = { success: true, data: [] };
    mockService.findByScope.mockResolvedValue(expected);

    const result = await controller.findByScope(
      MembershipScopeType.ORGANIZATION,
      '11111111-1111-1111-1111-111111111111',
      'requester-1',
    );

    expect(result).toBe(expected);
    expect(mockService.findByScope).toHaveBeenCalledWith(
      MembershipScopeType.ORGANIZATION,
      '11111111-1111-1111-1111-111111111111',
      'requester-1',
    );
  });

  describe('入力検証パイプ契約（rete-common-0014）', () => {
    // findByScope が @Query に付与する Nest 標準パイプ。HTTP 層と同一インスタンスで契約を確認する。
    const enumPipe = new ParseEnumPipe(MembershipScopeType);
    const uuidPipe = new ParseUUIDPipe();
    const enumMeta = { type: 'query' as const, data: 'scopeType' };
    const uuidMeta = { type: 'query' as const, data: 'scopeId' };

    it('不正な scopeType（enum 外）は 400 に正規化される（生 string を Prisma へ流さない）', async () => {
      // HTTP 層では生 string が渡る。transform の入力型は enum 想定のため as never で実態に合わせる。
      await expect(enumPipe.transform('NOT_A_SCOPE' as never, enumMeta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('妥当な scopeType はそのまま透過する', async () => {
      await expect(enumPipe.transform('ORGANIZATION' as never, enumMeta)).resolves.toBe(
        'ORGANIZATION',
      );
    });

    it('非 UUID の scopeId は 400 に正規化される', async () => {
      await expect(uuidPipe.transform('not-a-uuid', uuidMeta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('妥当な UUID の scopeId はそのまま透過する', async () => {
      const uuid = '11111111-1111-1111-1111-111111111111';
      await expect(uuidPipe.transform(uuid, uuidMeta)).resolves.toBe(uuid);
    });
  });

  describe('updateRole（PATCH /memberships/:id）', () => {
    const requester = {
      id: 'requester-1',
      email: 'requester@rete.local',
      name: '依頼者',
      role: 'MEMBER',
    };

    it('id・role・requester 全体を service.updateRole へ委譲する', async () => {
      const expected = { success: true, data: { id: 'mship-1', role: 'ADMIN' } };
      mockService.updateRole.mockResolvedValue(expected);

      const result = await controller.updateRole(
        '11111111-1111-1111-1111-111111111111',
        { role: 'ADMIN' },
        requester as never,
        REQ,
      );

      expect(result).toBe(expected);
      expect(mockService.updateRole).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'ADMIN',
        requester,
        EXPECTED_CLIENT,
      );
    });

    it('MEMBER への降格も委譲できる', async () => {
      const expected = { success: true, data: { id: 'mship-1', role: 'MEMBER' } };
      mockService.updateRole.mockResolvedValue(expected);

      const result = await controller.updateRole(
        '11111111-1111-1111-1111-111111111111',
        { role: 'MEMBER' },
        requester as never,
        REQ,
      );

      expect(result).toBe(expected);
      expect(mockService.updateRole).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'MEMBER',
        requester,
        EXPECTED_CLIENT,
      );
    });
  });

  describe('add（POST /memberships）', () => {
    it('dto・requester 全体とアクセス元（IP/UA）を service.add へ委譲する', async () => {
      const requester = {
        id: 'requester-1',
        email: 'requester@rete.local',
        name: '依頼者',
        role: 'ADMIN',
      };
      const dto = {
        accountId: '22222222-2222-2222-2222-222222222222',
        scopeType: MembershipScopeType.ORGANIZATION,
        scopeId: '11111111-1111-1111-1111-111111111111',
        role: 'MEMBER' as const,
      };
      const expected = { success: true, data: { id: 'mship-1' } };
      mockService.add.mockResolvedValue(expected);

      const result = await controller.add(dto as never, requester as never, REQ);

      expect(result).toBe(expected);
      expect(mockService.add).toHaveBeenCalledWith(dto, requester, EXPECTED_CLIENT);
    });
  });

  describe('remove（DELETE /memberships/:id）', () => {
    it('id・requester 全体とアクセス元（IP/UA）を service.remove へ委譲する', async () => {
      const requester = {
        id: 'requester-1',
        email: 'requester@rete.local',
        name: '依頼者',
        role: 'ADMIN',
      };
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove('11111111-1111-1111-1111-111111111111', requester as never, REQ);

      expect(mockService.remove).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        requester,
        EXPECTED_CLIENT,
      );
    });

    it('User-Agent 未送出でも委譲は失敗せず userAgent=null で渡る（取れない時に壊れない）', async () => {
      const requester = { id: 'requester-1', email: 'r@rete.local', name: '依頼者', role: 'ADMIN' };
      const reqWithoutUa = {
        ip: '203.0.113.9',
        socket: { remoteAddress: '203.0.113.9' },
        headers: {},
      } as unknown as Request;
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove(
        '11111111-1111-1111-1111-111111111111',
        requester as never,
        reqWithoutUa,
      );

      expect(mockService.remove).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        requester,
        { ipAddress: '203.0.113.9', userAgent: null },
      );
    });
  });
});
