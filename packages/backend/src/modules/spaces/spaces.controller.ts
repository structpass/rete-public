import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, SpaceKind } from '@rete/shared';
import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * 器（Space / CM-2）の REST。全エンドポイントはログイン必須。
 * 権限チェック（CHANNEL 作成=PROJECT ADMIN / GROUP ADMIN check）はサービス層で実施。
 */
@ApiTags('spaces')
@Controller('spaces')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class SpacesController {
  constructor(private readonly service: SpacesService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '器作成（kind によって権限・必須フィールドが異なる）' })
  create(@Body() dto: CreateSpaceDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '器一覧（?kind&?projectId で絞り込み）' })
  @ApiQuery({ name: 'kind', required: false, enum: SpaceKind })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'CHANNEL のみ有効: true=archived 含む（既定: archived 除外）',
  })
  findAll(
    @Query('kind', new ParseEnumPipe(SpaceKind, { optional: true }))
    kind: SpaceKind | undefined,
    @Query('projectId', new ParseUUIDPipe({ optional: true })) projectId: string | undefined,
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived: boolean | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    // userRole は dsk-0354 の GROUP canManageMembers（システム ADMIN バイパス）に使う。
    return this.service.findAll(userId, kind, projectId, userRole, includeArchived);
  }

  // --- テナント管理 ADMIN 専用エンドポイント（system Role=ADMIN・membership 非依存・dsk-0319）---
  // 注意: 静的パス（admin）は ':id' パラメータより前に宣言すること（NestJS ルーティング順）。

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      '全 GROUP / CHANNEL 一覧（system ADMIN 専用・membership 非依存・includeArchived 対応）',
  })
  @ApiQuery({ name: 'kind', required: true, enum: SpaceKind, description: 'GROUP or CHANNEL' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: 'kind=CHANNEL 時必須（所属プロジェクト ID）',
  })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'true=archived 含む全件（既定: archived 除外）',
  })
  findAllAdmin(
    @Query('kind', new ParseEnumPipe(SpaceKind)) kind: SpaceKind,
    @Query('projectId', new ParseUUIDPipe({ optional: true })) projectId: string | undefined,
    @Query('includeArchived', new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ) {
    return this.service.findAllAdmin(kind, projectId, includeArchived);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '器作成（system ADMIN 専用・kind=CHANNEL のみ・membership 非依存）' })
  createAdmin(@Body() dto: CreateSpaceDto) {
    return this.service.createAdmin(dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '器更新（system ADMIN 専用・CHANNEL/GROUP・改名 / archive）' })
  @ApiParam({ name: 'id', description: 'Space ID (UUID)' })
  adminUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSpaceDto) {
    return this.service.adminUpdate(id, dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '器の物理削除（system ADMIN 専用・kind=CHANNEL のみ・紐づきがあれば 409）',
  })
  @ApiParam({ name: 'id', description: 'Space ID (UUID)' })
  adminDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminDelete(id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({ summary: '器更新（CHANNEL/GROUP のみ・改名 / archive トグル）' })
  @ApiParam({ name: 'id', description: 'Space ID (UUID)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpaceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }
}
