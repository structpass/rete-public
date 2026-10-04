import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { TagsRepository } from './repositories/tags.repository';

/**
 * タグマスタ機能（rete-files-0006）。マスタ CRUD を提供する。
 * ファイルへの付与/外しは files モジュール側（FileTag 書き込み + 一覧 include）が担当する。
 */
@Module({
  controllers: [TagsController],
  providers: [TagsService, TagsRepository],
})
export class TagsModule {}
