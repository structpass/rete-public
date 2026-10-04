/**
 * 共有 flush helper（cmn-0137）。
 *
 * 単一版 (await Promise.resolve() ×1) と二重版 (×2) が 14 ファイルに
 * 逐語重複し drift していたのを、二重版 1 本へ固定して集約した。
 *
 * - 二重版は単一版の上位互換（await 連鎖 2 段のテストで必須）。
 * - タイマー非関与テストでは余分な microtask drain は無害。
 * - 使い手に選択を残さない API（flushDeep / 回数引数などは不採用・drift 温床）。
 */
import { act } from '@testing-library/react';

export const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
