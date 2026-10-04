import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './repositories/categories.repository';
import { MembershipsModule } from '../memberships/memberships.module';

@Module({
  // MembershipsModule が ScopeVisibilityService を export する（cross-space write IDOR の存在秘匿
  // / ADR 0042）。MembershipsModule は他 CM-2 モジュールを import しないため一方向で循環なし。
  imports: [MembershipsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesRepository],
  exports: [CategoriesService],
})
export class CategoriesModule {}
