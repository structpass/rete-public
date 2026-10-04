// lint-staged — コミット時に staged ファイルへ prettier --write を自動適用（cmn-0421）。
// 未整形コミットの再流入を機械的に止める。staged ファイルのみ対象＝並列セッションの
// 未ステージ作業ツリーに触れない（cmn-0343 の staging 思想と一致）。
// prettier は .prettierignore / .gitignore を尊重するため、生成物はここで除外しなくてよい。
export default {
  '*.{ts,tsx,mts,cts,mjs,cjs,js,jsx,json,jsonc,md,mdx,yml,yaml,css,scss,html,vue,graphql}': [
    'prettier --write',
  ],
};
