// cmn-0337: 検査ランナー（run-script-tests.mjs）の REQUIRED_TESTS 名簿を実体と突き合わせる。
//
// なぜ必要か: REQUIRED_TESTS は「既知の検査が改名・削除で静かに減る」ことを検出する名簿。
// 名前を間違えて書くと、本来の検査が実在するのに「存在しない」と誤検出して常時赤になる。
// ここで「名簿の各名が実在ファイルを指すこと」と「名簿が実際の検査群と食い違っていないこと」を
// 固定する（名簿の追加漏れはここでは検出しない＝新規検査は自動探索で走る設計のため）。

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REQUIRED_TESTS, EXCLUDED, allTestFiles, snapshotExcludes } from './run-script-tests.mjs';

test('REQUIRED_TESTS の各名が scripts/ に実在する（cmn-0337）', () => {
  for (const name of REQUIRED_TESTS) {
    if (snapshotExcludes(name)) continue; // 公開スナップショット文脈（scripts/publish/ 不在）では不在を許容
    assert.ok(
      allTestFiles.includes(name),
      `REQUIRED_TESTS の ${name} が scripts/ に存在しません（改名・移動なら REQUIRED_TESTS も直してください）`,
    );
  }
});

test('REQUIRED_TESTS と EXCLUDED に重複が無い（cmn-0337）', () => {
  for (const name of REQUIRED_TESTS) {
    assert.ok(
      !EXCLUDED.has(name),
      `${name} が REQUIRED_TESTS と EXCLUDED の両方に載っています（片方にしてください）`,
    );
  }
});
