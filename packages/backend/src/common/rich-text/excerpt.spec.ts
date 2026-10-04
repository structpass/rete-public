import { toExcerpt } from './excerpt';

// announcement.mapper.ts のローカル実装から common へ抽出（dsk-0269・§3）。挙動は移設前と同一であること。
describe('toExcerpt', () => {
  it('HTML タグを除去し空白を畳んだテキストを返す', () => {
    expect(toExcerpt('<p>こんにちは <strong>世界</strong></p>', 100)).toBe('こんにちは 世界');
  });

  it('HTML エンティティをデコードする（&amp; は二重デコード防止のため最後）', () => {
    expect(toExcerpt('<p>R&amp;D &lt;tag&gt; &quot;q&quot;</p>', 100)).toBe('R&D <tag> "q"');
    // &amp;lt; は「&lt;」という文字列であって「<」ではない（先に & を戻すと二重デコードで壊れる）。
    expect(toExcerpt('&amp;lt;', 100)).toBe('&lt;');
  });

  it('max 文字を超える場合は先頭 max 文字 +「…」に切り詰める', () => {
    expect(toExcerpt('あいうえおかきくけこ', 5)).toBe('あいうえお…');
  });

  it('ちょうど max 文字なら切り詰めない（「…」を付けない）', () => {
    expect(toExcerpt('あいうえお', 5)).toBe('あいうえお');
  });

  it('タグのみ・空文字は空文字を返す', () => {
    expect(toExcerpt('<p><br /></p>', 100)).toBe('');
    expect(toExcerpt('', 100)).toBe('');
  });
});
