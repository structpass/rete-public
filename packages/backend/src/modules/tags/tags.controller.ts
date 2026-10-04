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
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { FindTagsDto } from './dto/find-tags.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@rete/shared';

/**
 * タグマスタの REST（rete-files-0006）。全エンドポイントはログイン必須（AuthenticatedGuard）。
 * ファイルへの付与/外しは「ファイルの関心」のため files モジュール（PUT /files/files/:id/tags）が担う。
 */
@ApiTags('tags')
@Controller('tags')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'タグ一覧取得（name 昇順・既定はアーカイブ済を除外）' })
  async findAll(@Query() query: FindTagsDto, @CurrentUser('role') role: Role) {
    // 有効タグ一覧は認証済み全員（フィルタドロップダウン / タグ付与ピッカー）。アーカイブ済の閲覧
    // （includeArchived=true）はタグ管理画面専用のため ADMIN のみ許可する（fil-0094・hom-0086 と同型）。
    if (query.includeArchived === true && role !== Role.ADMIN) {
      throw new ForbiddenException('アーカイブ済タグの閲覧は管理者のみ可能です');
    }
    return this.tagsService.findAll(query);
  }

  // 書き込み系はスパム作成抑制のため全体既定より厳しめ throttle（files 書き込みと同方針）。
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'タグ作成（name + icon）' })
  async create(@Body() dto: CreateTagDto) {
    return this.tagsService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id')
  @ApiOperation({ summary: 'タグ更新（name / icon 部分更新）' })
  @ApiParam({ name: 'id', description: 'タグ ID (UUID)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTagDto) {
    return this.tagsService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete(':id')
  @ApiOperation({ summary: 'タグ削除（付与は連鎖削除）' })
  @ApiParam({ name: 'id', description: 'タグ ID (UUID)' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.tagsService.delete(id);
  }
}
