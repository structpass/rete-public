# 第三者素材・依存パッケージ

Reteの [LICENSE.md](./LICENSE.md) はRete自身のコードについての利用条件です。以下の第三者素材・パッケージの許諾を置き換えません。

## フォントとアイコン

| 素材           | 利用箇所・取得方法                           | 出所・ライセンス原文                                                                                               |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Geist          | アプリのレイアウト、`next/font/google`       | [Google Fonts / Geist / SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/geist/OFL.txt)                  |
| Noto Sans JP   | アプリと構想スライド、Next.js / Google Fonts | [Google Fonts / Noto Sans JP / SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/notosansjp/OFL.txt)      |
| Noto Serif JP  | 構想スライド、Google Fonts CSS               | [Google Fonts / Noto Serif JP / SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/notoserifjp/OFL.txt)    |
| JetBrains Mono | 構想スライド、Google Fonts CSS               | [Google Fonts / JetBrains Mono / SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/jetbrainsmono/OFL.txt) |
| Lucide         | アプリのアイコン、`lucide-react`依存         | [Lucide / ISC・一部アイコンのMIT表示](https://github.com/lucide-icons/lucide/blob/main/LICENSE)                    |

フォントファイルを含む配布物には、取得した版の著作権表示とOFL原文を同梱してください。改変時は原文のReserved Font Name等の条件も確認してください。Lucideを含む配布物には、使用する版のLICENSEにある著作権・許諾表示を保持してください。

ソースの公開スナップショットにはフォントバイナリや写真素材を同梱しません。Next.jsのビルド時にはフォントが取得・生成され、構想スライドはGoogle Fontsへ接続します。オフラインでは取得できない場合があります。

## npm依存パッケージ

依存の名前・用途区分は下記manifest、解決された版は [pnpm-lock.yaml](./pnpm-lock.yaml) が正本です。公開ソースに `node_modules` は同梱しません。

| 正本                                                      | 主な依存の用途                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [frontend/package.json](./packages/frontend/package.json) | Next.js / React、Tiptap、DnD Kit、Lucide、フォーム・QRコード・描画・HTMLサニタイズ等           |
| [backend/package.json](./packages/backend/package.json)   | NestJS、Prisma、PostgreSQLセッション、OIDC・認証・暗号化、SMTP、アップロード、HTMLサニタイズ等 |
| [shared/package.json](./packages/shared/package.json)     | 共有型・ユーティリティのビルドと検査ツール                                                     |
| [ルートpackage.json](./package.json)                      | pnpmワークスペース、TypeScript、静的解析・検査ツール、依存のoverride                           |

各パッケージのLICENSE・NOTICE・著作権表示は、インストールされた**該当版**とその上流リポジトリで確認してください。間接依存も含め、ビルド成果物・コンテナ等を別途許諾の下で提供するときは、その配布物に実際に含まれる依存の必要表示を保持してください。この索引は配布物全体の権利審査・許諾取得を保証するものではありません。

## 文章・サンプルデータ

構想スライドとドキュメントはReteの説明資料、seedとE2Eは評価・検証用のサンプルです。サンプルの人物・組織名、添付ファイル名を実在の利用者データとして扱わないでください。外部の文章・画像等を追加する場合は、出所・該当する利用条件・必要な表示をここへ追加し、条件が分からない素材を公開物へ含めないでください。
