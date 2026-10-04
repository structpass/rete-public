import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { AnnouncementService } from './announcement.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { FindAnnouncementsDto } from './dto/find-announcements.dto';
import { ReorderAnnouncementsDto } from './dto/reorder-announcements.dto';
import { AttachAnnouncementDto } from './dto/attach-announcement.dto';
import { SetAnnouncementTagsDto } from './dto/set-announcement-tags.dto';
import { AnnouncementKindQueryDto } from './dto/announcement-kind.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Home 掲示板（通知）の REST。全エンドポイントはログイン必須（AuthenticatedGuard）。
 * 変更系（作成 / 編集 / 削除）は ADMIN のみ（@Roles(Role.ADMIN) + RolesGuard で enforce）。
 * 一覧 / 詳細は @Roles 未付与のため全認証ユーザーが閲覧できる（RolesGuard は素通し）。
 */
@ApiTags('announcements')
@Controller('announcements')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class AnnouncementController {
  constructor(private readonly service: AnnouncementService) {}

  @Get()
  @ApiOperation({ summary: '通知一覧（publishedAt 降順・ページング・閲覧者視点の未読フラグ込み）' })
  findAll(@Query() query: FindAnnouncementsDto, @CurrentUser('id') userId: string) {
    return this.service.findAll(query, userId);
  }

  // ':id' より前に宣言する（'unread-count' が :id（UUID）ルートに捕捉されないようルート順を優先）。
  @Get('unread-count')
  @ApiOperation({ summary: '自分の未読通知数（kind別・サイドバーバッジ用）' })
  unreadCount(@Query() query: AnnouncementKindQueryDto, @CurrentUser('id') userId: string) {
    return this.service.countUnread(userId, query.kind ?? 'board');
  }

  @Get(':id')
  @ApiOperation({ summary: '通知詳細（本文込み・開いた時点で既読化）' })
  @ApiParam({ name: 'id', description: '通知 ID (UUID)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.service.findOne(id, userId);
  }

  // 書き込み系はスパム作成抑制のため全体 throttle（30/60s）より厳しめ（chat 書き込みと同方針）。
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '通知の新規作成（ADMIN 限定）' })
  create(@CurrentUser('id') authorId: string, @Body() dto: CreateAnnouncementDto) {
    return this.service.create(authorId, dto);
  }

  // reorder は ':id' より前に宣言する（静的パス 'reorder' が :id（UUID）ルートに捕捉されないよう優先）。
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch('reorder')
  @ApiOperation({ summary: '通知の並び替え（ADMIN 限定・現存全件の id を新しい順序で指定）' })
  reorder(@CurrentUser('id') userId: string, @Body() dto: ReorderAnnouncementsDto) {
    return this.service.reorder(userId, dto);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({ summary: '通知の編集（ADMIN 限定・部分更新）' })
  @ApiParam({ name: 'id', description: '通知 ID (UUID)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id')
  @ApiOperation({ summary: '通知の削除（ADMIN 限定）' })
  @ApiParam({ name: 'id', description: '通知 ID (UUID)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  // タグ付与（rete-home-0043）。通知のタグ全置換。ADMIN 限定。
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Put(':id/tags')
  @ApiOperation({ summary: 'お知らせへのタグ付与（ADMIN 限定・全置換・空配列で全解除）' })
  @ApiParam({ name: 'id', description: '通知 ID (UUID)' })
  setTags(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetAnnouncementTagsDto) {
    return this.service.setTags(id, dto);
  }

  // 添付（H0022）。通知への添付/解除は ADMIN 限定（汎用 attachments エンドポイントを経由せず
  // ここで完結させ、非 ADMIN が通知へ添付する bypass を防ぐ）。一覧は通知詳細 GET に埋めて返すため別途設けない。
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '通知へファイルを添付（ADMIN 限定・既存ファイルの最新版を固定）' })
  @ApiParam({ name: 'id', description: '通知 ID (UUID)' })
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachAnnouncementDto,
    @CurrentUser('id') accountId: string,
  ) {
    return this.service.addAttachment(id, dto.fileId, accountId);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: '通知の添付を解除（ADMIN 限定・実体ファイルは削除しない）' })
  @ApiParam({ name: 'id', description: '通知 ID (UUID)' })
  @ApiParam({ name: 'attachmentId', description: '添付 ID (UUID)' })
  removeAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.service.removeAttachment(id, attachmentId);
  }
}
