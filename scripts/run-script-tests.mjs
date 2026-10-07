#!/usr/bin/env node
// cmn-0250: scripts/ 配下のリポ不変条件テスト（*.test.mjs）をまとめて走らせる。
//
// なぜ薄いランナーを挟むのか（`node --test scripts/` で済まさない理由）:
//   - Node 20 は --test の引数にディレクトリを渡すとテストファイルを自動探索するが、Node 22 以降は
//     引数を glob として扱うためディレクトリ指定が「モジュールが見つからない」で落ちる（手元 v24 で実測）。
//   - `node --test scripts/*.test.mjs` は展開をシェルに委ねるため、Windows の cmd 経由（開発統括のローカル）で
//     展開されず落ちる。
//   - 実行するテストファイルを package.json へ列挙すると、新しい検査を足した時に走らせ忘れる。
// よって「探索は Node 標準の fs で自前に行い、実行は --test へファイルを明示で渡す」形にする。
// 依存インストール前に動くこと（Node 標準モジュールのみ）を既存の制約ドリフト検査から引き継ぐ。

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

// 自動探索から外す検査（cmn-0261 M2）。列挙するのは「入れると偽の赤が出るもの」だけで、
// 探索そのものは従来どおり fs 任せ＝新しい検査を足した時に走らせ忘れる穴は塞いだまま。
// 外したものは下でファイル名と理由をログへ出す（黙って減らさない）。
const EXCLUDED = new Map([
  [
    'check-root-dependency-fixes.test.mjs',
    'It inspects installed node_modules/.pnpm copies and cannot run before install. ' +
      'The CI Dependency security regressions step runs it after Install dependencies.',
  ],
  [
    'check-seed-guards.test.mjs',
    'typescript に依存するため install 前は実行しない。CI の Install dependencies 後の ' +
      'Seed guard checks ステップで必須実行する。',
  ],
  [
    'check-knip-baseline.test.mjs',
    'knip の検出は生成物（shared の dist / Prisma Client / next typegen のルート型）に依存し、' +
      'install だけのフレッシュクローンでは未解決の import が未使用 export として数え上がる' +
      '（実測: exports 59→93 / types 149→243）。CI は生成の後段に専用ステップを持つのでそちらで走る。' +
      '手元で回す時は生成物を作ってから pnpm run check:knip-snapshot。',
  ],
]);

export { EXCLUDED };

const allTestFiles = readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map((entry) => entry.name)
  .sort();

export { allTestFiles };

// 消えたら困る既知の検査（cmn-0337）。「新規検査の実行漏れ」を防ぐのではなく「既知の検査が
// 改名・削除で静かに減る」ことを検出するための名簿。実行そのものは自動探索で走るため追記漏れが
// 実行漏れを生むことはないが、名簿へ入れなかった検査は改名・削除を検出できない＝検査を新設したら
// 本名簿へ追記する（v2-238 で追記漏れ2本を実測して補った）。値は scripts/*.test.mjs を実測して
// 確定した（2026-08-09 に 9 本・v2-238 で check-e2e-step-arg-resolution と run-tests-agent を追加）。
// なお run-script-tests.test.mjs 自身は自己参照（この名簿を検証する検査）を避けるため名簿に含めない。
const REQUIRED_TESTS = [
  'check-ci-workflow.test.mjs',
  'check-constraint-drift.test.mjs',
  'check-css-tokens.test.mjs',
  'check-e2e-step-arg-resolution.test.mjs',
  'check-e2e-type-check-scope.test.mjs',
  'check-ignored-builds.test.mjs',
  'check-root-dependency-fixes.test.mjs',
  'check-prisma-client-engine.test.mjs',
  'check-publish-export.test.mjs',
  'check-time-axis-invariants.test.mjs',
  'check-workspace-scripts.test.mjs',
  'check-seed-guards.test.mjs',
  'run-tests-agent.test.mjs',
];

export { REQUIRED_TESTS };

// 公開スナップショット文脈では実在が期待されない検査（targets/*.json の excludeFiles と突合）。
// check-publish-export.test.mjs は scripts/publish/（公開境界の社内ツール）を検査するため、
// scripts/publish/ ごとスナップショットから除外される（excludePrefixes: "scripts/publish/"）。
// scripts/publish/ が存在しない = 公開スナップショット文脈とみなし、不在を許容する
// （黙って減る検出はローカル・社内 CI では従来どおり効く）。config 側の除外と二重管理になるが、
// このランナーは config 非依存（install 前に動く・Node 標準のみ）のため、存在チェックで文脈を判定する。
const PUBLISH_DIR = join(SCRIPTS_DIR, 'publish');
export const snapshotExcludes = (name) =>
  name === 'check-publish-export.test.mjs' && !existsSync(PUBLISH_DIR);

function main() {
  // 除外エントリが実在ファイルを指していない = リネーム／移動で除外が死んでいる。黙って自動探索へ
  // 戻ると、手元の post-install 実行でだけ偽の赤が出る形になるので落とす（このファイルの fail-closed と同型）。
  for (const name of EXCLUDED.keys()) {
    if (!allTestFiles.includes(name)) {
      console.error(
        `[run-script-tests] 除外リストの ${name} が scripts/ に存在しません（改名・移動なら EXCLUDED も直してください）`,
      );
      process.exit(1);
    }
  }

  // 既知の検査が改名・削除で静かに減るのを検出する（0 本になる fail-closed だけでは
  // 「1 本減って緑」がすり抜ける）。REQUIRED_TESTS の各名が実在しなければ落とす。
  // 公開スナップショット文脈（scripts/publish/ 不在）では、publish 系検査の不在は許容する
  // （snapshotExcludes・targets/*.json の excludeFiles と突合）。
  for (const name of REQUIRED_TESTS) {
    if (!allTestFiles.includes(name)) {
      if (snapshotExcludes(name)) {
        console.log(
          `[run-script-tests] 公開スナップショット文脈のため ${name} の不在を許容（scripts/publish/ ごと除外）`,
        );
        continue;
      }
      console.error(
        `[run-script-tests] 必須検査の ${name} が scripts/ に存在しません（改名・移動なら REQUIRED_TESTS も直してください）`,
      );
      process.exit(1);
    }
  }

  const testFiles = allTestFiles
    .filter((name) => !EXCLUDED.has(name))
    .map((name) => join(SCRIPTS_DIR, name));

  for (const name of allTestFiles.filter((n) => EXCLUDED.has(n))) {
    console.log(`[run-script-tests] 除外: ${name} — ${EXCLUDED.get(name)}`);
  }

  // 1 本も見つからない = 探索が壊れている。黙って緑にせず落とす（fail-closed）。
  if (testFiles.length === 0) {
    console.error(
      '[run-script-tests] scripts/ 配下に *.test.mjs が 1 本も見つかりません（探索が壊れています）',
    );
    process.exit(1);
  }

  // どの検査を走らせたかを CI ログへ残す。ファイルの改名・削除で検査が静かに減る（0 本にならない限り
  // 上の fail-closed に掛からない）ことへの唯一の気付き口なので、件数だけでなくファイル名まで出す。
  console.log(
    `[run-script-tests] 対象 ${testFiles.length} 本: ${testFiles.map((file) => file.split(/[\\/]/).pop()).join(', ')}`,
  );

  const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });

  if (result.error) {
    console.error(`[run-script-tests] テストランナーの起動に失敗しました: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main();
}
