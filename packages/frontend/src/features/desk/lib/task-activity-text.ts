import type { TaskActivityField } from '@/features/desk/lib/api';

/**
 * 「項目名（変更前→変更後）を変更」形式で描く種別（＝下の固定文分岐に載らない残り全部）。
 * cmn-0211: TaskActivityField を shared へ集約したので、種別を増やした時に
 * ラベル表への追記漏れがコンパイルエラーになるよう Exclude で網羅を強制する。
 */
type LabeledActivityField = Exclude<
  TaskActivityField,
  'parent' | 'outcome' | 'thread' | 'commentAdd' | 'commentEdit'
>;

/**
 * 変更履歴の項目名ラベル（dsk-0223・backend TaskActivity.field キー → 表示名）。
 * 文面は「項目名（変更前→変更後）を変更」形式（開発統括指定 2026-06-23）。
 */
const ACTIVITY_FIELD_LABELS: Record<LabeledActivityField, string> = {
  status: 'ステータス',
  category: '分類',
  assignee: '担当者',
  startDate: '開始日',
  dueDate: '期日',
  space: 'Space',
};

/**
 * 監査ログ1行を表示文へ整形する。
 * 既定は「項目名（変更前→変更後）を変更」形式（開発統括指定 2026-06-23）。
 * fromLabel/toLabel が null（未設定）でも崩れないよう「未設定」へフォールバックする
 * （backend が「未分類」「未割当」等へ解決済みなら null は来ないが、二重に防御する）。
 *
 * 親（parent）だけは「親チケットNoを変更（{before}→{after}）」形式（dsk-0240・開発統括指定）。
 * backend が from/to を親チケットNo（= タスク id）文字列 or「なし」へ解決済みなので、そのまま挿す。
 */
export function formatActivityText(
  field: TaskActivityField,
  fromLabel: string | null,
  toLabel: string | null,
): string {
  if (field === 'parent') {
    return `親チケットNoを変更（${fromLabel ?? 'なし'}→${toLabel ?? 'なし'}）`;
  }
  // dsk-0345: outcome は backend が toLabel に本文抜粋を載せる（過去行・クリア時は null → 固定文）。
  // thread（起点カード）は dsk-0246 どおり固定文のまま（題名/説明複合で抜粋対象が一意でない）。
  if (field === 'outcome') return toLabel ? `顛末の更新：${toLabel}` : '顛末の更新';
  if (field === 'thread') return 'スレッドの更新';
  // dsk-0269: コメント追加/編集は backend が toLabel に本文抜粋（タグ除去・先頭140字+…）を載せて記録する。
  // 抜粋は表示時に加工せずそのまま挿す（欠損時のみ空で崩れないよう '' へフォールバック）。
  if (field === 'commentAdd') return `メッセージを追加：${toLabel ?? ''}`;
  if (field === 'commentEdit') return `メッセージを編集：${toLabel ?? ''}`;
  // LabeledActivityField = Exclude<TaskActivityField, 上の5分岐> なので型上は lookup が必ず成功し `?? field` は到達不能。
  // ただし古い frontend を新しい backend に当てた瞬間（配布タイミングのずれ）に backend 側で追加された field 名が
  // 来る可能性があり、その時に「undefined（未設定→未設定）を変更」と表示される事故を防ぐランタイム安全網として残す。
  // 撤廃は frontend / backend のロールアウト逆転が観測できる体制が整った時（cmn-0234）。
  const label = ACTIVITY_FIELD_LABELS[field] ?? field;
  return `${label}（${fromLabel ?? '未設定'}→${toLabel ?? '未設定'}）を変更`;
}
