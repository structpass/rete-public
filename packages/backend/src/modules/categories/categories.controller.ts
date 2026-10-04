import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  FindCategoriesDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * 分類マスタの REST（rete-desk-0140 で更新 / アーカイブ / 削除を追加）。ログイン必須のみで
 * ロール制限なし（チケットの「チャネル管理者」制限はチャネル概念未実装のため縮退・将来拡張）。
 */
@ApiTags('categories')
@Controller('categories')
@UseGuards(AuthenticatedGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // GET は読み取り専用のため @Throttle を付けず global ThrottlerGuard（30req/60s）に委ねる
  // （書き込み系 POST/PATCH/DELETE のみ専用枠で絞る方針）。
  @Get()
  @ApiOperation({ summary: '機能領域分類一覧取得（既定はアーカイブ済を除外）' })
  async findAll(@Query() query: FindCategoriesDto, @CurrentUser('id') accountId: string) {
    return this.categoriesService.findAll(query.spaceId, accountId, query.includeArchived ?? false);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '機能領域分類作成' })
  async create(@Body() dto: CreateCategoryDto, @CurrentUser('id') accountId: string) {
    return this.categoriesService.create(dto, accountId);
  }

  // ルート衝突回避: 静的 'reorder' は :id（ParseIntPipe）より前に宣言する。
  // 後ろに置くと /categories/reorder が :id にマッチし ParseIntPipe が 400 を返す。
  @Patch('reorder')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '機能領域分類の並び替え（当該チャネルの全分類を表示順で一括採番）' })
  async reorder(@Body() dto: ReorderCategoriesDto, @CurrentUser('id') accountId: string) {
    return this.categoriesService.reorder(dto.spaceId, dto.orderedIds, accountId);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '機能領域分類の部分更新（名称 / 表示順 / アーカイブ切替）' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('id') accountId: string,
  ) {
    return this.categoriesService.update(id, dto, accountId);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: '機能領域分類の削除（紐づくタスクがあると 409・アーカイブを案内）' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') accountId: string) {
    return this.categoriesService.remove(id, accountId);
  }
}
