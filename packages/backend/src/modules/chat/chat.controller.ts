import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.service';
import { CreateChatThemeDto } from './dto/create-chat-theme.dto';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { UpdateChatMessageDto } from './dto/update-chat-message.dto';
import { UpdateChatThemeDto } from './dto/update-chat-theme.dto';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { FindChatThemesDto } from './dto/find-chat-themes.dto';

// チャットは認証必須（hub と同じ境界）。投稿者は session の sub（= Account.id）から解決。
// 認可境界は service 層で担保（Space 可視 404 / 所有者または ADMIN / 自己データ）。
// ルート命名: コレクションを持つルートは複数形にする。`chat` だけは配下（themes / messages）と
// 揃わない単数形だが、GET /chat/themes が frontend へ浸透済みのため既存 URL 互換で据え置く（v2-229）。
@Controller('chat')
@UseGuards(AuthenticatedGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('themes')
  findThemes(@Query() query: FindChatThemesDto, @CurrentUser('id') userId: string) {
    // currentUserId を渡し「自分宛メンション有無（hasMentionToMe）」をテーマ一覧に集約する（rete-desk-0049）。
    return this.chatService.findThemes(query, userId);
  }

  @Get('themes/:id')
  findThemeDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    // reactedByMe を本人視点で算出するため現在ユーザーを mapper まで配線（§D）。
    return this.chatService.findThemeDetail(id, userId);
  }

  // 書き込み系は全体 throttle（30/60s）より厳しめにしてスパム作成を抑制する。
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('themes')
  @HttpCode(HttpStatus.CREATED)
  createTheme(@CurrentUser('id') authorId: string, @Body() dto: CreateChatThemeDto) {
    return this.chatService.createTheme(authorId, dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('themes/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  postMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateChatMessageDto,
  ) {
    return this.chatService.postMessage(id, authorId, dto);
  }

  // テーマ編集（title / description / tenmatsu / archived）。description は service で sanitize 経路を通す。
  // 編集は投稿者本人のみ（rete-desk-0083）。user を service へ渡し所有チェックを通す
  //（UI のボタン非表示は迂回可能なため backend で IDOR を塞ぐ）。
  // 例外: 顛末（tenmatsu / tenmatsuMentionAccountIds）のみの更新は非所有者にも許可（rete-desk-0122）。
  // H4: ADMIN は所有者に関わらず編集可（assertOwnerOrAdmin）。
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch('themes/:id')
  updateTheme(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateChatThemeDto,
  ) {
    return this.chatService.updateTheme(id, dto, user);
  }

  // テーマ削除（起点カード「その他 > メッセージ削除」/ rete-desk-0095）。投稿者本人のみ（service で 403）。
  // 物理削除のため作成系と同じ厳しめ throttle でスパム削除を抑制する。
  // H4: ADMIN は所有者に関わらず削除可（assertOwnerOrAdmin）。
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('themes/:id')
  deleteTheme(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.deleteTheme(id, user);
  }

  // 自分の発話の本文編集（rete-desk-0146）。body は service で sanitize、宛先は再抽出値で全置換。
  // 編集は投稿者本人のみ（service が 403 で IDOR を塞ぐ）。作成系と同じ厳しめ throttle。
  // H4: ADMIN は所有者に関わらず編集可（assertOwnerOrAdmin）。
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Patch('messages/:id')
  updateMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateChatMessageDto,
  ) {
    return this.chatService.updateMessage(id, user, dto);
  }

  // 発話（返信メッセージ）の削除（発話「その他」> メッセージの削除 / dsk-0316）。投稿者本人のみ（service で 403）。
  // 物理削除のため deleteTheme と同じ厳しめ throttle でスパム削除を抑制する。ADMIN は所有者に関わらず削除可。
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('messages/:id')
  deleteMessage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chatService.deleteMessage(id, user);
  }

  // リアクションのトグル（POST 一本）。付与/解除は service が既存有無で判定する。
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('messages/:id/reactions')
  @HttpCode(HttpStatus.OK)
  toggleMessageReaction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateReactionDto,
  ) {
    return this.chatService.toggleMessageReaction(id, authorId, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('themes/:id/reactions')
  @HttpCode(HttpStatus.OK)
  toggleThemeReaction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') authorId: string,
    @Body() dto: CreateReactionDto,
  ) {
    return this.chatService.toggleThemeReaction(id, authorId, dto);
  }
}
