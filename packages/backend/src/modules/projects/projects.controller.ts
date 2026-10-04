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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * プロジェクト（CM-2）の REST。全エンドポイントはログイン必須。
 * 作成は組織 ADMIN のみ（service 内チェック）。更新はプロジェクト ADMIN のみ。
 */
@ApiTags('projects')
@Controller('projects')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'プロジェクト作成（組織 ADMIN のみ）' })
  create(@Body() dto: CreateProjectDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '自分が可視な組織配下のプロジェクト一覧' })
  @ApiQuery({ name: 'organizationId', required: false, description: '組織 ID で絞り込み' })
  findAll(
    @Query('organizationId', new ParseUUIDPipe({ optional: true }))
    organizationId: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.findAll(userId, organizationId);
  }

  // --- テナント管理 ADMIN 専用エンドポイント（system Role=ADMIN・membership 非依存）---
  // 注意: 静的パス（admin）は ':id' パラメータより前に宣言すること（NestJS ルーティング順）。

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '全プロジェクト一覧（system ADMIN 専用・membership 非依存・includeArchived 対応）',
  })
  @ApiQuery({ name: 'organizationId', required: false, description: '組織 ID で絞り込み（UUID）' })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'true=archived 含む全件（既定: archived 除外）',
  })
  findAllAdmin(
    @Query('organizationId', new ParseUUIDPipe({ optional: true }))
    organizationId: string | undefined,
    @Query('includeArchived', new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ) {
    return this.service.findAllAdmin(organizationId, includeArchived);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'プロジェクト作成（system ADMIN 専用・membership 非依存・set-0162 admin 経路）',
  })
  createAdmin(@Body() dto: CreateProjectDto) {
    return this.service.createAdmin(dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'プロジェクト管理更新（system ADMIN 専用・改名 / archive + 連鎖 cascade）',
  })
  @ApiParam({ name: 'id', description: 'プロジェクト ID (UUID)' })
  adminUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) {
    return this.service.adminUpdate(id, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'プロジェクトの物理削除（system ADMIN 専用・配下チャネルがあれば 409 で拒否）',
  })
  @ApiParam({ name: 'id', description: 'プロジェクト ID (UUID)' })
  adminDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminDelete(id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({ summary: 'プロジェクト更新（プロジェクト ADMIN のみ・改名 / archive トグル）' })
  @ApiParam({ name: 'id', description: 'プロジェクト ID (UUID)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
}
