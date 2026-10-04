import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ok } from '../../common/dto';
import { buildArchiveUpdate } from '../../common/services/container.helper';
import { OrganizationsRepository } from './repositories/organizations.repository';
import { MembershipsRepository } from '../memberships/repositories/memberships.repository';
import { toOrganizationDto } from './organizations.mapper';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * 組織管理のアプリケーションサービス。検証 + オーケストレーションのみ担い、
 * DB アクセスは OrganizationsRepository 経由（§2）、Entity→DTO 変換は mapper（§1）。
 *
 * create は任意の認証ユーザーが実行可能（作成者が自動的に ADMIN になる）。
 * update は対象組織の ADMIN membership 保有者のみ（ADR 0037 §3）。
 * findAll は自分が membership を持つ組織のみ返す（可視＝membership 原則・ADR 0037 §3）。
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repo: OrganizationsRepository,
    private readonly membershipRepo: MembershipsRepository,
  ) {}

  /**
   * 組織を作成する。作成者の ORGANIZATION ADMIN membership を同一 tx で共創する（ADR 0037 §5）。
   * さもないと「可視＝membership」で作成者が自分の組織を即座に見られなくなる。
   */
  async create(dto: CreateOrganizationDto, userId: string) {
    const org = await this.repo.createWithMembership(dto.name, userId);
    return ok(toOrganizationDto(org));
  }

  /** 自分が membership を持つ組織一覧（archived 除外済み・sortOrder 昇順）。 */
  async findAll(userId: string) {
    const orgs = await this.repo.findVisibleForUser(userId);
    return ok(orgs.map(toOrganizationDto));
  }

  /**
   * 組織を部分更新する（改名 / archive トグル）。
   * - 対象組織不在 → NotFoundException
   * - 自分が ADMIN membership を持たない → ForbiddenException
   */
  async update(id: string, dto: UpdateOrganizationDto, userId: string) {
    const org = await this.repo.findById(id);
    if (!org) throw new NotFoundException('組織が見つかりません');

    const membership = await this.membershipRepo.findEffectiveMembership(
      userId,
      'ORGANIZATION',
      id,
    );
    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('この組織を編集する権限がありません');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.archived !== undefined) Object.assign(data, buildArchiveUpdate(dto.archived));

    // archive/restore は system ADMIN 経路と同じ transaction 内 cascade を通す。
    // name-only update は従来どおり単純 update のまま。
    const updated =
      dto.archived === undefined
        ? await this.repo.update(id, data)
        : await this.repo.adminUpdateWithCascade(id, data, dto.archived);
    return ok(toOrganizationDto(updated));
  }

  /**
   * 全組織一覧（membership 非依存・テナント管理 ADMIN 向け）。
   * system Role=ADMIN gating は呼び出し元コントローラの @Roles(Role.ADMIN) が担う。
   * includeArchived=true で archived 含む全件、既定は archived 除外。
   */
  async findAllAdmin(includeArchived?: boolean) {
    const orgs = await this.repo.findAllAdmin(includeArchived);
    return ok(orgs.map(toOrganizationDto));
  }

  /**
   * 組織を管理 ADMIN として部分更新する（改名 / archive トグル + 連鎖 cascade）。
   * - 対象組織不在 → NotFoundException
   * - membership チェックなし（system Role=ADMIN gate はコントローラ層が担う）
   * - archive 時は配下 Project と CHANNEL Space を同一 tx で連鎖 archive する
   * - 復元（archived=false）時は配下も連鎖復元する（MVP 単純版）
   */
  async adminUpdate(id: string, dto: UpdateOrganizationDto) {
    const org = await this.repo.findById(id);
    if (!org) throw new NotFoundException('組織が見つかりません');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.archived !== undefined) Object.assign(data, buildArchiveUpdate(dto.archived));

    const updated = await this.repo.adminUpdateWithCascade(id, data, dto.archived);
    return ok(toOrganizationDto(updated));
  }

  /**
   * 組織の物理削除（system ADMIN 専用・set-0162）。
   * 配下 PJ（archived 含む全物理行）があれば 409 で拒否（アーカイブを促す）。
   * 削除時は孤児 membership（scopeType=ORGANIZATION）を同一 tx で掃除する
   * （Membership.scopeId は FK なしのポリモーフィック参照のため）。
   */
  async adminDelete(id: string) {
    const org = await this.repo.findById(id);
    if (!org) throw new NotFoundException('組織が見つかりません');

    const deleted = await this.repo.deleteIfNoProjects(id);
    if (!deleted) {
      throw new ConflictException(
        '配下のプロジェクトが存在するため削除できません。アーカイブしてください',
      );
    }
    return ok({ id });
  }
}
