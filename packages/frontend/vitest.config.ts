import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    exclude: ['node_modules', 'e2e/**'],
    // cmn-0253 / cmn-0262: テスト実行の時間軸を UTC へ固定する。手元は JST・CI は UTC という差が
    // あると「手元だけ緑」が起きる（fil-0111 の CI 落ち）。
    // 置き場が setupFiles でなく config なのは評価順のため（cmn-0262 M1）＝setupFiles はモジュール
    // 評価の場で、ESM の import 巻き上げにより同ファイルの import が代入より先に走る。test.env は
    // 環境セットアップ時に適用されるので、setup 側へ「モジュール初期化時に時刻軸を掴む依存」が
    // 入っても壊れない。
    // **JST へ固定してはいけない**: ローカル時刻表示（lib/utils.ts の formatDateTime）と JST 固定表示は
    // JST 実行下で完全に一致するため、両者の取り違えを検出できなくなる。cmn-0254（CI workflow の
    // TZ: Asia/Tokyo 撤去）と共通なのは「JST を選ばない」点だけで、狙いは逆向き＝あちらは手元と CI の
    // 環境差を*残して*検出に使い、こちらは frontend の環境差を*消して* spec 側で検出する。
    // 実効性は src/lib/__tests__/utils.test.ts の spec で検査している（設定しただけで効いていない
    // 状態＝Node が TZ の変更を拾わない環境を、緑のまま見逃さないため）。
    env: {
      TZ: 'UTC',
    },
    // cmn-0225: backend (cmn-0215) と同じく設定側で mock リセット規律を機械化。
    // 新規 spec も自動で対象、書き手依存の戻り値仕込みを残さないため両フラグで「実装＋戻り値」を復元。
    mockReset: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // cmn-0183: 既定値でも同一の計測結果になる（実測で一致を確認済）が、将来ツール既定が
      // 変わっても計測対象の意図が壊れないよう明示固定する。
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        '.next/',
        'out/',
        'scripts/',
        '**/*.config.*',
        '**/*.d.ts',
        '**/types/**',
        // 型宣言のみ＝実行コード0行。0% 表示で表を読みにくくするだけ（cmn-0183）。
        // 実行コード（zod スキーマ / 型ガード / 定数マップ等）は types.ts でなく schema.ts・constants.ts へ置く
        // ＝ここへ置くと無警告で計測から落ち、床が甘くなる方向へドリフトする。
        '**/types.ts',
        'src/app/**',
        '**/index.ts',
        'src/test-utils/**',
      ],
      // Vitest4 の実測: statements 77.60 / branches 73.09 / functions 73.02 / lines 79.55。
      // 開発統括承認済みの基準で、テストケースと計測範囲を維持し、以後の低下を検知する。
      thresholds: {
        statements: 77,
        branches: 72,
        functions: 68,
        lines: 78,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
