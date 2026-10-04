import type { UserTableColumnWidth } from '@prisma/client';
import {
  toUserTableColumnWidthResponse,
  toUserTableColumnWidthResponseList,
} from './user-table-column-widths.mapper';

function makeEntity(overrides: Partial<UserTableColumnWidth> = {}): UserTableColumnWidth {
  const base = new Date('2026-07-01T00:00:00.000Z');
  return {
    id: 'utcw-1',
    userId: 'acc-1',
    tableId: 'tasks',
    columnKey: 'title',
    width: 200,
    createdAt: base,
    updatedAt: base,
    ...overrides,
  } as UserTableColumnWidth;
}

describe('user-table-column-widths.mapper', () => {
  describe('toUserTableColumnWidthResponse', () => {
    it('Response DTO は tableId/columnKey/width/updatedAt の4キーで id/userId/createdAt を含めない（§1 DTO 境界）', () => {
      const dto = toUserTableColumnWidthResponse(makeEntity());
      expect(Object.keys(dto).sort()).toEqual(['columnKey', 'tableId', 'updatedAt', 'width']);
      expect(dto).not.toHaveProperty('id');
      expect(dto).not.toHaveProperty('userId');
      expect(dto).not.toHaveProperty('createdAt');
    });

    it('updatedAt は ISO 8601 文字列へ変換する', () => {
      const dto = toUserTableColumnWidthResponse(
        makeEntity({ updatedAt: new Date('2026-07-02T09:30:00.000Z') }),
      );
      expect(dto.updatedAt).toBe('2026-07-02T09:30:00.000Z');
    });

    it('tableId/columnKey/width は実値をそのまま写す', () => {
      const dto = toUserTableColumnWidthResponse(
        makeEntity({ tableId: 'chats', columnKey: 'assignee', width: 120 }),
      );
      expect(dto.tableId).toBe('chats');
      expect(dto.columnKey).toBe('assignee');
      expect(dto.width).toBe(120);
    });
  });

  describe('toUserTableColumnWidthResponseList', () => {
    it('空配列は空配列を返す', () => {
      expect(toUserTableColumnWidthResponseList([])).toEqual([]);
    });

    it('複数件を各要素マッピングして返す', () => {
      const list = toUserTableColumnWidthResponseList([
        makeEntity({ columnKey: 'title' }),
        makeEntity({ columnKey: 'assignee' }),
      ]);
      expect(list.map((d) => d.columnKey)).toEqual(['title', 'assignee']);
    });
  });
});
