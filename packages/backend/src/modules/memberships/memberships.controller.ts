import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipScopeType, Role } from '@rete/shared';
import { MembershipsService } from './memberships.service';
import { AddMembershipDto } from './dto/add-membership.dto';
import { UpdateMembershipRoleDto } from './dto/update-membership-role.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { clientIp, clientUserAgent } from '../../common/net/client-ip';
import type { AuthenticatedUser } from '../auth/auth.service';

/**
 * メンバーシップ管理（CM-2）REST。
 * 招待・一覧・削除の 3 操作。権限チェックは service 層（ADMIN / 任意 membership）。
 * 全エンドポイントを認証済みユーザー限定にし、スコープ内ロールは service 層で判定する。
 */
@ApiTags('memberships')
@Controller('memberships')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  @Get('admin/matrix')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '所属・権限マトリクス一括取得（システム ADMIN 専用）' })
  findPermissionMatrix() {
    return this.service.findPermissionMatrix();
  }

  // システム ADMIN バイパス招待（全スコープへ招待可）の濫用を抑えるため、updateRole と同条件の Throttle を付与。
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @ApiOperation({
    summary: 'メンバーを指定スコープへ招待（スコープ ADMIN またはシステム ADMIN・冪等 upsert）',
  })
  add(
    @Body() dto: AddMembershipDto,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    // アクセス元は controller で取り出して渡す（service に Request を持ち込まない・rete-members-0001）。
    return this.service.add(dto, requester, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });
  }

  @Get()
  @ApiOperation({ summary: 'スコープのメンバー一覧（当該スコープの membership 保有者のみ）' })
  @ApiQuery({
    name: 'scopeType',
    description: 'スコープ種別（ORGANIZATION / PROJECT / CHANNEL / GROUP）',
  })
  @ApiQuery({ name: 'scopeId', description: 'スコープ対象 ID（UUID）' })
  findByScope(
    // 不正 enum / 非 UUID は ParseEnumPipe / ParseUUIDPipe が 400 に正規化する。
    // 付与前は生 string が service→Prisma へ流れ PrismaClientValidationError → 500+スタック露出だった（rete-common-0014）。
    @Query('scopeType', new ParseEnumPipe(MembershipScopeType)) scopeType: MembershipScopeType,
    @Query('scopeId', ParseUUIDPipe) scopeId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.service.findByScope(scopeType, scopeId, requesterId);
  }

  // 追加（POST）・役割変更（PATCH）と同一の Throttle を削除（DELETE）にも付与。連打制限の対称性を満たす（dsk-0329 項目 1）。
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'メンバーシップを削除（スコープ ADMIN またはシステム ADMIN）',
  })
  @ApiParam({ name: 'id', description: 'メンバーシップ ID (UUID)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.service.remove(id, requester, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({
    summary: 'メンバーシップ ロール変更（スコープ ADMIN またはシステム ADMIN・ADMIN/MEMBER）',
  })
  @ApiParam({ name: 'id', description: 'メンバーシップ ID (UUID)' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMembershipRoleDto,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.service.updateRole(id, dto.role, requester, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });
  }
}
