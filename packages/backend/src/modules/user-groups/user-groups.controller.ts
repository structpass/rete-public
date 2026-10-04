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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MembershipScopeType, Role } from '@rete/shared';
import { UserGroupsService } from './user-groups.service';
import {
  AddUserGroupMemberDto,
  AddUserGroupScopeGrantDto,
  CreateUserGroupDto,
  UpdateUserGroupDto,
} from './dto/user-groups.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { clientIp, clientUserAgent } from '../../common/net/client-ip';
import type { AuthenticatedUser } from '../auth/auth.service';
import { ok } from '../../common/dto/response.dto';

/**
 * ユーザーグループ管理（set-0164）REST。
 * グループ CRUD / メンバー管理 / 組織・PJ・チャネルへの grant 付与・剥奪。
 * 全エンドポイントはシステム ADMIN（Account.role=ADMIN）専用（@Roles(Role.ADMIN)）。
 * 監査は横断 interceptor が mutation を自動記録 + service が明示行を記録する。
 */
@ApiTags('user-groups')
@Controller('user-groups')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class UserGroupsController {
  constructor(private readonly service: UserGroupsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ユーザーグループ一覧（システム ADMIN 専用）' })
  async findAll() {
    return ok(await this.service.findAll());
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ユーザーグループ作成（システム ADMIN 専用）' })
  async create(
    @Body() dto: CreateUserGroupDto,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return ok(
      await this.service.create(dto, requester, {
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
      }),
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'ユーザーグループ更新（改名・システム ADMIN 専用）' })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserGroupDto,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return ok(
      await this.service.update(id, dto, requester, {
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
      }),
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'ユーザーグループ削除（システム ADMIN 専用・所属設定とメンバーも同一 tx で削除）',
  })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  removeGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.service.removeGroup(id, requester, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });
  }

  @Get(':id/members')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'グループのメンバー一覧（システム ADMIN 専用）' })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  async findMembers(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.service.findMembers(id));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/members')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'グループへメンバー追加（システム ADMIN 専用・冪等）' })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  async addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddUserGroupMemberDto,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return ok(
      await this.service.addMember(id, dto, requester, {
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
      }),
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id/members/:accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'グループメンバー削除（システム ADMIN 専用）' })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  @ApiParam({ name: 'accountId', description: '削除するアカウント ID (UUID)' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.service.removeMember(id, accountId, requester, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });
  }

  @Get(':id/grants')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'グループの grant 一覧（システム ADMIN 専用）' })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  async findGrants(@Param('id', ParseUUIDPipe) id: string) {
    return ok(await this.service.findGrants(id));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/grants')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'グループ grant 付与（システム ADMIN 専用・ORGANIZATION/PROJECT/CHANNEL・冪等）',
  })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  async addGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddUserGroupScopeGrantDto,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return ok(
      await this.service.addGrant(id, dto, requester, {
        ipAddress: clientIp(req),
        userAgent: clientUserAgent(req),
      }),
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id/grants/:scopeType/:scopeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'グループ grant 剥奪（システム ADMIN 専用）' })
  @ApiParam({ name: 'id', description: 'ユーザーグループ ID (UUID)' })
  @ApiParam({ name: 'scopeType', enum: MembershipScopeType, description: 'grant スコープ種別' })
  @ApiParam({ name: 'scopeId', description: 'スコープ対象 ID (UUID)' })
  removeGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scopeType', new ParseEnumPipe(MembershipScopeType)) scopeType: MembershipScopeType,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.service.removeGrant(id, scopeType, scopeId, requester, {
      ipAddress: clientIp(req),
      userAgent: clientUserAgent(req),
    });
  }
}
