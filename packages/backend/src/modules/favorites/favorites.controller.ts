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
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ReorderFavoritesDto } from './dto/reorder-favorites.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * HOME サイドバーの横断お気に入り（HM-1）の REST。全エンドポイントはログイン必須（AuthenticatedGuard）。
 * お気に入りは個人データのため role ガードは付けず、全操作をセッションの accountId にスコープする
 * （@CurrentUser('id') で取得。クライアントが渡す任意の id は信用しない = IDOR 防止）。
 */
@ApiTags('favorites')
@Controller('favorites')
@UseGuards(AuthenticatedGuard)
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: '自分のお気に入り一覧（sortOrder 昇順）' })
  findAll(@CurrentUser('id') accountId: string) {
    return this.service.findAll(accountId);
  }

  // 追加はスパム抑制のため書き込み throttle（announcement と同方針）。
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'お気に入りの追加（自分のみ）' })
  add(@CurrentUser('id') accountId: string, @Body() dto: CreateFavoriteDto) {
    return this.service.add(accountId, dto);
  }

  // reorder は :id より前に宣言（'reorder' が UUID パラメータに食われないよう静的パスを優先）。
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch('reorder')
  @ApiOperation({ summary: 'お気に入りの並び替え（自分の全件の id を指定）' })
  reorder(@CurrentUser('id') accountId: string, @Body() dto: ReorderFavoritesDto) {
    return this.service.reorder(accountId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'お気に入りの削除（自分のみ）' })
  @ApiParam({ name: 'id', description: 'お気に入り ID (UUID)' })
  remove(@CurrentUser('id') accountId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(accountId, id);
  }
}
