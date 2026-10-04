import { formatFileSize } from './file-size';

/**
 * 上限値の案内文で使う単位換算（v2-191・v2-209 で共通層へ移設）。MB へ切り捨てると 1 MB 未満の上限が
 * 「0 MB」になり、画面の設定値と食い違っていたため、実値に即した単位で出すことを固定する。
 */
describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [5, '5 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [2048, '2 KB'],
    [524288, '512 KB'],
    [1024 * 1024, '1 MB'],
    [1024 * 1024 * 1.5, '1.5 MB'],
    [100 * 1024 * 1024, '100 MB'],
    [1024 * 1024 * 1024, '1 GB'],
  ])('%i バイトを %s と表示する', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
