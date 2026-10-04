import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './repositories/organizations.repository';
import { MembershipsRepository } from '../memberships/repositories/memberships.repository';
import { makeOrganizationRow } from '../../__tests__/factories';

const FIXED_DATE = new Date('2026-06-14T00:00:00.000Z');

const mockOrgRepo = {
  createWithMembership: jest.fn(),
  findVisibleForUser: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findAllAdmin: jest.fn(),
  adminUpdateWithCascade: jest.fn(),
  // set-0162: 物理削除（配下 PJ 検査 + membership 掃除 + 削除を同一 tx）。
  deleteIfNoProjects: jest.fn(),
};

const mockMembershipRepo = {
  findMembership: jest.fn(),
  findEffectiveMembership: jest.fn(),
};

const USER_ID = 'user-1';
const ORG_ID = 'org-1';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: OrganizationsRepository, useValue: mockOrgRepo },
        { provide: MembershipsRepository, useValue: mockMembershipRepo },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('create', () => {
    it('組織と作成者の ADMIN membership を同時に作成し OrganizationDto を返す', async () => {
      const row = makeOrganizationRow({ id: 'org-new', name: '新組織' });
      mockOrgRepo.createWithMembership.mockResolvedValue(row);

      const result = await service.create({ name: '新組織' }, USER_ID);

      expect(mockOrgRepo.createWithMembership).toHaveBeenCalledWith('新組織', USER_ID);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('org-new');
      expect(result.data.name).toBe('新組織');
      expect(result.data.archived).toBe(false);
    });
  });

  describe('findAll', () => {
    it('自分が membership を持つ組織一覧を OrganizationDto 配列で返す', async () => {
      mockOrgRepo.findVisibleForUser.mockResolvedValue([makeOrganizationRow()]);

      const result = await service.findAll(USER_ID);

      expect(mockOrgRepo.findVisibleForUser).toHaveBeenCalledWith(USER_ID);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].archived).toBe(false);
    });
  });

  describe('update', () => {
    it('対象組織が不在なら NotFoundException', async () => {
      mockOrgRepo.findById.mockResolvedValue(null);

      await expect(service.update(ORG_ID, { name: '新名称' }, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockOrgRepo.update).not.toHaveBeenCalled();
    });

    it('ADMIN membership がない場合は ForbiddenException', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      // ADMIN membership なし
      mockMembershipRepo.findEffectiveMembership.mockResolvedValue(null);

      await expect(service.update(ORG_ID, { name: '新名称' }, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockOrgRepo.update).not.toHaveBeenCalled();
    });

    it('ADMIN membership あり + name 変更は更新データに name を渡す', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      mockMembershipRepo.findEffectiveMembership.mockResolvedValue({ role: 'ADMIN' });
      const updatedRow = makeOrganizationRow({ name: '新名称' });
      mockOrgRepo.update.mockResolvedValue(updatedRow);

      const result = await service.update(ORG_ID, { name: '新名称' }, USER_ID);

      expect(mockOrgRepo.update).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ name: '新名称' }),
      );
      expect(result.data.name).toBe('新名称');
    });

    it('archived=true は archivedAt に日時をセットする', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      mockMembershipRepo.findEffectiveMembership.mockResolvedValue({ role: 'ADMIN' });
      const archivedRow = makeOrganizationRow({ archivedAt: FIXED_DATE });
      mockOrgRepo.adminUpdateWithCascade.mockResolvedValue(archivedRow);

      const result = await service.update(ORG_ID, { archived: true }, USER_ID);

      const [, data, archived] = mockOrgRepo.adminUpdateWithCascade.mock.calls[0];
      expect(data.archivedAt).toBeInstanceOf(Date);
      expect(archived).toBe(true);
      expect(mockOrgRepo.update).not.toHaveBeenCalled();
      expect(result.data.archived).toBe(true);
    });

    it('archived=false は archivedAt=null をセットする（復元）', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow({ archivedAt: FIXED_DATE }));
      mockMembershipRepo.findEffectiveMembership.mockResolvedValue({ role: 'ADMIN' });
      mockOrgRepo.adminUpdateWithCascade.mockResolvedValue(makeOrganizationRow());

      await service.update(ORG_ID, { archived: false }, USER_ID);

      const [, data, archived] = mockOrgRepo.adminUpdateWithCascade.mock.calls[0];
      expect(data.archivedAt).toBeNull();
      expect(archived).toBe(false);
      expect(mockOrgRepo.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // findAllAdmin（set-0027 テナント管理 ADMIN 向け一覧）
  // ============================================================
  describe('findAllAdmin', () => {
    it('membership 非依存で repo.findAllAdmin を呼び OrganizationDto 配列を返す', async () => {
      mockOrgRepo.findAllAdmin.mockResolvedValue([makeOrganizationRow()]);

      const result = await service.findAllAdmin();

      expect(mockOrgRepo.findAllAdmin).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('includeArchived=true を repo へ正しく伝達する', async () => {
      mockOrgRepo.findAllAdmin.mockResolvedValue([]);

      await service.findAllAdmin(true);

      expect(mockOrgRepo.findAllAdmin).toHaveBeenCalledWith(true);
    });

    it('archived な組織も OrganizationDto に変換して返す（archived=true が data に反映）', async () => {
      mockOrgRepo.findAllAdmin.mockResolvedValue([makeOrganizationRow({ archivedAt: FIXED_DATE })]);

      const result = await service.findAllAdmin(true);

      expect(result.data[0].archived).toBe(true);
    });
  });

  // ============================================================
  // adminUpdate（set-0027 cascade archive/restore）
  // ============================================================
  describe('adminUpdate', () => {
    it('組織が不在なら NotFoundException', async () => {
      mockOrgRepo.findById.mockResolvedValue(null);

      await expect(service.adminUpdate(ORG_ID, { name: '新名称' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockOrgRepo.adminUpdateWithCascade).not.toHaveBeenCalled();
    });

    it('membership チェックなし（system ADMIN gate はコントローラ層）: 組織存在なら更新する', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      const updatedRow = makeOrganizationRow({ name: '新名称' });
      mockOrgRepo.adminUpdateWithCascade.mockResolvedValue(updatedRow);

      const result = await service.adminUpdate(ORG_ID, { name: '新名称' });

      // membershipRepo は呼ばない（system gate のため）
      expect(mockMembershipRepo.findEffectiveMembership).not.toHaveBeenCalled();
      expect(mockOrgRepo.adminUpdateWithCascade).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ name: '新名称' }),
        undefined, // archived 未指定
      );
      expect(result.data.name).toBe('新名称');
    });

    it('archived=true は adminUpdateWithCascade に archived=true を渡し連鎖 archive をトリガーする', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      const archivedRow = makeOrganizationRow({ archivedAt: FIXED_DATE });
      mockOrgRepo.adminUpdateWithCascade.mockResolvedValue(archivedRow);

      const result = await service.adminUpdate(ORG_ID, { archived: true });

      const [, data, archived] = mockOrgRepo.adminUpdateWithCascade.mock.calls[0];
      expect(data.archivedAt).toBeInstanceOf(Date);
      expect(archived).toBe(true);
      expect(result.data.archived).toBe(true);
    });

    it('archived=false は adminUpdateWithCascade に archived=false を渡し連鎖復元をトリガーする', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow({ archivedAt: FIXED_DATE }));
      mockOrgRepo.adminUpdateWithCascade.mockResolvedValue(makeOrganizationRow());

      await service.adminUpdate(ORG_ID, { archived: false });

      const [, data, archived] = mockOrgRepo.adminUpdateWithCascade.mock.calls[0];
      expect(data.archivedAt).toBeNull();
      expect(archived).toBe(false);
    });
  });

  // ============================================================
  // adminDelete（set-0162・物理削除）
  // ============================================================
  describe('adminDelete', () => {
    it('組織が不在なら NotFoundException', async () => {
      mockOrgRepo.findById.mockResolvedValue(null);

      await expect(service.adminDelete(ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockOrgRepo.deleteIfNoProjects).not.toHaveBeenCalled();
    });

    it('配下 PJ が無ければ削除し ok を返す（membership 掃除は repo の同一 tx）', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      mockOrgRepo.deleteIfNoProjects.mockResolvedValue(true);

      const result = await service.adminDelete(ORG_ID);

      expect(mockOrgRepo.deleteIfNoProjects).toHaveBeenCalledWith(ORG_ID);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: ORG_ID });
    });

    it('配下 PJ が在れば ConflictException（アーカイブを促す）', async () => {
      mockOrgRepo.findById.mockResolvedValue(makeOrganizationRow());
      mockOrgRepo.deleteIfNoProjects.mockResolvedValue(false);

      await expect(service.adminDelete(ORG_ID)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
