import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// cmn-0339: packages/backend/eslint.config.mjs から移植（parity 対象・brd-0252）。
// 未説明差分 0 の変換規則:
//  - tsconfigRootDir 以外は同一。backend が import.meta.dirname で自ディレクトリを指すのに対し、
//    shared も同型（config ファイル自身の場所から相対で tsconfig.json を引く）。
//  - backend 固有のテスト側 no-restricted-syntax（cmn-0335・jest の mock 仕込み禁止）は
//    移植しない。理由: shared は vitest 利用で resetMocks 相当の毎テスト剥がし設定が無く
//    （vitest.config.ts に該当設定なし）、「実行時に剥がれる死んだ設定」という前提が成立しない。
//    テストファイルの構造上限オフ（cmn-0243）は shared にも当てはまるため残す。
export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // cmn-0238: 型としてしか使わない import を import type へ統一（verbatimModuleSyntax 移行耐性）。
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // cmn-0243: 構造上限ルール（warn）。
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 60, skipComments: true, skipBlankLines: true }],
    },
  },
  // テストファイル（spec/test）は構造上限の対象外（cmn-0243・backend と同型）。
  {
    files: ['**/*.test.ts'],
    rules: {
      complexity: 'off',
      'max-depth': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
];
