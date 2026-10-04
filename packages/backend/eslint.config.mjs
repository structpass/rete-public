import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

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
      // prefer: 'type-imports' で import → import type へ自動修正／fixStyle: 'separate-type-imports' で
      // 同一行の混在も1行ずつ分離。NestJS の DI（emitDecoratorMetadata 由来）は type-only でも値が
      // 必要なので、parser が DI 利用を検出して自動で除外する（タスク起票時に実機検証済）。
      // 混在（型+定数を1行で import）は本ルールの対象外＝後続 開発エージェントが漏れと誤認しないよう known-limitations へ記録。
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // cmn-0243: 構造上限ルール（warn）。閾値は記事と実測の中間値。error 昇格は件数を見て
      // 別チケットで判断する（criteria 2＝この段階では CI は赤くしない）。
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 60, skipComments: true, skipBlankLines: true }],
      // fil-0120 M2 のブランド型 AllFolderAclNodes 鋳造ガード（no-restricted-syntax）は、
      // ADR 0063（fil-0136）で folder-acl.service.ts ごと撤去したため削除した（守る対象が無い）。
    },
  },
  // テストファイル（spec/test）は構造上限の対象外（cmn-0243・criteria 3）。describe ブロックが
  // 巨大な関数として見える構造上、素直に入れると警告がテストのノイズだけになり本体コードが埋もれる。
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      complexity: 'off',
      'max-depth': 'off',
      'max-lines-per-function': 'off',
      // cmn-0335 (criteria 1): Program 直下（ファイルの最外側）でモックの戻り値を仕込む書き方を禁止。
      // resetMocks: true の設定で戻り値は毎テスト剥がれるため、最外側の mockResolvedValue 等は
      // 「実行時には既に剥がれている死んだ設定」になる（テストが緑でも何も確かめない負債）。
      // 判定範囲はこの一段のみ：module scope の関数の中・トップレベル beforeEach の中は対象外
      // （実行時に張り直す正当な作法）。既存コードは検査導入時点で全て緑。
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Program > ExpressionStatement > CallExpression[callee.property.name=/^mock(ResolvedValue|RejectedValue|Implementation|ReturnValue)/]',
          message:
            'cmn-0335: Program 直下でモックの戻り値を仕込まない（resetMocks で毎テスト剥がれ、実行されない死んだ設定になる）。beforeEach かテスト内で設定する。',
        },
      ],
    },
  },
  // fil-0157 (criteria 3): files.service.ts 限定で「対象が見つかりません」系文言の直書きを禁止する。
  // 単件 404 の文言は SINGLE_TARGET_NOT_FOUND_MESSAGE 定数へ集約済み（fil-0154 / ADR 0066）だが、
  // 揺り戻しが 2 回起きたため機械で止める。射程は 2 系統: (a) 例外コンストラクタへリテラルを直接
  // 渡す形 (b) 共通の可視性確認ヘルパ（assertFolderAccessible 等）へリテラルを渡す形。移動系のみ
  // fil-0155 の裁定（移動元/移動先の区別は利用者に必要）で例外許可し、理由つき disable を置く。
  // 変数経由（sourceNotFoundMessage 等）は検出できない＝本ルールは退行の抑止であって証明ではない
  // （定数の参照が別の定数へ差し替わる等の変形は検知外。文言の完全性は spec のピンで担保する）。
  {
    files: ['src/modules/files/files.service.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='NotFoundException'] > Literal",
          message:
            'fil-0157: 「見つかりません」系の文言を直書きしない（SINGLE_TARGET_NOT_FOUND_MESSAGE 定数を使う・fil-0154 / ADR 0066）。移動系は fil-0155 の裁定で例外（eslint-disable-next-line + 理由参照）。',
        },
        {
          selector:
            'CallExpression[callee.property.name=/^assertFolder(Accessible|Visible)$/] > Literal',
          message:
            'fil-0157: 可視性確認ヘルパへ「見つかりません」系の文言をリテラルで渡さない（定数参照を使う・fil-0154 / ADR 0066）。移動系は fil-0155 の裁定で例外（eslint-disable-next-line + 理由参照）。',
        },
      ],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
];
