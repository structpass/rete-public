import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import {
  nextSortOrder,
  cascadeArchiveSpacesByProjectIds,
} from '../../../common/services/container.helper';

const projectSelect = {
  id: true,
  organizationId: true,
  name: true,
  sortOrder: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** mapper の入力型。 */
export type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

/**
 * プロジェクト管理のデータアクセス層（§2 Repository 分離）。
 * createWithMemberships は project + 複数 membership を同一 tx で共創する（ADR 0037 §5・§9-2）。
 */
@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * プロジェクトと ADMIN membership 群を同一 tx で作成する（ADR 0037 §9-2）。
   * adminAccountIds は作成者を含む（caller が dedup する）。
   * unique 制約（accountId, scopeType, scopeId）に対し upsert で冪等にする。
   */
  async createWithMemberships(
    data: { organizationId: string; name: string },
    adminAccountIds: string[],
  ): Promise<ProjectRow> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const sortOrder = await nextSortOrder(() =>
        tx.project.count({ where: { organizationId: data.organizationId } }),
      );
      const project = await tx.project.create({
        data: { ...data, sortOrder },
        select: projectSelect,
      });
      for (const accountId of adminAccountIds) {
        await tx.membership.upsert({
          where: {
            accountId_scopeType_scopeId: {
              accountId,
              scopeType: 'PROJECT',
              scopeId: project.id,
            },
          },
          create: { accountId, scopeType: 'PROJECT', scopeId: project.id, role: 'ADMIN' },
          update: { role: 'ADMIN' },
        });
      }
      return project;
    });
  }

  /**
   * 指定ユーザーが可視な組織配下のプロジェクトを返す。
   * visibleOrgIds は OrganizationsRepository.findVisibleForUser → id 抽出で渡す。
   * organizationId 指定時はそのスコープのみ絞る（指定なしは全可視組織）。
   * 指定 organizationId が可視集合外なら org 経由は空配列（非メンバーには存在ごと見せない・ADR 0037 §4.2）。
   * userId 指定時は所属グループの PROJECT grant（set-0164・非アーカイブグループのみ）も加算 OR で union する
   * （grant のみのユーザーでもプロジェクト一覧・サイドバーに現れる・criteria 9）。
   * grant 経由は grant 自体が所属を意味するため可視集合チェックは掛けない（organizationId 指定時は同組織に絞る）。
   */
  async findVisibleForUser(
    visibleOrgIds: string[],
    organizationId?: string,
    userId?: string,
  ): Promise<ProjectRow[]> {
    // org 経由: 可視集合内の組織のみ（不可視組織は org 経由を空にする・存在秘匿）
    const orgFilter = organizationId
      ? visibleOrgIds.includes(organizationId)
        ? { organizationId }
        : { organizationId: { in: [] } }
      : { organizationId: { in: visibleOrgIds } };

    // set-0164: 所属グループの PROJECT grant を加算 OR で union（dedup）
    let grantProjectIds: string[] = [];
    if (userId) {
      const groupMemberships = await this.prisma.userGroupMember.findMany({
        where: { accountId: userId },
        select: { groupId: true },
      });
      if (groupMemberships.length > 0) {
        const grants = await this.prisma.userGroupScopeGrant.findMany({
          where: {
            groupId: { in: groupMemberships.map((m) => m.groupId) },
            scopeType: 'PROJECT',
          },
          select: { scopeId: true },
        });
        grantProjectIds = grants.map((g) => g.scopeId);
      }
    }

    const [orgProjects, grantProjects] = await Promise.all([
      this.prisma.project.findMany({
        where: { ...orgFilter, archivedAt: null },
        select: projectSelect,
        orderBy: [{ organizationId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      grantProjectIds.length > 0
        ? this.prisma.project.findMany({
            where: {
              id: { in: grantProjectIds },
              archivedAt: null,
              ...(organizationId ? { organizationId } : {}),
            },
            select: projectSelect,
          })
        : Promise.resolve([] as ProjectRow[]),
    ]);

    // org 経由と grant 経由を union（id で dedup・org 経由の並び順を維持）
    const seen = new Set(orgProjects.map((p) => p.id));
    return [...orgProjects, ...grantProjects.filter((p) => !seen.has(p.id))];
  }

  findById(id: string): Promise<ProjectRow | null> {
    return this.prisma.project.findUnique({ where: { id }, select: projectSelect });
  }

  /** 組織の実在確認（権限チェック前の preliminary check 用）。 */
  findOrganizationId(projectId: string): Promise<{ organizationId: string } | null> {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
  }

  update(id: string, data: Prisma.ProjectUpdateInput): Promise<ProjectRow> {
    return this.prisma.project.update({ where: { id }, data, select: projectSelect });
  }

  /**
   * 全プロジェクト一覧（membership 非依存・テナント管理 ADMIN 向け）。
   * organizationId 指定時はその組織配下のみ絞る（指定なしは全件）。
   * includeArchived=true で archived 含む全件、既定（false/undefined）は archived 除外。
   */
  findAllAdmin(includeArchived?: boolean, organizationId?: string): Promise<ProjectRow[]> {
    const where: Prisma.ProjectWhereInput = {};
    if (!includeArchived) where.archivedAt = null;
    if (organizationId) where.organizationId = organizationId;
    return this.prisma.project.findMany({
      where,
      select: projectSelect,
      orderBy: [{ organizationId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * プロジェクトを更新し、archived 変更があれば配下 CHANNEL Space を同一 tx で連鎖 archive/restore する。
   * archived=true → 配下 spaces の archivedAt をセット（連鎖 archive）。
   * archived=false → 配下 spaces の archivedAt=null（連鎖復元）。
   * archived 未指定（name のみ変更）→ cascade なし（tx なしの単純 update を使う）。
   */
  async adminUpdateWithCascade(
    id: string,
    data: Prisma.ProjectUpdateInput,
    archived?: boolean,
  ): Promise<ProjectRow> {
    if (archived === undefined) {
      return this.update(id, data);
    }
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data,
        select: projectSelect,
      });
      // 配下 CHANNEL space を連鎖 archive/restore（cascadeArchiveSpacesByProjectIds を再利用・§3）
      await cascadeArchiveSpacesByProjectIds(tx, [id], archived);
      return project;
    });
  }

  /**
   * プロジェクトの物理削除（set-0162）。配下 CHANNEL（archived 含む全物理行）の検査と削除を
   * 同一 tx で行い race を防ぐ。チャネルが 1 件でもあれば削除せず false（service が 409 へ変換）。
   * 削除時は孤児 membership（scopeType=PROJECT・ポリモーフィック参照）を同一 tx で掃除する。
   */
  async deleteIfNoChannels(id: string): Promise<boolean> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const channelCount = await tx.space.count({ where: { projectId: id, kind: 'CHANNEL' } });
      if (channelCount > 0) return false;
      await tx.membership.deleteMany({
        where: { scopeType: 'PROJECT', scopeId: id },
      });
      await tx.project.delete({ where: { id } });
      return true;
    });
  }
}
