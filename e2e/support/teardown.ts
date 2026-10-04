/**
 * cmn-0408: teardown method 判定（依存ゼロの単独モジュール）。
 *
 * 元は `steps/common.steps.ts` の module private だったが、あちらは import した時点で
 * step 登録の副作用が走るため単体テストから直接触れない（placeholders.ts と同じ理由・cmn-0336）。
 * **playwright / playwright-bdd を一切 import しない** ここへ切り出した
 * （単体テスト = `__tests__/teardown.test.ts`）。
 */

/** PATCH archive で片付ける名指し資源（Delete エンドポイント無し） */
export const ARCHIVE_TEARDOWN_RESOURCES: ReadonlySet<string> = new Set([
  'organizations',
  'projects',
  'spaces',
]);

/**
 * POST 先 path に応じて teardown method を決定する（cmn-0365・判定を裏返し）。
 * - /api/v1/organizations|projects|spaces（裸の /api/v1/<resource> のみ）→ PATCH archive
 * - それ以外 → DELETE（実在する消し口へ倒す。知らないリソースが「黙ってアーカイブ」され
 *   teardown が静かに失敗する経路を塞ぐ＝消せない時は例外として表に出る）
 *
 * 名指しの照合は「/api/v1/ 直後のセグメントがちょうど 1 個」のときだけ行う（cmn-0408）。
 * 第 1 セグメント一致だけだと /api/v1/spaces/<id>/members のような入れ子 path も名指し側へ
 * 落ちてアーカイブが撃たれ、「静かな失敗」が同じ形で戻るため。入れ子は DELETE へ倒す。
 */
export function resolveTeardownMethod(urlPath: string): 'DELETE' | 'PATCH' {
  const segments = urlPath
    .replace(/^\/api\/v1\//, '')
    .split('/')
    .filter((s) => s !== '');
  return segments.length === 1 && ARCHIVE_TEARDOWN_RESOURCES.has(segments[0]) ? 'PATCH' : 'DELETE';
}
