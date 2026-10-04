/**
 * 休眠中: frontend からの消費者は 0 件。本定義を import するのは backend の desk-groups REST
 * モジュール（これも休眠・残置）だけである。撤去しない判断と再検討条件は ADR 0079 を参照。
 *
 * Desk 個人タブの宛先グルーピング（dsk-0304・dsk-0305）の共有型・SSOT。
 *
 * 2階層構造: 宛先（DM相手/自分メモ・targetRef=Space.id）⊂ グループ ⊂ グループ分類。
 * backend の DTO / mapper が本定義を import して使う（§5 shared 型整合）。ネストはこの2階層限定
 * （グループ分類の下にグループ分類は作れない・グループの下にグループは作れない）。
 * SpaceKind.GROUP（Membership 経由の複数人チャットの器）とは別モデル・別データ。
 */

export interface DeskGroupClassificationDto {
  id: string;
  name: string;
  sortOrder: number;
}

export interface DeskGroupDto {
  id: string;
  name: string;
  /** 所属するグループ分類の ID（null=どのグループ分類にも属さない）。 */
  classificationId: string | null;
  sortOrder: number;
  /** 所属する宛先（Space.id）を sortOrder 昇順で並べた配列。 */
  memberRefs: string[];
}

/** GET /desk-groups のレスポンス形（グループ分類＋グループを一括取得）。 */
export interface DeskGroupTreeDto {
  classifications: DeskGroupClassificationDto[];
  groups: DeskGroupDto[];
}
