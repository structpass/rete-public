import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { AnnouncementTagsService } from './announcement-tags.service';
import { CreateAnnouncementTagDto } from './dto/create-announcement-tag.dto';
import { UpdateAnnouncementTagDto } from './dto/update-announcement-tag.dto';
import { FindAnnouncementTagsDto } from './dto/find-announcement-tags.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * お知らせ専用タグマスタの REST（rete-home-0043）。
 * 一覧（GET）はログイン済みユーザー全員可。作成 / 更新 / 削除は ADMIN のみ（@Roles + RolesGuard）。
 * File タグマスタ（GET /tags）とは独立した別系統マスタ。
 */
@ApiTags('announcement-tags')
@Controller('announcement-tags')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class AnnouncementTagsController {
  constructor(private readonly service: AnnouncementTagsService) {}

  @Get()
  @ApiOperation({ summary: 'お知らせタグ一覧（kind でスコープ・name 昇順）' })
  async findAll(@Query() query: FindAnnouncementTagsDto, @CurrentUser('role') role: Role) {
    // 有効タグ一覧は認証済み全員（フィルタバー / タグ付与ピッカー）。アーカイブ済の閲覧
    // （includeArchived=true）はタグ管理画面専用のため ADMIN のみ許可する（hom-0086 項目3）。
    if (query.includeArchived === true && role !== Role.ADMIN) {
      throw new ForbiddenException('アーカイブ済タグの閲覧は管理者のみ可能です');
    }
    return this.service.findAll(query);
  }

  // 書き込み系はスパム作成抑制のため throttle を厳しめに設定（tags.controller と同方針）。
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'お知らせタグ作成（ADMIN 限定・name + icon + color）' })
  async create(@Body() dto: CreateAnnouncementTagDto) {
    return this.service.create(dto);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({ summary: 'お知らせタグ更新（ADMIN 限定・部分更新）' })
  @ApiParam({ name: 'id', description: 'お知らせタグ ID (UUID)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementTagDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id')
  @ApiOperation({ summary: 'お知らせタグ削除（ADMIN 限定・付与は連鎖削除）' })
  @ApiParam({ name: 'id', description: 'お知らせタグ ID (UUID)' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(id);
  }
}
