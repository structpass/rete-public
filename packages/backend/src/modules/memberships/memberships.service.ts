import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipScopeType, Role } from '@rete/shared';
import type { PermissionMatrixDto } from '@rete/shared';
import { ok } from '../../common/dto';
import { MembershipsRepository } from './repositories/memberships.repository';
import { toMembershipDto } from './memberships.mapper';
import { AddMembershipDto } from './dto/add-membership.dto';
import { AuditRecorderService, type AuditClientInfo } from '../audit-logs/audit-recorder.service';
import { AUDIT_RETE_SYSTEM_NAME } from '../audit-logs/audit-logs.constants';
import type { AuthenticatedUser } from '../auth/auth.service';

function buildPermissionMatrixScopes(
  rows: Awaited<ReturnType<MembershipsRepository['findPermissionMatrix']>>,
): PermissionMatrixDto['scopes'] {
  const projectsByOrg = new Map<string, typeof rows.projects>();
  const channelsByProject = new Map<string, typeof rows.channels>();
  for (const project of rows.projects) {
    const projects = projectsByOrg.get(project.organizationId) ?? [];
    projects.push(project);
    projectsByOrg.set(project.organizationId, projects);
  }
  for (const channel of rows.channels) {
    if (!channel.projectId) continue;
    const channels = channelsByProject.get(channel.projectId) ?? [];
    channels.push(channel);
    channelsByProject.set(channel.projectId, channels);
  }

  const scopes: PermissionMatrixDto['scopes'] = [];
  for (const organization of rows.organizations) {
    scopes.push({
      id: organization.id,
      scopeType: MembershipScopeType.ORGANIZATION,
      name: organization.name,
      parentId: null,
      depth: 0,
    });
    for (const project of projectsByOrg.get(organization.id) ?? []) {
      scopes.push({
        id: project.id,
        scopeType: MembershipScopeType.PROJECT,
        name: project.name,
        parentId: organization.id,
        depth: 1,
      });
      for (const channel of channelsByProject.get(project.id) ?? []) {
        scopes.push({
          id: channel.id,
          scopeType: MembershipScopeType.CHANNEL,
          name: channel.name,
          parentId: project.id,
          depth: 2,
        });
      }
    }
  }
  return scopes;
}

/**
 * メンバーシップ管理のアプリケーションサービス（§2 Repository 経由・§1 mapper 返却）。
 * 権限モデル（cmn-0047 / dsk-0359）:
 *   - 招待（add）/ 削除（remove）/ ロール変更（updateRole）: 対象スコープの ADMIN、
 *     **またはシステム ADMIN（Account.role=ADMIN）**。
 *     システム ADMIN は scope-ADMIN でなくてもバイパスでき、バイパス時は監査ログを残す。
 *   - 一覧（findByScope）: 対象スコープの任意 membership 保有者
 *   - 削除 / 降格: **スコープ内の最後の 1 人の ADMIN は降格・削除できない**
 *     （全消失ガード・テナント/Space 共通の件数ベース不変条件。バイパス経路でも維持）。
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly repo: MembershipsRepository,
    private readonly audit: AuditRecorderService,
  ) {}

  /** システム ADMIN 向け所属マトリクス read model。認可は controller の @Roles で強制する。 */
  async findPermissionMatrix() {
    const rows = await this.repo.findPermissionMatrix();

    const data: PermissionMatrixDto = {
      scopes: buildPermissionMatrixScopes(rows),
      groups: rows.groups.map((group) => ({
        id: group.id,
        name: group.name,
        sortOrder: group.sortOrder,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        memberCount: group._count.members,
      })),
      grants: rows.grants.map((grant) => ({
        id: grant.id,
        groupId: grant.groupId,
        scopeType: grant.scopeType as MembershipScopeType,
        scopeId: grant.scopeId,
        role: grant.role as 'ADMIN' | 'MEMBER',
        createdAt: grant.createdAt.toISOString(),
      })),
    };
    return ok(data);
  }

  /**
   * メンバーを指定スコープへ招待（または role を更新）する。
   * - 対象スコープの ADMIN は従来どおり招待可。
   * - システム ADMIN（Account.role=ADMIN）は scope-ADMIN でなくてもバイパス招待でき、
   *   バイパス時（scope-ADMIN を持たない時）は監査ログ（actionType=admin）を残す（cmn-0047・案B）。
   * - どちらでもなければ ForbiddenException。
   */
  async add(dto: AddMembershipDto, requester: AuthenticatedUser, client: AuditClientInfo = {}) {
    const requesterMembership = await this.repo.findEffectiveMembership(
      requester.id,
      dto.scopeType,
      dto.scopeId,
    );
    const isScopeAdmin = requesterMembership?.role === 'ADMIN';
    const isSystemAdmin = requester.role === Role.ADMIN;
    if (!isScopeAdmin && !isSystemAdmin) {
      throw new ForbiddenException('このスコープへ招待する権限がありません（ADMIN のみ）');
    }

    await this.assertScopeActive(dto.scopeType, dto.scopeId);

    const { row, blocked } = await this.repo.upsert({
      accountId: dto.accountId,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId,
      role: dto.role,
    });
    // 全消失ガード: ADMIN→MEMBER の降格でこのスコープ唯一の実効 ADMIN 源になる場合は弾く（criteria 3）。
    // upsert の role 上書き経路（add 経由の降格）も deleteLastAdminGuarded / demoteLastAdminGuarded と同じガード対象。
    if (blocked || !row) {
      throw new BadRequestException(
        'このスコープ唯一の管理者（ADMIN）は降格できません（管理者が最低 1 人必要です）',
      );
    }

    // システム ADMIN が scope-ADMIN を持たないまま招待した＝権限バイパス。監査ログを残す。
    if (!isScopeAdmin && isSystemAdmin) {
      await this.audit.record({
        actorAccountId: requester.id,
        actorName: requester.name,
        actorEmail: requester.email,
        systemName: AUDIT_RETE_SYSTEM_NAME,
        actionType: 'admin',
        feature: 'memberships',
        summary: `システム管理者がスコープをバイパスして招待（${dto.scopeType}/${dto.scopeId} へ ${dto.accountId} を ${dto.role}）`,
        // アクセス元（IP・UA）も同じ 1 行へ載せ、横断 interceptor 行と時刻で突き合わせなくても
        // 「誰が・いつ・どこから」まで読めるようにする（rete-members-0001）。
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        details: {
          scopeType: dto.scopeType,
          scopeId: dto.scopeId,
          targetAccountId: dto.accountId,
          grantedRole: dto.role,
        },
      });
    }

    return ok(toMembershipDto(row));
  }

  /**
   * 指定スコープのメンバー一覧を返す（account 名込み・createdAt 昇順）。
   * requester が対象スコープに membership を持たなければ ForbiddenException。
   */
  async findByScope(scopeType: string, scopeId: string, requesterId: string) {
    const requesterMembership = await this.repo.findEffectiveMembership(
      requesterId,
      scopeType,
      scopeId,
    );
    if (!requesterMembership) {
      throw new ForbiddenException('このスコープのメンバー一覧を閲覧する権限がありません');
    }

    const rows = await this.repo.findByScope(scopeType, scopeId);
    return ok(rows.map(toMembershipDto));
  }

  /**
   * 指定 membership を削除する。
   * - membership 不在 → NotFoundException
   * - requester が対象スコープの ADMIN、またはシステム ADMIN でなければ ForbiddenException
   * - システム ADMIN が scope-ADMIN を持たないまま削除した＝権限バイパス。監査ログを残す（dsk-0359）
   * - 全消失ガードはバイパス経路でも維持
   */
  async remove(id: string, requester: AuthenticatedUser, client: AuditClientInfo = {}) {
    const membership = await this.repo.findById(id);
    if (!membership) {
      throw new NotFoundException('メンバーシップが見つかりません');
    }

    const requesterMembership = await this.repo.findEffectiveMembership(
      requester.id,
      membership.scopeType,
      membership.scopeId,
    );
    const isScopeAdmin = requesterMembership?.role === 'ADMIN';
    const isSystemAdmin = requester.role === Role.ADMIN;
    if (!isScopeAdmin && !isSystemAdmin) {
      throw new ForbiddenException('このメンバーシップを削除する権限がありません（ADMIN のみ）');
    }

    // 全消失ガード: 対象が ADMIN なら count→delete を原子化し、最後の 1 人なら削除を弾く（TOCTOU 安全）。
    // MEMBER の削除は管理者数に影響しないため通常 delete。
    if (membership.role === 'ADMIN') {
      const { blocked } = await this.repo.deleteLastAdminGuarded(
        id,
        membership.scopeType,
        membership.scopeId,
      );
      if (blocked) {
        throw new BadRequestException(
          'このスコープ唯一の管理者（ADMIN）は削除できません（管理者が最低 1 人必要です）',
        );
      }
    } else {
      await this.repo.delete(id);
    }

    // システム ADMIN が scope-ADMIN を持たないまま削除した＝権限バイパス。監査ログを残す。
    if (!isScopeAdmin && isSystemAdmin) {
      await this.audit.record({
        actorAccountId: requester.id,
        actorName: requester.name,
        actorEmail: requester.email,
        systemName: AUDIT_RETE_SYSTEM_NAME,
        actionType: 'admin',
        feature: 'memberships',
        summary: `システム管理者がスコープをバイパスして削除（${membership.scopeType}/${membership.scopeId} の membership ${id}）`,
        // アクセス元（IP・UA）を同じ行へ（rete-members-0001）。
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        details: {
          scopeType: membership.scopeType,
          scopeId: membership.scopeId,
          membershipId: id,
          targetAccountId: membership.accountId,
        },
      });
    }
  }

  /**
   * 指定 membership のロールを変更する（ADMIN/MEMBER）。
   * - membership 不在 → NotFoundException
   * - requester が対象スコープの ADMIN、またはシステム ADMIN でなければ ForbiddenException
   * - システム ADMIN が scope-ADMIN を持たないまま変更した＝権限バイパス。監査ログを残す（dsk-0359）
   * - 全消失ガードはバイパス経路でも維持
   */
  async updateRole(
    id: string,
    role: 'ADMIN' | 'MEMBER',
    requester: AuthenticatedUser,
    client: AuditClientInfo = {},
  ) {
    const membership = await this.repo.findById(id);
    if (!membership) {
      throw new NotFoundException('メンバーシップが見つかりません');
    }

    const requesterMembership = await this.repo.findEffectiveMembership(
      requester.id,
      membership.scopeType,
      membership.scopeId,
    );
    const isScopeAdmin = requesterMembership?.role === 'ADMIN';
    const isSystemAdmin = requester.role === Role.ADMIN;
    if (!isScopeAdmin && !isSystemAdmin) {
      throw new ForbiddenException('このメンバーシップを変更する権限がありません（ADMIN のみ）');
    }

    // 全消失ガード: ADMIN→MEMBER 降格は count→update を原子化し、最後の 1 人なら弾く（TOCTOU 安全）。
    // それ以外（昇格 / 同ロール）は管理者数に影響しないため通常 update。
    let resultDto;
    if (role === 'MEMBER' && membership.role === 'ADMIN') {
      const result = await this.repo.demoteLastAdminGuarded(
        id,
        membership.scopeType,
        membership.scopeId,
      );
      if (result.blocked) {
        throw new BadRequestException(
          'このスコープ唯一の管理者（ADMIN）は降格できません（管理者が最低 1 人必要です）',
        );
      }
      resultDto = ok(toMembershipDto(result.row!));
    } else {
      const updated = await this.repo.update(id, { role });
      resultDto = ok(toMembershipDto(updated));
    }

    // システム ADMIN が scope-ADMIN を持たないまま変更した＝権限バイパス。監査ログを残す。
    if (!isScopeAdmin && isSystemAdmin) {
      await this.audit.record({
        actorAccountId: requester.id,
        actorName: requester.name,
        actorEmail: requester.email,
        systemName: AUDIT_RETE_SYSTEM_NAME,
        actionType: 'admin',
        feature: 'memberships',
        summary: `システム管理者がスコープをバイパスしてロール変更（${membership.scopeType}/${membership.scopeId} の membership ${id} を ${role}）`,
        // アクセス元（IP・UA）を同じ行へ（rete-members-0001）。
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
        details: {
          scopeType: membership.scopeType,
          scopeId: membership.scopeId,
          membershipId: id,
          targetAccountId: membership.accountId,
          newRole: role,
        },
      });
    }

    return resultDto;
  }

  /** scopeType と scopeId の実在・非アーカイブ・Space kind 整合を write 前に強制する。 */
  private async assertScopeActive(scopeType: MembershipScopeType, scopeId: string): Promise<void> {
    const scope = await this.repo.findScopeTarget(scopeType, scopeId);
    if (!scope) throw new NotFoundException('所属先スコープが見つかりません');
    if (scope.archivedAt) {
      throw new BadRequestException('アーカイブ済みのスコープへメンバーシップを設定できません');
    }
    if (scopeType === MembershipScopeType.CHANNEL && scope.kind !== 'CHANNEL') {
      throw new BadRequestException('CHANNEL scopeId にはチャネルを指定してください');
    }
    if (scopeType === MembershipScopeType.GROUP && scope.kind !== 'GROUP') {
      throw new BadRequestException('GROUP scopeId にはチャットグループを指定してください');
    }
  }
}
