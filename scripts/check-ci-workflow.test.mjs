// cmn-0261: CI ワークフロー側にしか居場所が無い検査の「呼ばれ方」を固定する。
//
// なぜ必要か: knip のスナップショット検査は生成物（shared の dist / Prisma Client / next typegen の
// ルート型）が揃った後でないと偽の赤が出るため、install 前に走る check:repo-invariants の自動探索
// からは外してある（cmn-0261 M2）。結果、実行経路は .github/workflows/test.yml の
// 「Knip snapshot check」ステップ 1 本だけになった。この状態でステップを消す・改名する・env を
// 落とすと、検査は何も落とさずに消える（cmn-0252 の HIGH「CI で一度も回帰を見ていない」と同型）。
// 経路が 1 本しかないものは、その 1 本自体を検査で押さえる。
//
// YAML パーサは使わない（このファイルは install 前に走る＝Node 標準モジュールのみ）。
// 文字列で見る分には十分で、狙いは「消えたら気付く」であって構文解析ではない。

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'test.yml');
const DEPLOY_WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'deploy.yml');

function validateSeedGuardStep(yaml) {
  const lines = yaml.split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
  const start = lines.findIndex((line) => /^      - name: Seed guard checks\s*$/.test(line));
  assert.ok(start >= 0, 'Seed guard checks の必須stepがありません');
  const install = lines.findIndex((line) => /^      - name: Install dependencies\s*$/.test(line));
  assert.ok(install >= 0 && install < start, 'seed検査は依存install後に実行する');
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^      - /.test(line));
  const step = rest.slice(0, end < 0 ? undefined : end).join('\n');
  assert.match(step, /^        run: node --test scripts\/check-seed-guards\.test\.mjs\s*$/m);
  assert.doesNotMatch(
    step,
    /^        (?:if|continue-on-error):/m,
    'seed検査を条件付き/非必須にしない',
  );
}

test('CI: seedガード検査はinstall後に必ず実行する (v2-373)', () => {
  validateSeedGuardStep(readFileSync(WORKFLOW_PATH, 'utf8'));
});

test('CI: seed検査stepの削除・順序逆転・非必須化を検出する (v2-373)', () => {
  const yaml = readFileSync(WORKFLOW_PATH, 'utf8');
  const step =
    '      - name: Seed guard checks\n        run: node --test scripts/check-seed-guards.test.mjs\n';
  const clean = yaml.replace(/\r\n/g, '\n');
  assert.ok(clean.includes(step));
  assert.throws(() => validateSeedGuardStep(clean.replace(step, '')));
  assert.throws(() =>
    validateSeedGuardStep(
      clean
        .replace(step, '')
        .replace('      - name: Install dependencies', step + '      - name: Install dependencies'),
    ),
  );
  assert.throws(() =>
    validateSeedGuardStep(clean.replace(step, step + '        continue-on-error: true\n')),
  );
});

/**
 * 「Knip snapshot check」ステップの本体（コメント行を除いた区間）を返す。
 *
 * ファイル全体へ素の includes を掛けると、**同じ語を含む解説コメントに当たって guard が no-op になる**
 * （test.yml には KNIP_SNAPSHOT_REQUIRED を説明するコメント行がある）。コメントを落とし、さらに
 * 当該ステップの区間へ絞る＝別ステップに env だけ生き残る形も塞ぐ。
 */
function knipStepBody(yaml) {
  const lines = yaml.split('\n').filter((line) => !/^\s*#/.test(line));
  const start = lines.findIndex((line) => /^\s*-\s+name:\s*Knip snapshot check\s*$/.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*-\s/.test(line)); // 次のステップの開始
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

test('CI: knip スナップショット検査のステップと env が残っている', () => {
  const yaml = readFileSync(WORKFLOW_PATH, 'utf8');
  const step = knipStepBody(yaml);

  assert.ok(
    step,
    'test.yml に「Knip snapshot check」ステップがありません＝knip スナップショット検査の唯一の実行経路が無くなりました' +
      '（install 前の check:repo-invariants からは意図的に外してあるため、ここが消えると誰も走らせません）',
  );

  // 起動は package.json の script 経由へ寄せてある（CI 直書きと二重管理にしない）。
  assert.ok(
    step.includes('run: pnpm run check:knip-snapshot'),
    'Knip snapshot check ステップが check:knip-snapshot を起動していません（起動の書き方を変えたら本検査も直す）',
  );

  // node_modules 不在で skip されたら落とす、を CI 側で有効にする env（cmn-0261 L4）。
  assert.ok(
    step.includes('KNIP_SNAPSHOT_REQUIRED'),
    'Knip snapshot check ステップから KNIP_SNAPSHOT_REQUIRED が消えています＝install が壊れた時に検査が skip のまま緑になります',
  );

  // script 自体の存在も見る（ステップだけ残って script が消えると CI で初めて落ちる）。
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(
    typeof pkg.scripts?.['check:knip-snapshot'] === 'string',
    'ルート package.json に check:knip-snapshot がありません（test.yml が呼んでいる script です）',
  );
});

/**
 * 「Format check」ステップの本体（コメント行を除いた区間）を返す。
 *
 * knip スナップショット検査と同じ運用: format:check も CI ワークフロー側にしか居場所が無い
 * （`pnpm run format:check` を別スクリプトに書いても CI からどう起動するかが固定されない）。
 * ステップが消える・改名する・run を直書きへ変える等で、整形ドリフトの検出が CI から黙って
 * 消える。経路を 1 本に絞ったので、その 1 本自体を検査で押さえる（cmn-0263）。
 */
function formatCheckStepBody(yaml) {
  const lines = yaml.split('\n').filter((line) => !/^\s*#/.test(line));
  const start = lines.findIndex((line) => /^\s*-\s+name:\s*Format check\s*$/.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*-\s/.test(line));
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

test('CI: format:check ステップとルート script が残っている (cmn-0263)', () => {
  const yaml = readFileSync(WORKFLOW_PATH, 'utf8');
  const step = formatCheckStepBody(yaml);

  assert.ok(
    step,
    'test.yml に「Format check」ステップがありません＝format:check ステップが消えました（cmn-0263 で追加した整形ドリフト検出の唯一の CI 経路）',
  );

  // 起動は package.json の script 経由へ寄せてある（CI 直書きと二重管理にしない）。
  assert.ok(
    step.includes('run: pnpm run format:check'),
    'Format check ステップが format:check を起動していません（起動の書き方を変えたら本検査も直す）',
  );

  // script 自体の存在も見る（ステップだけ残って script が消えると CI で初めて落ちる）。
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(
    typeof pkg.scripts?.['format:check'] === 'string',
    'ルート package.json に format:check がありません（test.yml が呼んでいる script です）',
  );
});

/**
 * 「Unit test (E2E)」ステップと e2e の test:unit script を固定する（cmn-0376）。
 *
 * e2e の支持単体テスト（support/__tests__/*.test.ts）は `node --experimental-strip-types` で
 * TypeScript のまま実行する（Node 22+）。CI では独立 job
 * （e2e・node-version: 24）の「Unit test (E2E)」ステップ 1 本だけが実行経路で、これを消す・改名する・
 * script 名を変えると検査が何も落とさずに消える。経路が 1 本しかないものは、その 1 本自体を検査で
 * 押さえる（knip / format の固定と同じ運用・cmn-0376 criteria 5）。
 */
function e2eUnitStepBody(yaml) {
  const lines = yaml.split('\n').filter((line) => !/^\s*#/.test(line));
  const start = lines.findIndex((line) => /^\s*-\s+name:\s*Unit test \(E2E\)\s*$/.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*-\s/.test(line));
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

test('CI: e2e の単体テスト（test:unit）が実行される経路が残っている (cmn-0376)', () => {
  const yaml = readFileSync(WORKFLOW_PATH, 'utf8');
  const step = e2eUnitStepBody(yaml);

  assert.ok(
    step,
    'test.yml に「Unit test (E2E)」ステップがありません＝e2e 支持単体テストの唯一の実行経路が無くなりました（support/__tests__/*.test.ts が CI で一度も走らなくなります）',
  );

  // 起動は e2e/package.json の script 経由へ寄せてある（CI 直書きと二重管理にしない）。
  assert.ok(
    step.includes('run: npm run test:unit'),
    'Unit test (E2E) ステップが test:unit を起動していません（起動の書き方を変えたら本検査も直す）',
  );

  // Node 22+ の機能（--experimental-strip-types）を使うため独立 job 側の Node 指定が必要。
  // 素の includes だと e2e job の setup-node コメント行に当たる恐れがあるため、job 区間へ絞る。
  const job = yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  assert.ok(
    /e2e:\s*\n\s*runs-on: ubuntu-latest[\s\S]*?node-version: 24/.test(job),
    'test.yml に e2e 独立 job（node-version: 24）がありません＝test:unit の検証済み実行経路が失われます',
  );

  // script 自体の存在も見る（ステップだけ残って script が消えると CI で初めて落ちる）。
  const e2ePkg = JSON.parse(readFileSync(join(REPO_ROOT, 'e2e', 'package.json'), 'utf8'));
  assert.ok(
    typeof e2ePkg.scripts?.['test:unit'] === 'string' &&
      e2ePkg.scripts['test:unit'].includes('--test support/__tests__/*.test.ts'),
    'e2e/package.json に test:unit（support/__tests__/*.test.ts を実行する script）がありません（test.yml が呼んでいる script です）',
  );
});

test('公開toolchain: Node24がCI・開発・全Docker stageで一致する (v2-395)', () => {
  const nvmrc = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim();
  assert.equal(nvmrc, '24', 'CIと開発にはサポート中のNode24を使う');
  const rootPkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(rootPkg.engines.node, '>=24.0.0');
  const yaml = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(yaml, /node-version-file:\s*\.nvmrc/);
  for (const name of ['backend', 'frontend']) {
    const dockerfile = readFileSync(join(REPO_ROOT, 'packages', name, 'Dockerfile'), 'utf8');
    const bases = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map((match) => match[1]);
    assert.deepEqual(bases, ['node:24-alpine', 'node:24-alpine', 'node:24-alpine']);
  }
});

/**
 * 供給網の pin 方針を機械強制する（cmn-0393）。
 *
 * 「第三者 Action は full commit SHA で pin・GitHub 公式（actions/*）はタグ可」という方針は
 * これまで test.yml のコメントにしか無く、緩い指定（可変タグ）を書き足しても CI は緑のままだった。
 * 可変タグは maintainer 側の差し替えがそのまま runner 上の実行内容へ流れ込むため、破ったら赤くする。
 * 対象は .github/workflows 配下の全ワークフロー（ファイルを新設しても自動で対象に入る）。
 * 既知の穴: 検査対象は「uses と値が同一行の block style」のみ。flow mapping（- { uses: x }）や
 * 値の次行折り返しは YAML パーサ不使用の制約上すり抜ける（現行ワークフローに該当書式は無い。
 * 導入する時はこの検査が沈黙する＝書式を揃えるか検査側を拡張する）。
 */
/**
 * 「Build shared」ステップの存在と、生成物依存ステップより前にあることを固定する（rev-arch B4）。
 *
 * なぜ必要か: backend / frontend は `@rete/shared` を pnpm の symlink 先 package.json の
 * main/types（= dist/）で解決する。dist/ は gitignore・未追跡のため fresh runner には存在せず、
 * Build shared を Type check / Coverage より後に動かす（または消す）と
 * `Cannot find module '@rete/shared'` で CI が赤くなる。順序自体は正しいが、これまで検査が無く
 * 黙って壊せた。ローカル側の同型欠陥（ルート type-check が shared を build しない）は
 * rev-arch B1 で別途修正済み＝CI だけが正しい状態だった。
 *
 * 「生成物より前」の判定は、name 行の出現位置で行う（YAML パーサ不使用・install 前に走るため）。
 */
function stepIndex(yaml, name) {
  const lines = yaml.split('\n').filter((line) => !/^\s*#/.test(line));
  return lines.findIndex((line) => new RegExp(`^\\s*-\\s+name:\\s*${name}\\s*$`).test(line));
}

test('CI: Build shared が Type check / Coverage より前に実行される (rev-arch B4)', () => {
  const yaml = readFileSync(WORKFLOW_PATH, 'utf8');

  const buildShared = stepIndex(yaml, 'Build shared');
  const typeCheck = stepIndex(yaml, 'Type check');
  const coverage = stepIndex(yaml, 'Coverage threshold \\(all packages\\)');

  assert.ok(
    buildShared >= 0,
    'test.yml に「Build shared」ステップがありません＝backend / frontend が @rete/shared の dist を' +
      '解決できず、fresh runner で Cannot find module になります',
  );
  assert.ok(typeCheck >= 0, 'test.yml に「Type check」ステップがありません');
  assert.ok(
    buildShared < typeCheck,
    'Build shared が Type check より後にあります＝shared の dist が無いまま型検査が走り、' +
      "Cannot find module '@rete/shared' で赤くなります",
  );
  if (coverage >= 0) {
    assert.ok(
      buildShared < coverage,
      'Build shared が Coverage threshold より後にあります＝テスト側でも shared の dist を解決できません',
    );
  }

  // 起動は package.json の script 経由へ寄せる（CI 直書きと二重管理にしない）。
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(
    typeof pkg.scripts?.['build:shared'] === 'string',
    'ルート package.json に build:shared がありません（CI とローカル type-check が共有する起動口です）',
  );
});

test('CI: 第三者 Action は full commit SHA で pin されている（actions/* のみタグ可・cmn-0393）', () => {
  const wfDir = join(REPO_ROOT, '.github', 'workflows');
  const files = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(
    files.length > 0,
    '.github/workflows にワークフローがありません（検査対象ゼロは fail-open）',
  );

  const violations = [];
  for (const file of files) {
    const lines = readFileSync(join(wfDir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return; // コメント行は対象外
      const m = line.match(/^\s*-?\s*uses:\s*(\S+)/);
      if (!m) return;
      const ref = m[1];
      if (ref.startsWith('actions/')) return; // GitHub 公式 org はタグ参照可（意図的な差）
      if (ref.startsWith('./')) return; // 同一リポジトリの reusable workflow は SHA 固定の対象外
      if (!/@[0-9a-f]{40}(\s|$)/.test(ref + ' ')) {
        violations.push(`${file}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(
    violations,
    [],
    '第三者 Action が full commit SHA（40 桁 hex）で pin されていません。可変タグは maintainer 側の' +
      '差し替えがそのまま runner 上の実行内容に流れ込みます（供給網方針・test.yml のコメント参照）:\n' +
      violations.join('\n'),
  );
});

/**
 * deploy.yml の「CI 成功後の同一 SHA 配布」の配線を固定する（v2-238）。
 *
 * なぜ必要か: 本ファイルの検査は test.yml（CI）だけを対象にしており、CD 側の deploy.yml は
 * ステップ改名も env の貼り替えも検査外だった。第三者 Action の SHA pin だけは workflows
 * ディレクトリ全体を走査するため deploy.yml にも効いているが、「CI が成功した同一 commit SHA を
 * CD へ渡す」（AGENTS.md §Git and delivery）という契約自体は誰も押さえていなかった。
 * deploy.yml は workflow_dispatch でも手動実行できるため、配線が壊れても気付くのは本番デプロイの
 * 失敗時（または CI を通っていない版の配布）になる。経路が 1 本しかないものは、その 1 本自体を
 * 検査で押さえる（knip / format / build:shared の固定と同じ運用）。
 *
 * 見るのは 4 点。YAML パーサは使わない（install 前に走る＝Node 標準モジュールのみ・test.yml 側と同理由）:
 *   - 「Deploy exact SHA via SSM」ステップが存在する（改名・削除で配布の配線が消えるのを検出）
 *   - そのステップの env が SHA: ${{ github.sha }} を固定している（配布元 SHA の取り違えを検出）
 *   - そのステップが対象 SHA を detach checkout している（EC2 上で最新版へ追従させない）
 *   - deploy ジョブが main 限定で、needs に test（CI）を持つ（CI 成功前の配布を検出）
 */
function deployStepBody(yaml) {
  const lines = yaml.split('\n').filter((line) => !/^\s*#/.test(line));
  const start = lines.findIndex((line) =>
    /^\s*-\s+name:\s*Deploy exact SHA via SSM\s*$/.test(line),
  );
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*-\s/.test(line)); // 次のステップの開始
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

/** ジョブ区間（インデント2の `<job>:` から次のジョブまで）を返す。 */
function jobBody(yaml, job) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => new RegExp(`^  ${job}:\\s*$`).test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

test('CD: deploy.yml が CI 成功後の同一 SHA を配布する配線を保っている (v2-238)', () => {
  if (!existsSync(join(REPO_ROOT, 'scripts', 'publish'))) {
    assert.equal(
      existsSync(DEPLOY_WORKFLOW_PATH),
      false,
      '公開版に社内 deploy.yml を含めてはいけません',
    );
    const yaml = readFileSync(WORKFLOW_PATH, 'utf8');
    assert.match(
      yaml,
      /^ {4}branches: \['\*\*'\]$/m,
      '公開版は main を含む branch push で CI を起動する',
    );
    assert.doesNotMatch(
      yaml,
      /^\s*(?:branches-ignore|tags|tags-ignore|pull_request_target|workflow_call):/m,
    );
    return;
  }
  const yaml = readFileSync(DEPLOY_WORKFLOW_PATH, 'utf8');

  const step = deployStepBody(yaml);
  assert.ok(
    step,
    'deploy.yml に「Deploy exact SHA via SSM」ステップがありません＝同一 SHA 配布の唯一の実行経路が' +
      '無くなりました（改名したなら本検査も直してください）',
  );
  assert.ok(
    step.includes('SHA: ${{ github.sha }}'),
    'Deploy exact SHA via SSM ステップの env から SHA: ${{ github.sha }} が消えています＝' +
      '配布する SHA が workflow の起点（CI を通った commit）と一致しなくなります',
  );
  assert.ok(
    step.includes('git checkout --force --detach'),
    'Deploy exact SHA via SSM ステップが対象 SHA を detach checkout していません＝' +
      'EC2 上が最新版へ追従し、CI を通った SHA と配布物がずれます',
  );

  const job = jobBody(yaml, 'deploy');
  assert.ok(job, 'deploy.yml に deploy ジョブがありません');
  assert.match(
    job,
    /^\s{4}if: github\.ref == 'refs\/heads\/main'$/m,
    "deploy ジョブの main 限定（if: github.ref == 'refs/heads/main'）が変わっています＝" +
      'main 以外の ref を配布できる経路ができます（手動実行の追加は本検査も直してください）',
  );
  assert.match(
    job,
    /^\s{4}needs:.*\btest\b/m,
    'deploy ジョブの needs に test（CI）がありません＝CI 成功前の配布が起きます',
  );
});
