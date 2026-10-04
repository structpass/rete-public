// cmn-0252: knip の検出結果をスナップショットで固定する。
//
// なぜ必要か: knip.jsonc の project / ignoreDependencies / includeEntryExports は「検出の嘘を減らす」
// ために引いた境界で、設定を1行いじると静かに戻る（偽陽性が復活する / 盲点が再発する）。
// 件数と依存の検出内容を baseline と突き合わせておけば、戻った時に CI が気付く。
//
// baseline の更新方法（意図した増減の時だけ行う）:
//   1. `pnpm -s check:unused` で結果を確認し、増減が意図どおりか判断する（この script は手元専用＝
//      CI からは撤去済み。一覧が読めるのはここだけなので残してある）
//   2. `node scripts/check-knip-baseline.test.mjs --update` で scripts/knip-baseline.json を書き換える
//   3. 何をなぜ動かしたかをコミットメッセージへ残す
//
// 実行経路（cmn-0261 M2 で CI 専用へ寄せた）:
//   - CI: install / Prisma 生成 / shared ビルド / next typegen の後段にある専用ステップ
//     「Knip snapshot check」だけが呼ぶ。KNIP_SNAPSHOT_REQUIRED=1 付き＝そこで skip したら落とす
//     （cmn-0261 L4。skip で緑になる穴を env で塞いでおかないと cmn-0252 の HIGH が黙って戻る）。
//   - 手元: `pnpm run check:knip-snapshot`（生成物を作った後に回す）。
//   - `check:repo-invariants`（scripts/run-script-tests.mjs）の自動探索からは**外してある**。
//     knip の検出は生成物（shared の dist / Prisma Client / next typegen のルート型）に依存し、
//     install だけのフレッシュクローンで回すと未解決の import が未使用 export として数え上がる。
//     実測（cmn-0261）: 同一コードで exports 59→93 / types 149→243 になり偽の赤が出る。
//
// node_modules（knip 本体）が無い時は落とさず skip する。ただし「node_modules はあるのに knip が
// 無い」は異常なので落とす＝skip が異常を飲み込まないようにする。
//
// CI での knip 実行はこの 1 回だけ（cmn-0261 M3）。以前は non-blocking の `check:unused` ステップと
// 併せて 2 回走っていたが、件数のログはこのファイルが `[knip] …` の 1 行で出すので情報は失われない。
// ローカルで一覧を見たい時は従来どおり `pnpm -s check:unused`。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const BASELINE_PATH = join(HERE, 'knip-baseline.json');
const KNIP_BIN = join(REPO_ROOT, 'node_modules', 'knip', 'bin', 'knip.js');

// 件数の集計はキーを固定列挙しない（cmn-0261）。knip の JSON reporter は issues[] の各要素が
// 「ファイル 1 件ぶんの検出」で、値が配列のキーがそのまま検出項目（exports / types / dependencies /
// unlisted / binaries / …）になる。列挙で持つと (a) 実際には出ないキーが常に 0 のまま通る no-op 検査
// になり、(b) knip 側が後から増やしたキー（optionalPeerDependencies / catalog 等）を数え落とす。
// 総なめにすれば両方が消え、未知キーの出現も下の「未知キー」検査で赤くなる。
//
// 値がオブジェクトのキーだけは件数化の対象外にする＝`{ [enum名]: 項目[] }` の入れ子で、素朴な
// `.length` は効かず、畳んでも「ファイル数」でも「メンバー数」でもない数になる。除外していること
// 自体をここで明示する（黙って落とすと「数えているつもり」の穴が復活する）。
// 帰結として、未使用の enum メンバ / class メンバの回帰は**本検査の射程外**（0 のまま通る no-op を
// 残すより、射程外と言い切る方を採った）。必要になったら入れ子を畳む数え方を先に決めること。
const EXCLUDED_OBJECT_KEYS = ['enumMembers', 'classMembers'];

/**
 * knip を JSON reporter で回して、件数と依存の検出内容へ畳む。
 * install 前（node_modules ごと無い）だけ null を返す。node_modules はあるのに knip が無いのは
 * 異常（devDependencies に宣言済み）なので例外にする。
 */
function runKnip() {
  if (!existsSync(join(REPO_ROOT, 'node_modules'))) return null;
  if (!existsSync(KNIP_BIN)) {
    throw new Error(
      `node_modules はあるのに knip が見つかりません: ${KNIP_BIN}（install の破損か knip の削除）`,
    );
  }
  const res = spawnSync(process.execPath, [KNIP_BIN, '--no-exit-code', '--reporter', 'json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // 設定エラー・クラッシュは黙って通さない（「検出ゼロ」と区別が付かなくなる）。
  // --no-exit-code は検出件数を終了コードへ反映しないので、非 0 は本当に壊れた時だけ。
  if (res.error) throw new Error(`knip の起動に失敗: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(
      `knip が異常終了しました (status=${res.status}): ${(res.stderr || res.stdout).slice(0, 400)}`,
    );
  }
  const start = res.stdout.indexOf('{');
  if (start < 0)
    throw new Error(`knip が JSON を返しませんでした: ${(res.stderr || res.stdout).slice(0, 400)}`);
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.slice(start));
  } catch (e) {
    // 最初の `{` から末尾までを JSON として読む形なので、knip が JSON の後ろへ何か出す
    // （進捗行・警告・改行以外のフッタ）と必ずここへ来る。前側は上の indexOf で捨てているが、
    // 前側に `{` を含む出力が混ざった場合も同じ症状になる。何を疑うべきかを本文へ書いておく。
    throw new Error(
      `knip の JSON を読めませんでした（${e.message}）。stdout へ JSON 以外の出力が混ざっている疑い。` +
        ` 先頭200字: ${JSON.stringify(res.stdout.slice(0, 200))} / 末尾200字: ${JSON.stringify(res.stdout.slice(-200))}`,
    );
  }

  const counts = { files: (parsed.files || []).length };
  const dependencyFindings = [];
  for (const issue of parsed.issues || []) {
    for (const [key, value] of Object.entries(issue)) {
      if (EXCLUDED_OBJECT_KEYS.includes(key)) {
        // 将来 knip がここを配列へ変えたら、除外し続けるのは数え落としになる。気付けるよう落とす。
        if (Array.isArray(value)) {
          throw new Error(
            `${key} が配列になっています＝knip の JSON の形が変わりました（EXCLUDED_OBJECT_KEYS の見直しが要る）`,
          );
        }
        continue;
      }
      if (!Array.isArray(value)) continue; // file（string）や owner などの非配列キー
      if (key === 'files') {
        // トップレベルの files（未使用ファイル一覧）と混ざると、どちらの数か読めなくなる。
        throw new Error('issues[] の中に files キーが現れました＝knip の JSON の形が変わりました');
      }
      counts[key] = (counts[key] ?? 0) + value.length;
    }
    for (const key of ['dependencies', 'devDependencies']) {
      for (const item of issue[key] || []) {
        dependencyFindings.push(`${issue.file || '?'} :: ${item.name || item}`);
      }
    }
  }
  return { counts, dependencyFindings: dependencyFindings.sort() };
}

/**
 * node_modules 不在の skip を許すかどうか。CI の専用ステップは KNIP_SNAPSHOT_REQUIRED=1 を渡し、
 * そこで skip されたら落とす＝「CI では毎回 skip で緑」（cmn-0252 の HIGH）と同型の穴を構造的に塞ぐ。
 * ローカル（install 前の check:repo-invariants）の skip 挙動は env 無しなので従来どおり。
 */
function ensureActual(t) {
  if (actual) return true;
  if (process.env.KNIP_SNAPSHOT_REQUIRED === '1') {
    assert.fail(
      'KNIP_SNAPSHOT_REQUIRED=1 の下で node_modules 不在により skip しようとしました' +
        '（install 済みの環境から呼ばれる前提のステップです）',
    );
  }
  t.skip('install 前の実行（node_modules 不在）');
  return false;
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

// knip は 1 回だけ回して両テストで使い回す（各テストで起動すると全テスト実行に毎回 2 倍の時間が乗る）。
const actual = runKnip();

if (process.argv.includes('--update')) {
  if (!actual) {
    console.error('node_modules がありません（pnpm install 後に実行してください）');
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ ...baseline, ...actual, recordedAt: today }, null, 2)}\n`,
    'utf8',
  );
  console.log(`knip-baseline.json を更新しました（recordedAt=${today}）`);
  process.exit(0);
}

// 検出件数を 1 行で出す。CI から non-blocking の `check:unused` ステップを外した（cmn-0261 M3＝
// knip が 2 回走っていた）ので、「今いくつ検出されているか」をログから読む役はここが引き継ぐ。
if (actual) {
  console.log(
    `[knip] ${Object.entries(actual.counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );
}

test('knip baseline: 検出件数が増える方向へずれていない', (t) => {
  if (!ensureActual(t)) return;
  const tolerance = baseline.tolerance ?? 0.1;
  for (const key of new Set([...Object.keys(baseline.counts), ...Object.keys(actual.counts)])) {
    // baseline にあるキーが actual から丸ごと消えた＝knip が配列を別の形（オブジェクト等）へ
    // 変えたかキー名を変えた。0 件と区別せずに通すと「減る方向は無制限」の規則へ乗って永久に緑になる
    // （数え落としが固定される）。knip は検出 0 のキーも空配列で吐くので、キー消失は形状変化と
    // 一意に識別できる＝オブジェクト→配列側の guard（EXCLUDED_OBJECT_KEYS）と対称に落とす。
    if (key in baseline.counts && !(key in actual.counts)) {
      assert.fail(
        `${key}: baseline にあるキーが knip の出力から消えました＝JSON の形が変わった疑い` +
          '（本当に無くなったキーなら --update で baseline を締め直す）',
      );
    }
    // baseline に無いキーへ件数が付いた＝knip が新しい種類の検出を出し始めた。0 件なら通す
    // （キーだけ生えるのは knip 側の都合）が、1 件でもあれば意図の確認が要るので落とす。
    const expected = baseline.counts[key] ?? 0;
    const got = actual.counts[key] ?? 0;
    // 減る方向は無制限に通す（未使用コードの掃除＝このツールが促したい行動を赤で罰しない）。
    // 増える方向だけを見る＝0 件を保っている項目は 1 件でも増えれば回帰。
    const slack = expected === 0 ? 0 : Math.max(Math.ceil(expected * tolerance), 1);
    assert.ok(
      got <= expected + slack,
      `${key}: baseline ${expected} + ${slack} を超えて ${got}（意図した増加なら --update で baseline を更新）`,
    );
  }
});

test('knip baseline: 未使用依存の検出内容が完全一致する', (t) => {
  if (!ensureActual(t)) return;
  // ここが増える = 本物の未使用依存が増えたか、knip.jsonc の調整が戻って偽陽性が復活したか。
  // 減る = 依存を消したか偽陽性を伏せたか。どちらも意図の確認が要るので完全一致で見る。
  assert.deepEqual(actual.dependencyFindings, baseline.dependencyFindings);
});

test('knip.jsonc: cmn-0252 で引いた境界が残っている', () => {
  // 設定は JSONC（コメント付き）なので、コメントと末尾カンマを落としてから読む。
  // 文字列リテラルを先に食わせて温存する＝素朴に `//` を消すと "$schema" の URL（https://…）まで削れて
  // JSON が壊れる。末尾カンマも JSONC では合法・JSON では不正なので、同型の「温存後に置換」手順で
  // 文字列外の `,\s*[}\]]` だけ落とす（cmn-0286）。温存は1パス目で完結済みなので2パス目は安全。
  const raw = readFileSync(join(REPO_ROOT, 'knip.jsonc'), 'utf8');
  const stripped = raw
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => (m.startsWith('"') ? m : ''))
    .replace(/,(\s*[}\]])/g, '$1');
  let json;
  try {
    json = JSON.parse(stripped);
  } catch (e) {
    // 落とすのはコメントだけで、trailing comma（JSONC としては合法）は残る。付いた瞬間に
    // 素の SyntaxError で落ちて原因が読めないので、疑う先をメッセージへ書いておく（cmn-0261 L2）。
    throw new Error(
      `knip.jsonc を JSON として読めませんでした（${e.message}）。` +
        ' JSONC では合法だが JSON では不正な記法（末尾のカンマなど）が入っていないか確認してください。',
    );
  }
  const ws = json.workspaces;

  // shared の盲点解消（他パッケージから参照されない公開 API を検出する）。
  assert.equal(ws['packages/shared'].includeEntryExports, true);
  // 設定ファイルからしか使われない依存を拾うための project 拡張。
  assert.ok(ws['packages/backend'].project.includes('nest-cli.json'));
  // frontend の .eslintrc.json は現状 no-op（knip 側が eslint v9 + eslint-config-next で config 解決を
  // 止めているため）。将来 knip が解除した時に効くので置いたままにする＝「効いている設定」と
  // 誤読されないよう、無効と分かって残していることを spec 側にも書き残す。
  assert.ok(ws['packages/frontend'].project.includes('.eslintrc.json'));
  // 偽陽性の伏せ字は最小限（ここが膨らむのは境界の引き方を間違えた合図）。
  // 実体で裏取りできたものだけ＝pg / @types/pg / tsconfig-paths は真陽性で、cmn-0260 が
  // backend の直接依存から削除済み（ここへ伏せ字として戻す形での解決はしない）。
  assert.deepEqual(ws['packages/frontend'].ignoreDependencies, ['eslint', 'eslint-config-next']);
  assert.deepEqual(ws['packages/backend'].ignoreDependencies, ['@types/multer', 'ts-loader']);
  // ルートは委譲するだけ＝設定ファイルを持たないので project を広げない（マッチしない pattern を置かない）。
  assert.deepEqual(ws['.'].project, ['scripts/**/*.mjs']);
});
