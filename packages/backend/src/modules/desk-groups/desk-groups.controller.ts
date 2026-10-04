import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DeskGroupsService } from './desk-groups.service';
import {
  CreateDeskGroupClassificationDto,
  CreateDeskGroupDto,
  MoveDeskGroupMemberDto,
  ReorderDeskGroupClassificationsDto,
  ReorderDeskGroupsDto,
  UpdateDeskGroupClassificationDto,
  UpdateDeskGroupDto,
} from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * 休眠中: frontend からの消費者は 0 件。Desk 個人タブの宛先グルーピング UI は撤去済みで、本コントローラは
 * 現役の契約ではない（app.module.ts 経由でルートは生きている・撤去しない判断は ADR 0079）。
 *
 * Desk 個人タブの宛先グルーピング（dsk-0304・dsk-0305）の REST。全操作はログイン必須のみ
 * （個人データのため role は問わず、セッションの accountId にスコープ＝FavoritesController と同方針）。
 *
 * ルート宣言順は静的パス（classifications / reorder / members）を :id より前に置く
 * （Category の reorder 前例と同じくルート衝突回避）。
 */
@ApiTags('desk-groups')
@Controller('desk-groups')
@UseGuards(AuthenticatedGuard)
export class DeskGroupsController {
  constructor(private readonly service: DeskGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'グループ分類＋グループ（所属宛先込み）の一括取得' })
  findTree(@CurrentUser('id') accountId: string) {
    return this.service.findTree(accountId);
  }

  // ---- グループ分類 ----

  @Post('classifications')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループ分類の作成' })
  createClassification(
    @CurrentUser('id') accountId: string,
    @Body() dto: CreateDeskGroupClassificationDto,
  ) {
    return this.service.createClassification(accountId, dto);
  }

  @Patch('classifications/reorder')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループ分類の並び替え（自分の全件の id を指定）' })
  reorderClassifications(
    @CurrentUser('id') accountId: string,
    @Body() dto: ReorderDeskGroupClassificationsDto,
  ) {
    return this.service.reorderClassifications(accountId, dto);
  }

  @Patch('classifications/:id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループ分類の名称変更' })
  updateClassification(
    @CurrentUser('id') accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeskGroupClassificationDto,
  ) {
    return this.service.updateClassification(accountId, id, dto);
  }

  @Delete('classifications/:id')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループ分類の削除（所属グループが残ると 409）' })
  removeClassification(
    @CurrentUser('id') accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeClassification(accountId, id);
  }

  // ---- グループ ----

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループの作成' })
  createGroup(@CurrentUser('id') accountId: string, @Body() dto: CreateDeskGroupDto) {
    return this.service.createGroup(accountId, dto);
  }

  @Patch('reorder')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループの並び替え（同一グループ分類バケット内）' })
  reorderGroups(@CurrentUser('id') accountId: string, @Body() dto: ReorderDeskGroupsDto) {
    return this.service.reorderGroups(accountId, dto);
  }

  @Patch('members/move')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: '宛先のグループ移動＋並び替え（グループから外す場合は groupId=null）' })
  moveMember(@CurrentUser('id') accountId: string, @Body() dto: MoveDeskGroupMemberDto) {
    return this.service.moveMember(accountId, dto);
  }

  @Patch(':id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループの部分更新（名称変更 / グループ分類間の移動）' })
  updateGroup(
    @CurrentUser('id') accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeskGroupDto,
  ) {
    return this.service.updateGroup(accountId, id, dto);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'グループの削除（所属宛先は自動的に未分類へ戻る）' })
  removeGroup(@CurrentUser('id') accountId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeGroup(accountId, id);
  }
}
