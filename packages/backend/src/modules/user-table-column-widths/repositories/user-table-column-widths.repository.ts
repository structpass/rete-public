import { Injectable } from '@nestjs/common';
import { UserTableColumnWidth } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * UserTableColumnWidth データアクセス層（architecture-invariants §2）。
 * Service は Prisma を直接呼ばず、本 repository 経由でのみ DB に触る。
 */
@Injectable()
export class UserTableColumnWidthsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByUserAndTable(userId: string, tableId: string): Promise<UserTableColumnWidth[]> {
    return this.prisma.userTableColumnWidth.findMany({
      where: { userId, tableId },
    });
  }

  upsert(
    userId: string,
    tableId: string,
    columnKey: string,
    width: number,
  ): Promise<UserTableColumnWidth> {
    return this.prisma.userTableColumnWidth.upsert({
      where: {
        userId_tableId_columnKey: { userId, tableId, columnKey },
      },
      update: { width },
      create: { userId, tableId, columnKey, width },
    });
  }

  /**
   * 指定ユーザー・テーブルの保存済み列幅を全削除する（リセット = 既定へ戻す / fil-0054）。
   * 削除後は getMine が空配列を返し、呼び出し側が DEFAULT_WIDTHS にフォールバックする。
   */
  async deleteAllByUserAndTable(userId: string, tableId: string): Promise<number> {
    const { count } = await this.prisma.userTableColumnWidth.deleteMany({
      where: { userId, tableId },
    });
    return count;
  }
}
