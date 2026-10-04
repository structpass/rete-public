import { Module } from '@nestjs/common';
import { UserTableColumnWidthsController } from './user-table-column-widths.controller';
import { UserTableColumnWidthsService } from './user-table-column-widths.service';
import { UserTableColumnWidthsRepository } from './repositories/user-table-column-widths.repository';

@Module({
  controllers: [UserTableColumnWidthsController],
  providers: [UserTableColumnWidthsService, UserTableColumnWidthsRepository],
  exports: [UserTableColumnWidthsService],
})
export class UserTableColumnWidthsModule {}
