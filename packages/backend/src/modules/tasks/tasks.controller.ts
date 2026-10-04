import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, FindTasksDto, FindTaskTreeDto } from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { CreateReactionDto } from '../chat/dto/create-reaction.dto';

// タスクは認証必須。認可境界は service 層で担保（Space 可視 404 / 所有者または ADMIN / 自己データ）。
@ApiTags('tasks')
@Controller('tasks')
@UseGuards(AuthenticatedGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // accountId を渡し、存在秘匿（可視 Space のみ一覧へ含める / 非可視は 404）を service 層で enforce する
  // （rete-hardening-0002・ScopeVisibilityService）。
  @Get()
  @ApiOperation({ summary: 'タスク一覧取得' })
  async findAll(@Query() query: FindTasksDto, @CurrentUser('id') accountId: string) {
    return this.tasksService.findAll(query, accountId);
  }

  // 注: 静的 'tree' は動的 ':id'（ParseIntPipe）より前に宣言する。
  // 後に置くと /tasks/tree が :id へマッチし ParseIntPipe が 400 を返す。
  @Get('tree')
  @ApiOperation({ summary: 'タスクツリー取得（カテゴリ別ネスト・任意 spaceId 絞り）' })
  async findTree(@Query() query: FindTaskTreeDto, @CurrentUser('id') accountId: string) {
    return this.tasksService.findTree(query.spaceId, accountId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'タスク詳細取得' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') accountId: string) {
    return this.tasksService.findOne(id, accountId);
  }

  // トップレベルエンティティ生成のため `POST /chat/themes`（10/min）と同率の作成レート制限を掛ける
  // （chat/themes には Throttle がある一方 tasks に無い非対称の是正・FL レビュー由来の負債返済）。
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'タスク作成' })
  async create(@Body() dto: CreateTaskDto, @CurrentUser('id') creatorId: string) {
    return this.tasksService.create(dto, creatorId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'タスク更新' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.update(id, dto, user);
  }

  @Patch(':id/move')
  @ApiOperation({
    summary: 'タスク移動（親変更 + カテゴリ変更 + 並び順を 1 操作で反映。サブツリーごと移動）',
  })
  @ApiParam({ name: 'id', description: '移動対象タスク ID（サブツリーのルート）' })
  async move(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.move(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'タスク削除' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.remove(id, user);
  }

  // 起点カード（タスク本体）へのリアクションをトグル（POST 一本・付与/解除は service が既存有無で判定・
  // dsk-0297）。投稿者本人限定ではなく可視な参加者なら誰でも押せる（taskComment 側と同方針・criteria）。
  // throttle 率は taskComment のリアクショントグルと同率。
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '起点カードへのリアクションをトグル' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async toggleReaction(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateReactionDto,
  ) {
    return this.tasksService.toggleReaction(id, authorId, dto);
  }
}
