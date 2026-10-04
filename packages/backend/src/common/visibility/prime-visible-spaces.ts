/**
 * 対象取得より先に可視範囲（可視 Space 集合）の解決を通す（存在秘匿の応答コスト平準化・v2-259）。
 *
 * v2-254 で 404 の status と message はモジュール間で揃ったが、応答時間は揃っていなかった:
 * 「対象が存在しない」枝は対象取得 1 回で 404 を返すのに対し、「存在するが非可視」の枝は対象取得に
 * 加えて可視範囲の解決（複数クエリ）を通ってから 404 を返すため、応答時間から対象の存在を読み分けられた
 * （timing oracle）。対象取得の前に本ヘルパで解決を済ませると、以降の assertSpaceVisibleOr404 は
 * ScopeVisibilityService の RequestCache（同一リクエスト・同一 accountId で 1 回だけ実行）から同じ結果を
 * 受け取るため、不在の枝も非可視の枝も「可視範囲 1 回 + 対象取得 1 回」の同一コストになる
 * （v2-255 の chat / fil-0146 の files と同じ型＝可視範囲を対象取得より先に解決する）。
 *
 * 可視性の判定主体・判定結果はガードのままで、accountId 未指定（内部経路）のスキップ契約も同じ。
 * 併せて対象取得は「同梱なしの軽い取得」で行うこと（行が在るときだけ同梱クエリが走る形は、対象の実在を
 * クエリ本数の差として漏らす。呼び出し側 service の責務）。
 */
export interface SpaceVisibilityResolver {
  resolveVisibleSpaceIds(accountId: string): Promise<string[]>;
}

export async function primeVisibleSpaces(
  guard: SpaceVisibilityResolver,
  accountId: string | undefined | null,
): Promise<void> {
  // accountId 未指定（内部経路）はガード側と同じく検証をスキップする。
  if (accountId === undefined || accountId === null) return;
  await guard.resolveVisibleSpaceIds(accountId);
}
