import { Module } from '@nestjs/common';
import { DeskGroupsController } from './desk-groups.controller';
import { DeskGroupsService } from './desk-groups.service';
import { DeskGroupsRepository } from './repositories/desk-groups.repository';
import { SpacesModule } from '../spaces/spaces.module';

@Module({
  imports: [SpacesModule],
  controllers: [DeskGroupsController],
  providers: [DeskGroupsService, DeskGroupsRepository],
  exports: [DeskGroupsService],
})
export class DeskGroupsModule {}
