import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import {
  nextSortOrder,
  buildArchiveUpdate,
  cascadeArchiveSpacesByProjectIds,
} from '../../../common/services/container.helper';

/**
 * 組織エンティティの select 形状の SSOT（§1 DTO 境界）。
 * id/name/sortOrder/archivedAt/createdAt/updatedAt のみ取得し、他の列・リレーションは返さない。
 */
const organizationSelect = {
  id: true,
  name: true,
  sortOrder: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** mapper の入力型。select で絞った Organization エンティティ。 */
export type OrganizationRow = Prisma.OrganizationGetPayload<{
  select: typeof organizationSelect;
}>;

/**
 * 組織管理のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * create は作成者の ADMIN membership を同一 tx で共創する（ADR 0037 §5・可視＝membership）。
 */
@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 組織とその作成者の ORGANIZATION ADMIN membership を同一 tx で作成する（ADR 0037 §5）。
   * さもないと「可視＝membership」の帰結で作成者が自分の組織を見られない。
   */
  async createWithMembership(name: string, userId: string): Promise<OrganizationRow> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const sortOrder = await nextSortOrder(() => tx.organization.count());
      const org = await tx.organization.create({
        data: { name, sortOrder },
        select: organizationSelect,
      });
      await tx.membership.create({
        data: {
          accountId: userId,
          scopeType: 'ORGANIZATION',
          scopeId: org.id,
          role: 'ADMIN',
        },
      });
      return org;
    });
  }

  /**
   * 指定ユーザーが可視な組織を返す（archived 除外）。
   * 可視 = ORGANIZATION membership（既存） OR 所属グループの ORGANIZATION grant（set-0164・加算 OR）。
   * set-0188: グループのアーカイブは撤去済のため、所属グループの grant は常に有効。
   * Membership は polymorphic FK（scopeId）のため Organization に relation が張られていない。
   * 二段クエリ: membership/grant→scopeId 取得 → organization.id IN [...] 絞り込み。
   */
  async findVisibleForUser(userId: string): Promise<OrganizationRow[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { accountId: userId, scopeType: 'ORGANIZATION' },
      select: { scopeId: true },
    });
    // set-0164: 所属グループの ORGANIZATION grant を加算 OR で union（dedup）
    const groupMemberships = await this.prisma.userGroupMember.findMany({
      where: { accountId: userId },
      select: { groupId: true },
    });
    let grantOrgIds: string[] = [];
    if (groupMemberships.length > 0) {
      const grants = await this.prisma.userGroupScopeGrant.findMany({
        where: {
          groupId: { in: groupMemberships.map((m) => m.groupId) },
          scopeType: 'ORGANIZATION',
        },
        select: { scopeId: true },
      });
      grantOrgIds = grants.map((g) => g.scopeId);
    }
    const orgIds = [...new Set([...memberships.map((m) => m.scopeId), ...grantOrgIds])];
    if (orgIds.length === 0) return [];
    return this.prisma.organization.findMany({
      where: { id: { in: orgIds }, archivedAt: null },
      select: organizationSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: string): Promise<OrganizationRow | null> {
    return this.prisma.organization.findUnique({
      where: { id },
      select: organizationSelect,
    });
  }

  update(id: string, data: Prisma.OrganizationUpdateInput): Promise<OrganizationRow> {
    return this.prisma.organization.update({
      where: { id },
      data,
      select: organizationSelect,
    });
  }

  /**
   * 全組織一覧（membership 非依存・テナント管理 ADMIN 向け）。
   * includeArchived=false/undefined → archivedAt=null のみ（既定・archived 除外）
   * includeArchived=true → archived 含む全件
   */
  findAllAdmin(includeArchived?: boolean): Promise<OrganizationRow[]> {
    const where: Prisma.OrganizationWhereInput = includeArchived ? {} : { archivedAt: null };
    return this.prisma.organization.findMany({
      where,
      select: organizationSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 組織を更新し、archived 変更があれば配下 Project と CHANNEL Space を同一 tx で連鎖 archive/restore する。
   * archived=true → 配下 projects + spaces の archivedAt をセット（連鎖 archive）。
   * archived=false → 配下 projects + spaces の archivedAt=null（連鎖復元）。
   * archived 未指定（name のみ変更）→ cascade なし（tx なしの単純 update を使う）。
   */
  async adminUpdateWithCascade(
    id: string,
    data: Prisma.OrganizationUpdateInput,
    archived?: boolean,
  ): Promise<OrganizationRow> {
    if (archived === undefined) {
      // archive 変更なし → 単純 update で済む（tx オーバーヘッドを避ける）
      return this.update(id, data);
    }
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id },
        data,
        select: organizationSelect,
      });
      const archiveData = buildArchiveUpdate(archived);
      // 配下 project を連鎖 archive/restore
      await tx.project.updateMany({
        where: { organizationId: id },
        data: archiveData,
      });
      // 配下 project の ID を収集して CHANNEL space を連鎖 archive/restore
      const projects = await tx.project.findMany({
        where: { organizationId: id },
        select: { id: true },
      });
      await cascadeArchiveSpacesByProjectIds(
        tx,
        projects.map((p) => p.id),
        archived,
      );
      return org;
    });
  }

  /**
   * 組織の物理削除（set-0162）。配下 PJ（archived 含む全物理行）の検査と削除を同一 tx で行い
   * race を防ぐ。PJ が 1 件でもあれば削除せず false（service が 409 へ変換）。
   * 削除時は孤児 membership（scopeType=ORGANIZATION・ポリモーフィック参照）を同一 tx で掃除する。
   */
  async deleteIfNoProjects(id: string): Promise<boolean> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const projectCount = await tx.project.count({ where: { organizationId: id } });
      if (projectCount > 0) return false;
      await tx.membership.deleteMany({
        where: { scopeType: 'ORGANIZATION', scopeId: id },
      });
      await tx.organization.delete({ where: { id } });
      return true;
    });
  }
}
