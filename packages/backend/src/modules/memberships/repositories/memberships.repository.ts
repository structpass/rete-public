import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MembershipScopeType } from '@rete/shared';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';

const membershipSelect = {
  id: true,
  accountId: true,
  scopeType: true,
  scopeId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** account 名を含む membership 形状（一覧表示用）。 */
const membershipWithAccountSelect = {
  ...membershipSelect,
  account: { select: { name: true } },
} as const;

/** mapper の入力型（基本形）。 */
export type MembershipRow = Prisma.MembershipGetPayload<{ select: typeof membershipSelect }>;

/** account.name を含む拡張形（一覧用）。 */
export type MembershipWithAccount = Prisma.MembershipGetPayload<{
  select: typeof membershipWithAccountSelect;
}>;

const permissionMatrixGroupSelect = {
  id: true,
  name: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { members: true } },
} as const;

const permissionMatrixGrantSelect = {
  id: true,
  groupId: true,
  scopeType: true,
  scopeId: true,
  role: true,
  createdAt: true,
} as const;

export type PermissionMatrixRows = {
  organizations: Array<{ id: string; name: string; sortOrder: number }>;
  projects: Array<{ id: string; organizationId: string; name: string; sortOrder: number }>;
  channels: Array<{ id: string; projectId: string | null; name: string; sortOrder: number }>;
  groups: Prisma.UserGroupGetPayload<{ select: typeof permissionMatrixGroupSelect }>[];
  grants: Prisma.UserGroupScopeGrantGetPayload<{ select: typeof permissionMatrixGrantSelect }>[];
};

export type MembershipScopeTarget = {
  archivedAt: Date | null;
  kind?: 'CHANNEL' | 'GROUP' | 'PERSONAL_MEMO' | 'PERSONAL_DM';
};

/**
 * メンバーシップのデータアクセス層（§2 Repository 分離）。
 * ポリモーフィック scopeId の実在 cross-check は service 層が担う（本 repository は DB 操作のみ）。
 * 他モジュール（OrganizationsService / ProjectsService / SpacesService）の権限チェック用に
 * MembershipsModule から export される。
 */
@Injectable()
export class MembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 所属管理マトリクの read model。画面初期表示に必要な行・列・直接設定を
   * 固定本数の並列クエリで取得し、scope 単位の N+1 を作らない。
   */
  async findPermissionMatrix(): Promise<PermissionMatrixRows> {
    const scopeTypes = [
      MembershipScopeType.ORGANIZATION,
      MembershipScopeType.PROJECT,
      MembershipScopeType.CHANNEL,
    ];
    const [organizations, projects, channels, groups, grants] = await Promise.all([
      this.prisma.organization.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.project.findMany({
        where: { archivedAt: null, organization: { archivedAt: null } },
        select: { id: true, organizationId: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.space.findMany({
        where: {
          kind: 'CHANNEL',
          archivedAt: null,
          project: { archivedAt: null, organization: { archivedAt: null } },
        },
        select: { id: true, projectId: true, name: true, sortOrder: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.userGroup.findMany({
        select: permissionMatrixGroupSelect,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.userGroupScopeGrant.findMany({
        where: { scopeType: { in: scopeTypes } },
        select: permissionMatrixGrantSelect,
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { organizations, projects, channels, groups, grants };
  }

  /** ポリモーフィック scopeId の実在・アーカイブ・Space kind を検査する。 */
  async findScopeTarget(
    scopeType: MembershipScopeType,
    scopeId: string,
  ): Promise<MembershipScopeTarget | null> {
    if (scopeType === MembershipScopeType.ORGANIZATION) {
      return this.prisma.organization.findUnique({
        where: { id: scopeId },
        select: { archivedAt: true },
      });
    }
    if (scopeType === MembershipScopeType.PROJECT) {
      return this.prisma.project.findUnique({
        where: { id: scopeId },
        select: { archivedAt: true },
      });
    }
    return this.prisma.space.findUnique({
      where: { id: scopeId },
      select: { archivedAt: true, kind: true },
    });
  }

  /**
   * 特定 account×scope×optional-role の membership を返す（権限チェック用）。
   * role 未指定で scope 内の任意 membership を探す、'ADMIN' 指定で管理者のみ。
   */
  findMembership(
    accountId: string,
    scopeType: string,
    scopeId: string,
  ): Promise<Pick<MembershipRow, 'id' | 'role'> | null> {
    return this.prisma.membership.findUnique({
      where: {
        accountId_scopeType_scopeId: {
          accountId,
          scopeType: scopeType as MembershipScopeType,
          scopeId,
        },
      },
      select: { id: true, role: true },
    });
  }

  /**
   * 指定 account × scope の「実効ロール」を返す（set-0164・加算 OR・高位優先）。
   * 実効ロール = 個別 membership の role OR 所属グループの grant 経由 role。
   * - グループ経由: user_group_members（所属）→ user_group_scope_grants（grant）で scope を照合
   * - 高位優先: いずれかの経路で ADMIN なら ADMIN（MEMBER は下位）
   * - grant ゼロ件の間は従来の findMembership と同値（挙動不変・criteria 2）
   * 戻り値: { id: string; role: Role } | null（どちらの経路でも所属が無ければ null）
   */
  async findEffectiveMembership(
    accountId: string,
    scopeType: string,
    scopeId: string,
  ): Promise<Pick<MembershipRow, 'id' | 'role'> | null> {
    const direct = await this.prisma.membership.findUnique({
      where: {
        accountId_scopeType_scopeId: {
          accountId,
          scopeType: scopeType as MembershipScopeType,
          scopeId,
        },
      },
      select: { id: true, role: true },
    });

    const grantRole = await this.findGrantRole(
      accountId,
      scopeType as MembershipScopeType,
      scopeId,
    );

    // 高位優先: ADMIN が最上位。direct が ADMIN なら即 ADMIN。
    if (direct?.role === 'ADMIN') return direct;
    if (grantRole === 'ADMIN') return { id: 'grant', role: 'ADMIN' as const };
    if (direct) return direct;
    if (grantRole === 'MEMBER') return { id: 'grant', role: 'MEMBER' as const };
    return null;
  }

  /**
   * 指定 account が所属グループの grant 経由で持つ scope 内ロールを返す（無ければ null）。
   * set-0188: グループのアーカイブは撤去済のため、所属グループの grant は常に有効。
   */
  private async findGrantRole(
    accountId: string,
    scopeType: MembershipScopeType,
    scopeId: string,
  ): Promise<'ADMIN' | 'MEMBER' | null> {
    const memberships = await this.prisma.userGroupMember.findMany({
      where: { accountId },
      select: { groupId: true },
    });
    if (memberships.length === 0) return null;

    const grants = await this.prisma.userGroupScopeGrant.findMany({
      where: {
        groupId: { in: memberships.map((m) => m.groupId) },
        scopeType,
        scopeId,
      },
      select: { role: true },
    });
    if (grants.length === 0) return null;
    return grants.some((g) => g.role === 'ADMIN') ? 'ADMIN' : 'MEMBER';
  }

  /**
   * 指定 account が「個別 ADMIN membership または ADMIN grant」を持つ scopeId 一覧（set-0164）。
   * 既存 findAdminScopeIds の grant 込み版。戻り値の形は既存と同じ（scopeId のみ）。
   */
  async findEffectiveAdminScopeIds(
    accountId: string,
    scopeType: string,
  ): Promise<Pick<MembershipRow, 'scopeId'>[]> {
    const direct = await this.prisma.membership.findMany({
      where: { accountId, scopeType: scopeType as MembershipScopeType, role: 'ADMIN' },
      select: { scopeId: true },
    });

    const memberships = await this.prisma.userGroupMember.findMany({
      where: { accountId },
      select: { groupId: true },
    });
    if (memberships.length === 0) return direct;

    const grants = await this.prisma.userGroupScopeGrant.findMany({
      where: {
        groupId: { in: memberships.map((m) => m.groupId) },
        scopeType: scopeType as MembershipScopeType,
        role: 'ADMIN',
      },
      select: { scopeId: true },
    });

    // union（dedup）・既存の戻り値形（scopeId のみ）を維持
    const seen = new Set(direct.map((d) => d.scopeId));
    const merged = [...direct];
    for (const g of grants) {
      if (!seen.has(g.scopeId)) {
        seen.add(g.scopeId);
        merged.push({ scopeId: g.scopeId });
      }
    }
    return merged;
  }

  /** スコープのメンバー一覧（account 名込み・createdAt 昇順）。 */
  findByScope(scopeType: string, scopeId: string): Promise<MembershipWithAccount[]> {
    return this.prisma.membership.findMany({
      where: { scopeType: scopeType as MembershipScopeType, scopeId },
      select: membershipWithAccountSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string): Promise<MembershipRow | null> {
    return this.prisma.membership.findUnique({ where: { id }, select: membershipSelect });
  }

  /**
   * membership を upsert する（冪等・招待の重複投入を許容）。
   * unique 制約 (accountId, scopeType, scopeId) に対し、既存行があれば role を上書きする。
   */
  /**
   * membership を upsert して account 名込みの行を返す（MembershipsService.add の mapper 用）。
   * unique 制約 (accountId, scopeType, scopeId) に対し、既存行があれば role を上書きする。
   * set-0164 criteria 3: ADMIN→MEMBER への降格（role 上書き）は実効 ADMIN 全消失ガードの対象。
   * このスコープ唯一の実効 ADMIN 源（個別 membership + グループ grant の 3 テーブル横断）を降格させない。
   * 判定は $transaction 内の count→write で原子化（TOCTOU 安全。"冪等 upsert の role 上書き経路" の迂回を塞ぐ）。
   * 戻り値: { row, blocked }（blocked=true の時は row=null・呼び出し側 service が 4xx へ変換）。
   */
  async upsert(data: {
    accountId: string;
    scopeType: string;
    scopeId: string;
    role: 'ADMIN' | 'MEMBER';
  }): Promise<{ row: MembershipWithAccount | null; blocked: boolean }> {
    const { accountId, role } = data;
    const scopeType = data.scopeType as MembershipScopeType;
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const existing = await tx.membership.findUnique({
        where: { accountId_scopeType_scopeId: { accountId, scopeType, scopeId: data.scopeId } },
        select: { id: true, role: true },
      });
      // ADMIN → MEMBER 降格: このメンバーシップを除いた実効 ADMIN 源がゼロなら拒否（全消失ガード）。
      if (existing && existing.role === 'ADMIN' && role === 'MEMBER') {
        const effectiveAdmins = await this.countEffectiveAdmins(scopeType, data.scopeId, {
          excludeMembershipId: existing.id,
          tx,
        });
        if (effectiveAdmins === 0) return { row: null, blocked: true };
      }
      const row = await tx.membership.upsert({
        where: { accountId_scopeType_scopeId: { accountId, scopeType, scopeId: data.scopeId } },
        create: { accountId, scopeType, scopeId: data.scopeId, role },
        update: { role },
        select: membershipWithAccountSelect,
      });
      return { row, blocked: false };
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.membership.delete({ where: { id } });
  }

  /**
   * membership の role を更新し account 名込みの行を返す（PATCH /memberships/:id）。
   * scope-ADMIN チェックは service 層が担う（本メソッドは DB 操作のみ）。
   */
  update(id: string, data: { role: 'ADMIN' | 'MEMBER' }): Promise<MembershipWithAccount> {
    return this.prisma.membership.update({
      where: { id },
      data,
      select: membershipWithAccountSelect,
    });
  }

  /**
   * account が ADMIN ロールを持つ scopeType 別の scopeId 一覧（管理権限の一括判定用）。
   * 例: PROJECT 管理者判定（ProjectDto.canManageChannels の付与）。findMembership の N+1 を避け一括取得する。
   * ※「account の scopeType 別 membership 一覧（scopeId のみ）」は cmn-0191 で
   *   ScopeVisibilityRepository.findMembershipScopeIds に移管済（findByAccount は削除）。
   */
  findAdminScopeIds(
    accountId: string,
    scopeType: string,
  ): Promise<Pick<MembershipRow, 'scopeId'>[]> {
    return this.prisma.membership.findMany({
      where: { accountId, scopeType: scopeType as MembershipScopeType, role: 'ADMIN' },
      select: { scopeId: true },
    });
  }

  /**
   * 指定スコープの「実効 ADMIN 源」の数を返す（set-0164 criteria 3・3 テーブル横断）。
   * 実効 ADMIN 源 = 個別 membership（role=ADMIN）1 件 = 1 ＋ ADMIN grant を持つグループで
   * メンバー 1 人以上のもの 1 件 = 1。全消失ガードの「最後の ADMIN が消えない」判定に使う。
   * opts.excludeMembershipId / excludeGroupId で「これから消す側」を除外した残数を数える。
   * tx 指定時はそのトランザクション内で count（呼び出し側の count→write 原子化に協調）。
   */
  async countEffectiveAdmins(
    scopeType: string,
    scopeId: string,
    opts: {
      excludeMembershipId?: string;
      excludeGroupId?: string;
      tx?: Prisma.TransactionClient;
    } = {},
  ): Promise<number> {
    const client = opts.tx ?? this.prisma;
    const directAdmins = await client.membership.count({
      where: {
        scopeType: scopeType as MembershipScopeType,
        scopeId,
        role: 'ADMIN',
        ...(opts.excludeMembershipId ? { id: { not: opts.excludeMembershipId } } : {}),
      },
    });
    const adminGrants = await client.userGroupScopeGrant.findMany({
      where: {
        scopeType: scopeType as MembershipScopeType,
        scopeId,
        role: 'ADMIN',
        ...(opts.excludeGroupId ? { groupId: { not: opts.excludeGroupId } } : {}),
      },
      select: { groupId: true },
    });
    let grantAdminSources = 0;
    if (adminGrants.length > 0) {
      const groupIds = [...new Set(adminGrants.map((g) => g.groupId))];
      const memberCounts = await client.userGroupMember.groupBy({
        by: ['groupId'],
        where: { groupId: { in: groupIds } },
        _count: { id: true },
      });
      grantAdminSources = memberCounts.filter((m) => m._count.id > 0).length;
    }
    return directAdmins + grantAdminSources;
  }

  /**
   * スコープ内 ADMIN membership の削除を TOCTOU 安全にアトミック実行する（cmn-0047 全消失ガード）。
   * 単一 $transaction 内でスコープ内 ADMIN 数を数え、最後の 1 人なら削除せず blocked=true を返す
   * （count→delete を別クエリにすると並行削除で管理者ゼロになりうるため原子化）。呼び出しは対象が ADMIN の時のみ。
   * set-0164: 数えるのは実効 ADMIN（個別 membership + グループ grant の 3 テーブル横断・criteria 3）。
   */
  async deleteLastAdminGuarded(
    id: string,
    scopeType: string,
    scopeId: string,
  ): Promise<{ blocked: boolean }> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const effectiveAdmins = await this.countEffectiveAdmins(scopeType, scopeId, {
        excludeMembershipId: id,
        tx,
      });
      if (effectiveAdmins === 0) {
        return { blocked: true };
      }
      await tx.membership.delete({ where: { id } });
      return { blocked: false };
    });
  }

  /**
   * スコープ内 ADMIN membership の MEMBER 降格を TOCTOU 安全にアトミック実行する（cmn-0047 全消失ガード）。
   * 単一 $transaction 内で実効 ADMIN 数（個別 + グループ grant・set-0164 criteria 3）を数え、
   * 最後の 1 人なら降格せず blocked=true を返す。呼び出しは対象が ADMIN の時のみ。
   */
  async demoteLastAdminGuarded(
    id: string,
    scopeType: string,
    scopeId: string,
  ): Promise<{ blocked: boolean; row?: MembershipWithAccount }> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const effectiveAdmins = await this.countEffectiveAdmins(scopeType, scopeId, {
        excludeMembershipId: id,
        tx,
      });
      if (effectiveAdmins === 0) {
        return { blocked: true };
      }
      const row = await tx.membership.update({
        where: { id },
        data: { role: 'MEMBER' },
        select: membershipWithAccountSelect,
      });
      return { blocked: false, row };
    });
  }
}
