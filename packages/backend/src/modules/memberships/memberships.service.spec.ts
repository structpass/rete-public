import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsRepository } from './repositories/memberships.repository';
import { AuditRecorderService } from '../audit-logs/audit-recorder.service';
import { AUDIT_RETE_SYSTEM_NAME } from '../audit-logs/audit-logs.constants';
import { MembershipScopeType, Role } from '@rete/shared';
import { makeMembershipWithAccount } from '../../__tests__/factories';
import type { AuthenticatedUser } from '../auth/auth.service';

/**
 * MembershipsService のユニットテスト。
 * MembershipsRepository / AuditRecorderService は jest.fn() でモックし、
 * 権限チェック + CRUD ロジック + 全消失ガード（cmn-0047）を検証する。
 */

const REQUESTER_ID = 'requester-1';
const TARGET_ACCOUNT_ID = 'account-2';
const SCOPE_ID = 'org-1';
const MEMBERSHIP_ID = 'membership-1';

/** scope-ADMIN 判定で使う requester（システムロールは MEMBER＝システム ADMIN ではない）。 */
const REQUESTER: AuthenticatedUser = {
  id: REQUESTER_ID,
  email: 'requester@rete.local',
  name: '依頼者',
  role: Role.MEMBER,
};
/** システム ADMIN（Account.role=ADMIN）の requester（バイパス招待の検証用）。 */
const SYSTEM_ADMIN: AuthenticatedUser = {
  id: 'sysadmin-1',
  email: 'sysadmin@rete.local',
  name: 'システム管理者',
  role: Role.ADMIN,
};

const mockRepo = {
  findPermissionMatrix: jest.fn(),
  findScopeTarget: jest.fn(),
  findMembership: jest.fn(),
  findEffectiveMembership: jest.fn(),
  findByScope: jest.fn(),
  findById: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  findByAccount: jest.fn(),
  deleteLastAdminGuarded: jest.fn(),
  demoteLastAdminGuarded: jest.fn(),
};

const mockAudit = {
  record: jest.fn(),
};

describe('MembershipsService', () => {
  let service: MembershipsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: MembershipsRepository, useValue: mockRepo },
        { provide: AuditRecorderService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
    mockRepo.findScopeTarget.mockResolvedValue({ archivedAt: null });
  });

  describe('findPermissionMatrix', () => {
    it('組織＞プロジェクト＞チャネルの順にread modelをDTO化する', async () => {
      const now = new Date('2026-08-24T00:00:00.000Z');
      mockRepo.findPermissionMatrix.mockResolvedValue({
        organizations: [{ id: 'org-1', name: 'Acme', sortOrder: 0 }],
        projects: [{ id: 'project-1', organizationId: 'org-1', name: '新製品', sortOrder: 0 }],
        channels: [{ id: 'channel-1', projectId: 'project-1', name: '企画', sortOrder: 0 }],
        groups: [
          {
            id: 'group-1',
            name: '開発',
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
            _count: { members: 2 },
          },
        ],
        grants: [],
      });

      const result = await service.findPermissionMatrix();

      expect(result.data.scopes.map((scope) => scope.scopeType)).toEqual([
        MembershipScopeType.ORGANIZATION,
        MembershipScopeType.PROJECT,
        MembershipScopeType.CHANNEL,
      ]);
      expect(result.data.scopes.map((scope) => scope.depth)).toEqual([0, 1, 2]);
      expect(result.data.groups[0].memberCount).toBe(2);
      // set-0188: グループのアーカイブ概念を撤去したため、read model も archived を持たない。
      expect(result.data.groups[0]).not.toHaveProperty('archived');
    });
  });

  describe('add', () => {
    const dto = {
      accountId: TARGET_ACCOUNT_ID,
      scopeType: MembershipScopeType.ORGANIZATION,
      scopeId: SCOPE_ID,
      role: 'MEMBER' as const,
    };

    it('scope に membership がなく かつ システム ADMIN でもなければ ForbiddenException', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue(null);

      await expect(service.add(dto, REQUESTER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('scope MEMBER 権限 かつ 非システム ADMIN では ForbiddenException', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'MEMBER' });

      await expect(service.add(dto, REQUESTER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('scope ADMIN であれば upsert して MembershipDto を返す（監査は残さない）', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      const row = makeMembershipWithAccount({ accountId: TARGET_ACCOUNT_ID });
      mockRepo.upsert.mockResolvedValue({ row, blocked: false });

      const result = await service.add(dto, REQUESTER);

      expect(mockRepo.findEffectiveMembership).toHaveBeenCalledWith(
        REQUESTER_ID,
        dto.scopeType,
        dto.scopeId,
      );
      expect(mockRepo.upsert).toHaveBeenCalledWith({
        accountId: dto.accountId,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        role: dto.role,
      });
      expect(mockAudit.record).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data.accountId).toBe(TARGET_ACCOUNT_ID);
      expect(result.data.scopeType).toBe(MembershipScopeType.ORGANIZATION);
      expect(result.data.role).toBe('MEMBER');
      expect(result.data.accountName).toBe('テストユーザー');
    });

    it('システム ADMIN は scope-ADMIN でなくてもバイパス招待でき、監査ログ（actionType=admin）を残す', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue(null); // scope に membership 無し（バイパス）
      const row = makeMembershipWithAccount({ accountId: TARGET_ACCOUNT_ID });
      mockRepo.upsert.mockResolvedValue({ row, blocked: false });

      const result = await service.add(dto, SYSTEM_ADMIN);

      expect(mockRepo.upsert).toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalledTimes(1);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorAccountId: SYSTEM_ADMIN.id,
          actionType: 'admin',
          feature: 'memberships',
          // 記録側 SSOT の定数（'共通操作'）を使う。set-0079 の是正時に本 service だけ
          // ローカル定数 'rete' が取り残されていたので、値の追随をここで固定する（fil-0106）。
          systemName: AUDIT_RETE_SYSTEM_NAME,
        }),
      );
      expect(result.success).toBe(true);
    });

    it('システム ADMIN かつ scope-ADMIN を兼ねる場合はバイパスでないため監査を残さない', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      const row = makeMembershipWithAccount({ accountId: TARGET_ACCOUNT_ID });
      mockRepo.upsert.mockResolvedValue({ row, blocked: false });

      await service.add(dto, SYSTEM_ADMIN);

      expect(mockRepo.upsert).toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('upsert が blocked なら BadRequestException を投げる（唯一の実効 ADMIN の降格は弾く・criteria 3）', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      mockRepo.upsert.mockResolvedValue({ row: null, blocked: true });

      await expect(service.add({ ...dto, role: 'MEMBER' }, REQUESTER)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('CHANNEL は非アーカイブの CHANNEL Space と一致する時だけ追加できる', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      mockRepo.findScopeTarget.mockResolvedValue({ archivedAt: null, kind: 'CHANNEL' });
      mockRepo.upsert.mockResolvedValue({
        row: makeMembershipWithAccount({
          scopeType: MembershipScopeType.CHANNEL,
          scopeId: 'channel-1',
        }),
        blocked: false,
      });

      await expect(
        service.add(
          {
            ...dto,
            scopeType: MembershipScopeType.CHANNEL,
            scopeId: 'channel-1',
          },
          SYSTEM_ADMIN,
        ),
      ).resolves.toMatchObject({ success: true });
    });

    it('CHANNEL scopeId が GROUP Space を指す場合は BadRequestException', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      mockRepo.findScopeTarget.mockResolvedValue({ archivedAt: null, kind: 'GROUP' });

      await expect(
        service.add(
          {
            ...dto,
            scopeType: MembershipScopeType.CHANNEL,
            scopeId: 'group-1',
          },
          SYSTEM_ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('findByScope', () => {
    it('scope に membership がなければ ForbiddenException', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue(null);

      await expect(
        service.findByScope('ORGANIZATION', SCOPE_ID, REQUESTER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockRepo.findByScope).not.toHaveBeenCalled();
    });

    it('MEMBER 権限でも一覧閲覧は可（membership さえあれば OK）', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'MEMBER' });
      const rows = [makeMembershipWithAccount()];
      mockRepo.findByScope.mockResolvedValue(rows);

      const result = await service.findByScope('ORGANIZATION', SCOPE_ID, REQUESTER_ID);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].scopeType).toBe(MembershipScopeType.ORGANIZATION);
      expect(result.data[0].accountName).toBe('テストユーザー');
    });
  });

  describe('remove', () => {
    it('membership が存在しなければ NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(MEMBERSHIP_ID, REQUESTER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('scope に ADMIN でなく かつ システム ADMIN でもなければ ForbiddenException', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue(null);

      await expect(service.remove(MEMBERSHIP_ID, REQUESTER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('MEMBER 権限かつ非システム ADMIN では ForbiddenException', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'MEMBER' });

      await expect(service.remove(MEMBERSHIP_ID, REQUESTER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('MEMBER の削除は管理者数に影響しないため通常 delete（ガードを通さない）', async () => {
      const row = makeMembershipWithAccount(); // 既定 role=MEMBER
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(MEMBERSHIP_ID, REQUESTER);

      expect(mockRepo.deleteLastAdminGuarded).not.toHaveBeenCalled();
      expect(mockRepo.delete).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('スコープ唯一の ADMIN は削除できない（アトミックガードが blocked を返す→BadRequestException）', async () => {
      const row = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      mockRepo.deleteLastAdminGuarded.mockResolvedValue({ blocked: true });

      await expect(service.remove(MEMBERSHIP_ID, REQUESTER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.deleteLastAdminGuarded).toHaveBeenCalledWith(
        MEMBERSHIP_ID,
        row.scopeType,
        row.scopeId,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('ADMIN が複数いれば ADMIN を削除できる（アトミックガードが blocked=false）', async () => {
      const row = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      mockRepo.deleteLastAdminGuarded.mockResolvedValue({ blocked: false });

      await service.remove(MEMBERSHIP_ID, REQUESTER);

      expect(mockRepo.deleteLastAdminGuarded).toHaveBeenCalledWith(
        MEMBERSHIP_ID,
        row.scopeType,
        row.scopeId,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('システム ADMIN は scope-ADMIN でなくてもバイパス削除でき、監査ログ（actionType=admin）を残す', async () => {
      const row = makeMembershipWithAccount(); // MEMBER
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue(null); // バイパス
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(MEMBERSHIP_ID, SYSTEM_ADMIN);

      expect(mockRepo.delete).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockAudit.record).toHaveBeenCalledTimes(1);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorAccountId: SYSTEM_ADMIN.id,
          actionType: 'admin',
          feature: 'memberships',
        }),
      );
    });

    it('システム ADMIN かつ scope-ADMIN を兼ねる場合はバイパスでないため監査を残さない', async () => {
      const row = makeMembershipWithAccount();
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      mockRepo.delete.mockResolvedValue(undefined);

      await service.remove(MEMBERSHIP_ID, SYSTEM_ADMIN);

      expect(mockRepo.delete).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('システム ADMIN バイパスでもスコープ唯一の ADMIN は削除できない（全消失ガード維持）', async () => {
      const row = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      mockRepo.deleteLastAdminGuarded.mockResolvedValue({ blocked: true });

      await expect(service.remove(MEMBERSHIP_ID, SYSTEM_ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('membership が存在しなければ NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.updateRole(MEMBERSHIP_ID, 'ADMIN', REQUESTER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('scope に membership がなく かつ システム ADMIN でもなければ ForbiddenException', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue(null);

      await expect(service.updateRole(MEMBERSHIP_ID, 'ADMIN', REQUESTER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('MEMBER 権限かつ非システム ADMIN では ForbiddenException', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'MEMBER' });

      await expect(service.updateRole(MEMBERSHIP_ID, 'ADMIN', REQUESTER)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('MEMBER → ADMIN 昇格は scope-ADMIN で実行でき、全消失ガードは無関係', async () => {
      const row = makeMembershipWithAccount(); // 既定 role=MEMBER
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      const updatedRow = makeMembershipWithAccount(
        { role: 'ADMIN' as typeof row.role },
        'テストユーザー',
      );
      mockRepo.update.mockResolvedValue(updatedRow);

      const result = await service.updateRole(MEMBERSHIP_ID, 'ADMIN', REQUESTER);

      expect(mockRepo.demoteLastAdminGuarded).not.toHaveBeenCalled();
      expect(mockRepo.update).toHaveBeenCalledWith(MEMBERSHIP_ID, { role: 'ADMIN' });
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('ADMIN');
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('スコープ唯一の ADMIN を MEMBER へ降格できない（アトミックガードが blocked→BadRequestException）', async () => {
      const row = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      mockRepo.demoteLastAdminGuarded.mockResolvedValue({ blocked: true });

      await expect(service.updateRole(MEMBERSHIP_ID, 'MEMBER', REQUESTER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.demoteLastAdminGuarded).toHaveBeenCalledWith(
        MEMBERSHIP_ID,
        row.scopeType,
        row.scopeId,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('ADMIN が複数いれば ADMIN → MEMBER 降格を実行できる（アトミックガードが blocked=false）', async () => {
      const row = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      const updatedRow = makeMembershipWithAccount({ role: 'MEMBER' as typeof row.role });
      mockRepo.demoteLastAdminGuarded.mockResolvedValue({ blocked: false, row: updatedRow });

      const result = await service.updateRole(MEMBERSHIP_ID, 'MEMBER', REQUESTER);

      expect(mockRepo.demoteLastAdminGuarded).toHaveBeenCalledWith(
        MEMBERSHIP_ID,
        row.scopeType,
        row.scopeId,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(result.data.role).toBe('MEMBER');
    });

    it('システム ADMIN は scope-ADMIN でなくてもバイパスロール変更でき、監査ログを残す', async () => {
      const row = makeMembershipWithAccount(); // MEMBER
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      const updatedRow = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.update.mockResolvedValue(updatedRow);

      const result = await service.updateRole(MEMBERSHIP_ID, 'ADMIN', SYSTEM_ADMIN);

      expect(mockRepo.update).toHaveBeenCalledWith(MEMBERSHIP_ID, { role: 'ADMIN' });
      expect(mockAudit.record).toHaveBeenCalledTimes(1);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorAccountId: SYSTEM_ADMIN.id,
          actionType: 'admin',
          feature: 'memberships',
        }),
      );
      expect(result.success).toBe(true);
      expect(result.data.role).toBe('ADMIN');
    });

    it('システム ADMIN かつ scope-ADMIN を兼ねる場合はバイパスでないため監査を残さない', async () => {
      const row = makeMembershipWithAccount();
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue({ id: 'mem-req', role: 'ADMIN' });
      const updatedRow = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.update.mockResolvedValue(updatedRow);

      await service.updateRole(MEMBERSHIP_ID, 'ADMIN', SYSTEM_ADMIN);

      expect(mockRepo.update).toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });

    it('システム ADMIN バイパスでもスコープ唯一の ADMIN は降格できない（全消失ガード維持）', async () => {
      const row = makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' });
      mockRepo.findById.mockResolvedValue(row);
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      mockRepo.demoteLastAdminGuarded.mockResolvedValue({ blocked: true });

      await expect(
        service.updateRole(MEMBERSHIP_ID, 'MEMBER', SYSTEM_ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });

  /**
   * 明示監査行（システム ADMIN のスコープバイパス 3 経路）へアクセス元（IP・UA）が載ることの固定
   * （rete-members-0001＝fil-0106 項目3 の横展開）。渡し漏れが起きると赤くなる。
   */
  describe('明示監査行のアクセス元（IP・UA）', () => {
    const CLIENT = { ipAddress: '203.0.113.9', userAgent: 'Mozilla/5.0 (test)' };
    const dto = {
      accountId: TARGET_ACCOUNT_ID,
      scopeType: MembershipScopeType.ORGANIZATION,
      scopeId: SCOPE_ID,
      role: 'MEMBER' as const,
    };

    it('add（バイパス招待）の監査行にアクセス元が載る', async () => {
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      mockRepo.upsert.mockResolvedValue({ row: makeMembershipWithAccount(), blocked: false });

      await service.add(dto, SYSTEM_ADMIN, CLIENT);

      expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining(CLIENT));
    });

    it('remove（バイパス削除）の監査行にアクセス元が載る', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue(null);

      await service.remove(MEMBERSHIP_ID, SYSTEM_ADMIN, CLIENT);

      expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining(CLIENT));
    });

    it('updateRole（バイパスロール変更）の監査行にアクセス元が載る', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue(null);
      mockRepo.update.mockResolvedValue(makeMembershipWithAccount({ role: 'ADMIN' as 'ADMIN' }));

      await service.updateRole(MEMBERSHIP_ID, 'ADMIN', SYSTEM_ADMIN, CLIENT);

      expect(mockAudit.record).toHaveBeenCalledWith(expect.objectContaining(CLIENT));
    });

    it('アクセス元が取れない（未指定）でも記録は失敗せず undefined のまま渡る（記録側で null へ寄る）', async () => {
      mockRepo.findById.mockResolvedValue(makeMembershipWithAccount());
      mockRepo.findEffectiveMembership.mockResolvedValue(null);

      await service.remove(MEMBERSHIP_ID, SYSTEM_ADMIN);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: undefined, userAgent: undefined }),
      );
    });
  });
});
