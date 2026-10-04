/**
 * cmn-0336: e2e シナリオの `{{key}}` プレースホルダ解決（依存ゼロの単独モジュール）。
 *
 * 元は `steps/common.steps.ts` に置いていたが、あちらは import した時点で step 登録の副作用が
 * 走るため単体テストから直接触れない。`support/fixtures.ts` も playwright-bdd を import して
 * `createBdd` をモジュール直下で呼ぶので同じ。よって **playwright / playwright-bdd を一切
 * import しない** ここへ切り出した（単体テスト = `__tests__/placeholders.test.ts`）。
 *
 * `common.steps.ts` からは再 export しており、既存の外部参照（`steps/org-change.steps.ts` の
 * `resolvePlaceholders as resolveVars`）は無改修のまま通る。
 */

/**
 * 文字列内の `{{key}}` を `vars[key]` に置換する。path にも body 文字列にも同じ関数を使う。
 *
 * 置換対象が無いキーは `{{key}}` のまま残す（typo をシナリオ側の 404 / 400 で気づけるようにする
 * ための既存契約。空文字へ倒すと「たまたま通る URL」になり検出が効かなくなる）。
 *
 * キーの文法は `\w+` 限定。`{{a-b}}` や `{{a.b}}` は「未定義キー」ではなく**文法非対応**として
 * 素通りする（残った `{{a-b}}` を typo 検出の結果と読まないこと）。現行 feature のキーは全て
 * `\w+` に収まっている。
 */
export function resolvePlaceholders(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

/**
 * body を伴う When step 用。**path と body を必ず両方解決してから**リクエスト材料を返す。
 *
 * cmn-0336 以前は step ごとに解決を書いていたため、GET / POST / DELETE では効くのに
 * PATCH（path も body も）・PUT（path）・「id を記録する POST」（path）では効かない、という
 * 穴が空いていた。片方だけ解決する余地を残さないよう、body を伴う step の入口を
 * 1 回の呼び出しで両方を返すこの口へ寄せている（規律であって強制ではない＝新しい step が
 * `apiCtx.post(rawPath, ...)` と直に書く経路までは塞いでいない）。
 *
 * cmn-0394 項目 3: 置換の順序を「文字列置換 → JSON.parse」から「JSON.parse → 文字列値のみ置換」へ
 * 反転した。旧順序は、差し込む値に引用符 `"`・バックスラッシュ・波括弧が含まれると、その値が
 * 文字列リテラルを壊して JSON.parse が失敗する（or 意図しない構造になる）ため。新順序では parse
 * を先に済ませるので、差し込む値が何を含んでいても構造は壊れない。置換の適用対象は **string 値のみ**
 * （number / boolean / null はそのままの型で通す・オブジェクトのキー側は置換しない＝現行 feature に
 * キー側の `{{}}` は無く、範囲を広げない）。
 */
export function resolveRequest(
  path: string,
  bodyStr: string,
  vars: Record<string, string>,
): { path: string; body: Record<string, unknown> } {
  // parse を先に行い、後で string 値だけ差し替える。parse 結果が object でない場合は暗黙 cast せず
  // 明示的に拒否する（body は JSON オブジェクトが前提。配列 / プリミティブを黙って通さない）。
  const parsed: unknown = JSON.parse(bodyStr);
  if (Array.isArray(parsed) || parsed === null || typeof parsed !== 'object') {
    // typeof null === 'object' のため、null を先に弾いてから typeof で文言を出す（誤誘導を避ける）。
    const got = parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed;
    throw new Error(`resolveRequest: body は JSON オブジェクトである必要があります (got ${got})`);
  }
  return {
    path: resolvePlaceholders(path, vars),
    // parsed は object 検証済み（非配列）なので、トップレベルは Record に確定する。
    body: resolvePlaceholdersDeep(parsed, vars) as Record<string, unknown>,
  };
}

/** 入れ子の data を再帰的に辿り、**string 値のみ** resolvePlaceholders を適用する（cmn-0394 項目3）。 */
function resolvePlaceholdersDeep(
  value: unknown,
  vars: Record<string, string>,
): Record<string, unknown> | unknown[] | string | number | boolean | null {
  if (typeof value === 'string') return resolvePlaceholders(value, vars);
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholdersDeep(v, vars));
  if (value !== null && typeof value === 'object') {
    // キー側は置換しない（範囲を広げない・cmn-0394）。値側だけ再帰する。
    // `__proto__` キーは代入（out[k]=v）が Object.prototype の setter を踏んでプロトタイプを
    // 上書きし、キーが静かに欠落するため defineProperty で定義する（code-reviewer LOW 是正）。
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolvePlaceholdersDeep(v, vars);
      if (k === '__proto__') {
        Object.defineProperty(out, k, {
          value: resolved,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        out[k] = resolved;
      }
    }
    return out;
  }
  // number / boolean / null はそのまま（型を保存する・cmn-0394 criteria 3）
  return value as number | boolean | null;
}
