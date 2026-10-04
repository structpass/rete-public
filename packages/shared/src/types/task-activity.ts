/**
 * タスク属性変更の監査ログ（dsk-0223 系）の共有型（SSOT・cmn-0211）。
 *
 * backend の DTO / repository と frontend の履歴タブが本定義を import して使う（§5 shared 型整合）。
 * 集約前は backend の union（11 種）と frontend の union（6 種）が別々に書かれ、frontend 側だけ
 * 古いまま気づけない状態だった（しかも `TaskActivityField | string` で型チェックを無効化していた）。
 */

/**
 * 監査ログの変更フィールド種別（dsk-0225 / dsk-0246 / dsk-0269）。DB の CHECK 制約
 * （task_activities_field_check・マイグレ 20260624060000_add_task_activity_field_check ＋
 *  20260627100000_add_task_activity_outcome_thread ＋ 20260703093500_add_task_activity_comment_add_edit）
 * が強制する許容値集合と 1:1 に対応させる。
 *
 * **値を追加する時に揃える箇所（cmn-0211 で集約後）**: 本 union / DB の CHECK 制約 / schema コメント /
 * frontend の表示文（formatActivityText・必要なら ACTIVITY_FIELD_LABELS）の 4 点。
 * backend DTO・frontend API 型は本 union の別名になったため個別の追随は不要。
 * リテラル union にしておくことで CHECK 更新漏れをコンパイル時に拾える。
 *
 * **表記の制約**: `scripts/check-constraint-drift.mjs` が本 union を正規表現
 * （`export type TaskActivityField =` に続くリテラル並び）で読み、CHECK 制約との値集合ズレを CI で落とす。
 * ファイル path・型名・「リテラルを `|` で並べる」表記のいずれかを変える時は同スクリプト
 * （TASK_ACTIVITY_FIELD_PATH と codeLabel）も併せて直す（as const 配列へ変えると検査が throw する）。
 */
export type TaskActivityField =
  | 'status'
  | 'category'
  | 'assignee'
  | 'startDate'
  | 'dueDate'
  | 'parent'
  | 'space'
  // dsk-0246: 顛末（tenmatsu）更新 / スレッド（起点カード=題名・説明）更新。属性 from/to を持たない
  // 「更新が起きた」事実のみの記録（fromLabel/toLabel は null）。表示文は frontend formatActivityText が固定文へ写す。
  | 'outcome'
  | 'thread'
  // dsk-0269: スレッドへのコメント追加 / コメント編集。toLabel に本文抜粋（HTML タグ除去済み・先頭140字+…）を
  // 持ち、frontend formatActivityText が「メッセージを追加：<抜粋>」「メッセージを編集：<抜粋>」へ写す。
  | 'commentAdd'
  | 'commentEdit';

/** 操作者は Account へ正規化済。レスポンスでは id + 表示名のみ公開（email 等は出さない・§1 DTO 境界）。 */
export interface TaskActivityActorDto {
  id: string;
  name: string;
}

/**
 * タスク属性変更の監査ログ 1 件（GET /tasks/:id/activities・createdAt 昇順）。
 * fromLabel/toLabel は書込時に解決済みの表示ラベル（スナップショット方針・null=未設定）。
 * actor は操作者 Account 削除後（SetNull）に null になりうる（記録自体は保全される）。
 */
export interface TaskActivityDto {
  id: string;
  /** 親タスク id（Task.id は autoincrement int）。 */
  taskId: number;
  field: TaskActivityField;
  fromLabel: string | null;
  toLabel: string | null;
  actor: TaskActivityActorDto | null;
  /** 記録日時（ISO 8601）。 */
  createdAt: string;
}

/**
 * GET /tasks/:id/activities のレスポンス（dsk-0228）。data を配列でなく本型に包む。
 * truncated: 取得上限（LIST_BY_TASK_LIMIT）で古い側が切り落とされた時のみ true。監査ログは
 * 「変更の全履歴」を期待されるため、無音で欠けるのでなく履歴タブが注記を出せるようにする。
 * ページング meta（total/page/limit）を流用しないのは、総件数カウントの追加クエリを持たず
 * ページング意味論を偽らないため（正直な最小形）。cursor pagination への拡張は別途判断。
 */
export interface TaskActivityListDto {
  activities: TaskActivityDto[];
  truncated: boolean;
}
