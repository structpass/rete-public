# NOTICE

本リポジトリは **PolyForm Free Trial License 1.0.0**（source-available）で公開されています。

- **できること**: 特定の用途に適するかを評価するための、連続32暦日未満の利用・変更（[LICENSE.md](./LICENSE.md) 参照）
- **このライセンスで許諾しないこと**: 評価以外の利用、評価期間を超える利用、再配布。別途許諾・商用契約は窓口へご相談ください。

この説明は原文の要約で、許諾の範囲は [LICENSE.md](./LICENSE.md) が正本です。第三者の依存パッケージやフォントには、それぞれのライセンスが適用されます（[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)）。

商用利用・導入のご相談は [contact@structpass.com](mailto:contact@structpass.com) へご連絡ください。脆弱性・情報漏洩の報告方法は [SECURITY.md](./SECURITY.md) を参照してください。

## 評価用の既定資格情報について

シードデータとE2Eテストには、管理者・デモユーザーの評価用資格情報が含まれます。これらは公開情報で、実運用の秘密として使えません。

共有環境・外部公開へ移す**前**に、次を確認してください。

- `SEED_ADMIN_PASSWORD` と `SEED_DEMO_PASSWORD` を自分の環境の強い値へ変更し、既存の評価アカウントも変更・無効化する。seedの再実行だけでは既存パスワードは変更されません。
- DBパスワード、`SESSION_SECRET`、`OIDC_COOKIE_KEYS`、OIDC署名鍵、MFA暗号鍵、連携トークン、SMTP資格情報を環境ごとに用意する。雛形・公開fixture・別環境の値を流用しない。
- DB、開発用メール、開発サーバーのポートを不用意に外部へ公開しない。本番では `NODE_ENV=production`、HTTPS、接続先URLと認可を確認する。
- 実際の `.env`、秘密鍵、トークン、利用者のデータやログをGitへ追加しない。脆弱性や漏洩の報告は [SECURITY.md](./SECURITY.md) に従う。
