import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TaskCommentsService } from './task-comments.service';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from './dto/update-task-comment.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { CreateReactionDto } from '../chat/dto/create-reaction.dto';

// タスクコメントはタスクと同じ認可境界（認証必須 / H4）。
// 可視性（Space スコープ）は service 層で親タスクに合わせて enforce する（ScopeVisibilityService）。
// ルートは /tasks/:id/comments。tasks.controller の `:id` は単一セグメントのため衝突しない。
@ApiTags('tasks')
@Controller('tasks')
@UseGuards(AuthenticatedGuard)
export class TaskCommentsController {
  constructor(private readonly service: TaskCommentsService) {}

  // 読み取りはグローバル ThrottlerModule（既定 30/min・ThrottlerGuard が APP_GUARD で全 route 適用）で
  // burst を抑制済み。書き込み系のような個別 @Throttle は不要（dsk-0260 で確認）。
  @Get(':id/comments')
  @ApiOperation({ summary: 'タスクコメント一覧取得（createdAt 昇順）' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async findComments(
    @Param('id', ParseIntPipe) taskId: number,
    @CurrentUser('id') accountId: string,
  ) {
    return this.service.list(taskId, accountId);
  }

  // 書き込み系はチャット発話（20/min）と同率のレート制限でスパム投稿を抑制する。
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'タスクコメント投稿' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  async postComment(
    @Param('id', ParseIntPipe) taskId: number,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateTaskCommentDto,
  ) {
    return this.service.create(taskId, authorId, dto);
  }

  // 自分のコメントの本文編集（dsk-0241）。編集は投稿者本人のみ（service が 403 で IDOR を塞ぐ）。body は
  // service で sanitize。コメントは commentId（UUID）で一意なため認可は commentId 経由で解決する（taskId は
  // ルートの所属表現で、可視性は親タスク経由で再解決する）。作成系と同率の throttle。
  // H4: ADMIN は所有者に関わらず編集可（assertOwnerOrAdmin）。
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch(':id/comments/:commentId')
  @ApiOperation({ summary: 'タスクコメント編集（投稿者本人のみ）' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  @ApiParam({ name: 'commentId', description: 'コメントID' })
  async updateComment(
    // taskId は ParseIntPipe で非整数を 400 で弾き（dsk-0260）、service で親子 cross-validate に使う。
    @Param('id', ParseIntPipe) taskId: number,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTaskCommentDto,
  ) {
    return this.service.update(commentId, user, dto, taskId);
  }

  // 自分のコメントの削除（dsk-0241）。削除は投稿者本人のみ（service が 403）。物理削除のため作成系より
  // 厳しめ throttle でスパム削除を抑制する（chat テーマ削除と同率）。
  // H4: ADMIN は所有者に関わらず削除可（assertOwnerOrAdmin）。
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'タスクコメント削除（投稿者本人のみ）' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  @ApiParam({ name: 'commentId', description: 'コメントID' })
  async deleteComment(
    // taskId は ParseIntPipe で非整数を 400 で弾き（dsk-0260）、service で親子 cross-validate に使う。
    @Param('id', ParseIntPipe) taskId: number,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(commentId, user, taskId);
  }

  // リアクションのトグル（POST 一本・付与/解除は service が既存有無で判定・dsk-0297）。投稿者本人限定では
  // なく可視な参加者なら誰でも押せる（criteria）。throttle 率は chat 側のリアクショントグルと同率。
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/comments/:commentId/reactions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'タスクコメントへのリアクションをトグル' })
  @ApiParam({ name: 'id', description: 'タスクID' })
  @ApiParam({ name: 'commentId', description: 'コメントID' })
  async toggleReaction(
    @Param('id', ParseIntPipe) taskId: number,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateReactionDto,
  ) {
    return this.service.toggleReaction(taskId, commentId, authorId, dto);
  }
}
