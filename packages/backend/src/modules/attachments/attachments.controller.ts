import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto, ListAttachmentsQueryDto } from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';

/**
 * Desk 添付の REST（FL-3）。全エンドポイントはログイン必須（AuthenticatedGuard）。
 * 可視性（Space スコープ）は service 層で enforce する（ScopeVisibilityService）。
 * 添付先は file タブ管理のため feature='file' で統括する。
 */
@ApiTags('attachments')
@Controller('attachments')
@UseGuards(AuthenticatedGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // 書き込み系はスパム抑制のため厳しめ throttle（files の書き込みと同方針）。
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ファイル添付の作成（タスク/チャット発話へ・添付時点の版を固定）' })
  create(@Body() dto: CreateAttachmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attachmentsService.createAttachment(dto, user);
  }

  // 読み取りは緩めだが明示 throttle で targetId（連番タスク id）総当りスキャンによる存在列挙を抑える。
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  @ApiOperation({ summary: '添付一覧取得（対象＝タスク/チャット発話）' })
  list(@Query() query: ListAttachmentsQueryDto, @CurrentUser('id') accountId: string) {
    return this.attachmentsService.listAttachments(query, accountId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete(':id')
  @ApiOperation({ summary: '添付の解除（リンク削除・実体ファイルは消さない）' })
  @ApiParam({ name: 'id', description: '添付 ID (UUID)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachmentsService.removeAttachment(id, user);
  }
}
