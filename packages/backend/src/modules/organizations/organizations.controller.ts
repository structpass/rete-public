import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * 組織（CM-2 / ADR 0037）の REST。
 * 全エンドポイントはログイン必須（AuthenticatedGuard）。権限チェックはサービス層で実施。
 * 作成はシステム ADMIN 不要（任意認証ユーザーが作成でき、作成者が組織 ADMIN になる）。
 * update は組織 ADMIN のみ（service 内の membership チェックで担保）。
 */
@ApiTags('organizations')
@Controller('organizations')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '組織作成（任意認証ユーザー・作成者が自動的に ADMIN になる）' })
  create(@Body() dto: CreateOrganizationDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '自分が所属する組織一覧（archived 除外・sortOrder 昇順）' })
  findAll(@CurrentUser('id') userId: string) {
    return this.service.findAll(userId);
  }

  // --- テナント管理 ADMIN 専用エンドポイント（system Role=ADMIN・membership 非依存）---
  // 注意: 静的パス（admin）は ':id' パラメータより前に宣言すること（NestJS ルーティング順）。

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '全組織一覧（system ADMIN 専用・membership 非依存・includeArchived 対応）',
  })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'true=archived 含む全件（既定: archived 除外）',
  })
  findAllAdmin(
    @Query('includeArchived', new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ) {
    return this.service.findAllAdmin(includeArchived);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '組織管理更新（system ADMIN 専用・改名 / archive + 連鎖 cascade）' })
  @ApiParam({ name: 'id', description: '組織 ID (UUID)' })
  adminUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.adminUpdate(id, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '組織の物理削除（system ADMIN 専用・配下 PJ があれば 409 で拒否）',
  })
  @ApiParam({ name: 'id', description: '組織 ID (UUID)' })
  adminDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminDelete(id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({ summary: '組織更新（組織 ADMIN のみ・改名 / archive トグル）' })
  @ApiParam({ name: 'id', description: '組織 ID (UUID)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
}
