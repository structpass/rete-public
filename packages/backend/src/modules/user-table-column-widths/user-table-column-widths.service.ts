import { Injectable } from '@nestjs/common';
import { ok } from '../../common/dto';
import { UserTableColumnWidthsRepository } from './repositories/user-table-column-widths.repository';
import {
  toUserTableColumnWidthResponse,
  toUserTableColumnWidthResponseList,
} from './user-table-column-widths.mapper';

/**
 * 列幅永続化の application layer。
 * tableId / columnKey 検証は controller で完結させ、service は repository を素直に呼ぶ。
 * try/catch は書かず、Prisma エラーは PrismaExceptionFilter に委譲（§4）。
 */
@Injectable()
export class UserTableColumnWidthsService {
  constructor(private readonly repo: UserTableColumnWidthsRepository) {}

  async getMine(userId: string, tableId: string) {
    const entities = await this.repo.findManyByUserAndTable(userId, tableId);
    return ok(toUserTableColumnWidthResponseList(entities));
  }

  async upsert(userId: string, tableId: string, columnKey: string, width: number) {
    const entity = await this.repo.upsert(userId, tableId, columnKey, width);
    return ok(toUserTableColumnWidthResponse(entity));
  }

  /**
   * 列幅を既定へリセットする（保存済み行を全削除 / fil-0054）。
   * 削除件数を返し、呼び出し側は再取得で空配列（= DEFAULT_WIDTHS フォールバック）を得る。
   */
  async resetMine(userId: string, tableId: string) {
    const deleted = await this.repo.deleteAllByUserAndTable(userId, tableId);
    return ok({ deleted });
  }
}
