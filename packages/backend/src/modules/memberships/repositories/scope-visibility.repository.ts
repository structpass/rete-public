import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * membership / grant 共通の select 射影（scopeId と種別の scopeType のみ）。
 * 種別ごとに findMany を繰り返さず1回で取得し、Service 側で scopeType により振り分ける。
 */
const scopeSelect = { scopeId: true, scopeType: true } as const;
/** project/space 共通の「id のみ」select 射影。両テーブルとも主キー `id` を返す最小形。 */
const idOnlySelect = { id: true } as const;

/**
 * ScopeVisibilityService のデータアクセス層（§2 Repository 分離）。
 *
 * ADR 0002 の「Service 層は Repository 経由で DB に触る」原則に合わせるための専用 Repository。
 * 元は ScopeVisibilityService が PrismaService を直注入して 5 本のクエリを発行していたが、
 * 横断クエリ（複数モデル）でも「Repository を 1 本に集約する」形に統一する。
 * 戻り値は Prisma 行のまま（変換は Service 層が担う＝ADR 0002 §2 準拠）。
 */
@Injectable()
export class ScopeVisibilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 指定 account の direct membership を**全種別まとめて1回で**返す（scopeId と scopeType）。
   * 呼び出し側が scopeType で振り分ける（種別ごとの findMany を繰り返さない）。
   * Prisma の enum は4種別すべてを含むため、絞り込みは Service 側の振り分けで行う。
   */
  findMembershipScopes(
    accountId: string,
  ): Promise<Prisma.MembershipGetPayload<{ select: typeof scopeSelect }>[]> {
    return this.prisma.membership.findMany({
      where: { accountId },
      select: scopeSelect,
    });
  }

  /**
   * 指定 account が所属グループの grant 経由で持つ scopeId を**全種別まとめて**返す
   * （set-0164・加算 OR）。所属グループの取得は1回だけ行い、grant の取得も1回にまとめる
   * （従来は種別ごとに同一引数の userGroupMember.findMany を繰り返していた）。
   * 管理グループは物理削除のみ（set-0188・archive なし）。グループ削除で
   * UserGroupMember / UserGroupScopeGrant が onDelete: Cascade で連鎖消滅するため、
   * 戻り値は実在グループの grant だけになる（削除済みグループの grant は残らない）。
   * どの scopeType を可視に使うか（ORGANIZATION / PROJECT / CHANNEL のみ）は Service が決める。
   */
  async findGrantScopes(
    accountId: string,
  ): Promise<Prisma.UserGroupScopeGrantGetPayload<{ select: typeof scopeSelect }>[]> {
    const memberships = await this.prisma.userGroupMember.findMany({
      where: { accountId },
      select: { groupId: true },
    });
    if (memberships.length === 0) return [];
    return this.prisma.userGroupScopeGrant.findMany({
      where: { groupId: { in: memberships.map((m) => m.groupId) } },
      select: scopeSelect,
    });
  }

  /**
   * 指定 account が関わる個人スペース（PERSONAL_MEMO は owner、PERSONAL_DM は owner/peer 両者）を id のみで返す。
   */
  findPersonalSpaces(
    accountId: string,
  ): Promise<Prisma.SpaceGetPayload<{ select: typeof idOnlySelect }>[]> {
    return this.prisma.space.findMany({
      where: {
        OR: [
          { kind: 'PERSONAL_MEMO', ownerId: accountId },
          {
            kind: 'PERSONAL_DM',
            OR: [{ ownerId: accountId }, { peerAccountId: accountId }],
          },
        ],
      },
      select: idOnlySelect,
    });
  }

  /**
   * 指定 organization id 配列配下の非アーカイブ project を id のみで返す。
   * 空配列でも Prisma 呼び出しを行う（Service が呼び出し要否を判断する責務：org membership 0 件のときは Service が skip する契約）。
   */
  findActiveProjectsByOrgIds(
    orgIds: string[],
  ): Promise<Prisma.ProjectGetPayload<{ select: typeof idOnlySelect }>[]> {
    return this.prisma.project.findMany({
      where: { organizationId: { in: orgIds }, archivedAt: null },
      select: idOnlySelect,
    });
  }

  /**
   * 指定 group id 配列の GROUP スペース（archivedAt=null）だけを id で返す。
   * 空配列でも Prisma 呼び出しを行う（Service は常に呼ぶ契約）。
   */
  findGroupSpaces(
    groupScopeIds: string[],
  ): Promise<Prisma.SpaceGetPayload<{ select: typeof idOnlySelect }>[]> {
    return this.prisma.space.findMany({
      where: { kind: 'GROUP', id: { in: groupScopeIds }, archivedAt: null },
      select: idOnlySelect,
    });
  }

  /**
   * 指定 project id 配列配下の CHANNEL スペース（archivedAt=null）だけを id で返す。
   * 空配列でも Prisma 呼び出しを行う（Service は常に呼ぶ契約）。
   */
  findChannelSpacesByProjectIds(
    projectIds: string[],
  ): Promise<Prisma.SpaceGetPayload<{ select: typeof idOnlySelect }>[]> {
    return this.prisma.space.findMany({
      where: { kind: 'CHANNEL', projectId: { in: projectIds }, archivedAt: null },
      select: idOnlySelect,
    });
  }

  /** 直接 CHANNEL membership / grant で参照された非アーカイブチャネルを id で返す。 */
  findActiveChannelSpacesByIds(
    channelIds: string[],
  ): Promise<Prisma.SpaceGetPayload<{ select: typeof idOnlySelect }>[]> {
    return this.prisma.space.findMany({
      where: { kind: 'CHANNEL', id: { in: channelIds }, archivedAt: null },
      select: idOnlySelect,
    });
  }
}
