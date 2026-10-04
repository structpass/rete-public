import { translateUploadErrorMessage } from './upload-error-messages';

/**
 * multipart の上限エラーは multer / busboy の英語文言で投げられ、Nest が HttpException へ変換する際に
 * code を落とす。文言そのものを対応表の鍵にしているため、実際に観測される文字列で固定する（v2-191）。
 */
describe('translateUploadErrorMessage', () => {
  it.each([
    ['Too many files', '1 回にアップロードできるファイルは 1 件です'],
    ['Too many parts', '送信されたデータの形式が不正です（区切りの数が上限を超えました）'],
    ['Too many fields', 'ファイルと一緒に項目は送信できません'],
    ['Field name too long', '送信された項目名が長すぎます'],
    ['Field name missing', '送信されたデータの形式が不正です（項目名がありません）'],
    ['Field name nesting too deep', '送信されたデータの形式が不正です（項目の入れ子が深すぎます）'],
    ['Field value too long', '送信された項目の値が長すぎます'],
    ['Unexpected field', '想定していない項目が送信されました'],
    ['Multipart: Boundary not found', '送信されたデータの形式が不正です（区切りが見つかりません）'],
    [
      'Multipart: Malformed part header',
      '送信されたデータの形式が不正です（区切りが壊れています）',
    ],
    ['Multipart: Unexpected end of form', '送信が途中で切れました。もう一度お試しください'],
    ['Multipart: Unexpected end of file', '送信が途中で切れました。もう一度お試しください'],
    [
      'ThrottlerException: Too Many Requests',
      'アップロードの回数が多すぎます。少し待ってからお試しください',
    ],
  ])('%s を日本語の案内文へ訳す', (raw, expected) => {
    expect(translateUploadErrorMessage(raw)).toBe(expected);
  });

  it('File too large は渡された経路の上限実値を案内する（v2-209）', () => {
    // ファイルのアップロード経路は 100 MiB の backstop を渡す。
    expect(
      translateUploadErrorMessage('File too large', { maxFileSizeBytes: 100 * 1024 * 1024 }),
    ).toBe('ファイルサイズが上限（100 MB）を超えています');
    // 招待 CSV の取り込みは 1 MB（固定・可変パラメータにしない＝v2-196 の開発統括判断）。
    expect(translateUploadErrorMessage('File too large', { maxFileSizeBytes: 1024 * 1024 })).toBe(
      'ファイルサイズが上限（1 MB）を超えています',
    );
  });

  it('上限値が渡されない時は実値を含まない汎用文にする（v2-209）', () => {
    // 経路が上限を宣言していない時に、別経路の値（100 MB 等）を誤って案内しないため。
    expect(translateUploadErrorMessage('File too large')).toBe(
      'ファイルサイズが上限を超えています',
    );
  });

  it('Nest が field 名を後置した文言も訳す', () => {
    expect(translateUploadErrorMessage('Unexpected field - note')).toBe(
      '想定していない項目が送信されました',
    );
  });

  it('対象外の文言は訳さない（呼び出し側は元の文言をそのまま返す）', () => {
    expect(translateUploadErrorMessage('ファイルが指定されていません')).toBeUndefined();
    expect(translateUploadErrorMessage('Too many')).toBeUndefined();
  });

  it('英語文言で始まるだけの別の文言は訳さない', () => {
    // 利用者が付けたファイル名・拡張子が文言の先頭に入る業務エラーを multipart の案内へ
    // 誤って差し替えないため、後置（` - `）以外の続きを許さない。
    expect(translateUploadErrorMessage('Too many files という名前のファイルです')).toBeUndefined();
    expect(translateUploadErrorMessage('Too many files-')).toBeUndefined();
    expect(translateUploadErrorMessage('Unexpected field note')).toBeUndefined();
  });
});
