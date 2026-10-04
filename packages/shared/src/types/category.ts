/**
 * カテゴリ（タスク分類マスタ）の Response 形（SSOT）。
 * backend の mapper（toCategoryResponse）が返す形であり、frontend の tasks / desk / files が本定義を
 * import して使う（§5 shared 型整合）。以前は backend DTO・tasks・files が各々ローカル型を持ち、files 版は
 * archived 欠落のドリフトを起こしていたため共通化した（FL レビュー由来の §3 負債返済）。
 *
 * archived は backend が archivedAt 非 null を畳んだ導出フラグ（rete-desk-0140）。生の archivedAt は公開しない。
 * Date 系（createdAt / updatedAt）は mapper で ISO 8601 文字列に変換済。
 */
export interface CategoryDto {
  id: number;
  name: string;
  // 所属する器（Space）の ID（rete-desk-0158）。分類は Space 単位スコープ。
  spaceId: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}
