import { ok, okPaginated, okMessage, buildPaginatedMeta } from './response.dto';

/**
 * cmn-0015: envelope 型（PaginationMeta/ApiResponse/PaginatedResponse）を @rete/shared から import する
 * リファクタ後も、ヘルパー関数の出力 shape が変わらないことを固定する。
 */
describe('response.dto helpers', () => {
  it('ok が ApiResponse<T> 形（{ success: true, data }）を返すこと', () => {
    expect(ok({ id: 1 })).toEqual({ success: true, data: { id: 1 } });
  });

  it('okPaginated が PaginatedResponse<T> 形（{ success: true, data, meta }）を返すこと', () => {
    const meta = buildPaginatedMeta(10, 1, 20);
    expect(okPaginated([1, 2, 3], meta)).toEqual({
      success: true,
      data: [1, 2, 3],
      meta,
    });
  });

  it('okMessage が MessageResponse 形（{ success: true, data: { message } }）を返すこと', () => {
    expect(okMessage('done')).toEqual({ success: true, data: { message: 'done' } });
  });

  it('buildPaginatedMeta が totalPages を切り上げで算出すること', () => {
    expect(buildPaginatedMeta(21, 1, 20)).toEqual({
      total: 21,
      page: 1,
      limit: 20,
      totalPages: 2,
    });
  });
});
