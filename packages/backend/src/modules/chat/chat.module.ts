import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRepository } from './repositories/chat.repository';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  // MembershipsModule が ScopeVisibilityService を export する（Space 可視性による存在秘匿
  // / rete-hardening）。一覧は可視 Space へフィルタ、単体 GET / write 対象の越境は 404 へ揃える。
  // MembershipsModule は他 CM-2 モジュールを import しないため一方向で循環なし。
  imports: [MembershipsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository],
  // task-comments モジュール（dsk-0297）が ChatService.toggleReaction を cross-module DI で
  // 再利用するため export する（トグル本体の複製を避ける・§3 コピペ禁止）。
  exports: [ChatService],
})
export class ChatModule {}
