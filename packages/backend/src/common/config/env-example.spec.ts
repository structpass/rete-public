import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * .env.example が「運用上の既定値」を明示し続けているかを固定する。
 *
 * ここで検証すること:
 * - DATABASE_URL に接続プールの上限（connection_limit / pool_timeout）の指定が入っていること。
 *   上限が無いと Serializable tx の同時実行が DB の max_connections を食い潰し、認証系まで
 *   巻き込んで落ちる（cmn-0251）。ライブラリ既定への暗黙依存を残さないため値を明示する。
 *
 * .env.example は人が読むテンプレートなので、消えたことに気付く仕組みが他に無い（型でも起動時検証でも
 * 拾えない）。ここで文字列として固定するのが唯一の歯止め。
 */

const ENV_EXAMPLE_PATH = join(__dirname, '../../../.env.example');

describe('.env.example', () => {
  const content = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
  const databaseUrlLine = content.split(/\r?\n/).find((line) => line.startsWith('DATABASE_URL='));

  it('DATABASE_URL の行が存在する', () => {
    expect(databaseUrlLine).toBeDefined();
  });

  it('DATABASE_URL に接続プール上限（connection_limit / pool_timeout）が明示されている', () => {
    expect(databaseUrlLine).toMatch(/connection_limit=\d+/);
    expect(databaseUrlLine).toMatch(/pool_timeout=\d+/);
  });

  it('プール上限の意図（なぜ既定任せにしないか）がコメントで説明されている', () => {
    // 値だけ置くと、次に触る人が「消してよい飾り」と読んでしまう。
    expect(content).toMatch(/connection_limit[\s\S]{0,400}max_connections/);
  });
});
