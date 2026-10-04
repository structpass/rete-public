// cmn-0395: e2e 用にレート制限（@nestjs/throttler）を素通しするかどうかの判定。
//
// 背景: e2e 通し実行が login 系の窓口ごとのレート制限（5 req / 60s・auth.controller.ts の @Throttle）
// で毎回 3 件落ちていた。テスト側はプレースホルダや口の分散で避ける試みをしていたが、予算の実体が
// 破れるたびに落ちる構造だった（cmn-0395 起票本文）。開発機ではレート制限を素通しし、本番では
// 効き続けるようにする。
//
// 判定式: `NODE_ENV !== 'production' && E2E_THROTTLE_BYPASS === 'true'`。
// - NODE_ENV は起動時に env-validation.ts が検証済み（未設定・未知値は throw）なので、本番判定は
//   信頼できる。本番では env を立てても素通ししない（criteria 3）。
// - E2E_THROTTLE_BYPASS は任意・既定 false（criteria 4: 立てない限り従来どおり効く）。
// - **process.env はリクエスト時に読む**（関数を呼ぶたびに評価）。クロージャ生成時にスナップショット
//   しない＝起動後に env を入れても反映される（開発サーバーの自動再起動にも影響しない・criteria 8）。
//
// この判定は @nestjs/throttler の skipIf へ渡す。skipIf は route/class の limit・ttl 読み取りより
// 前に評価されるため、@Throttle で個別指定された窓口（login 5/60s 等）も素通しできる
// （grounding 7・node_modules/@nestjs/throttler/dist/throttler.guard.js:72-77）。
export function throttleBypassEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.E2E_THROTTLE_BYPASS === 'true';
}
