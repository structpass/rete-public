import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 共有パッケージは純関数のみ＝DOM 不要（frontend の jsdom とは前提が違う・cmn-0184）。
    environment: 'node',
    globals: true,
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // SSOT 2 モジュール（強度ルール／sanitize 許可リスト）だけを計測対象にする。
      // 型宣言（types/**）と barrel（**/index.ts）は実行コード0行なので除外し 100% 床を成立させる。
      include: ['src/security/**/*.ts', 'src/rich-text/**/*.ts'],
      exclude: ['**/index.ts', 'src/types/**', '**/*.test.ts'],
      // cmn-0184: 純関数のみで到達可能な 100% を床に敷く（劣化検知）。
      // キー名は Vitest 3 の thresholds（Jest 形式 coverageThreshold は無警告で無視される）。
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
