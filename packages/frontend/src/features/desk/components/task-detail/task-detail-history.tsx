'use client';
import type { useTaskDetailController } from '@/features/desk/hooks/use-task-detail-controller';
import { formatDateTime } from '@/lib/utils';
type Props = Pick<
  ReturnType<typeof useTaskDetailController>,
  'activitiesTruncated' | 'activitiesError' | 'historyRows'
>;
export function TaskDetailHistory({ activitiesTruncated, activitiesError, historyRows }: Props) {
  return (
    <div className="desk-pane-body" data-detail-tabpanel="history">
      {/* dsk-0270: 3列見出し（日時/実行者/変更内容）を「変更履歴」の単一ラベルへ変更。 */}
      <div className="desk-ticket-history-header">変更履歴</div>
      {/* dsk-0286: 取得失敗の可視化（useTaskActivities は last-good 保持規約のため activities/truncated は
                    リセットせず、error のみ独立に注記する）。コメント側 966-970 と同型（role="alert" + 赤系）。 */}
      {activitiesError && (
        <p role="alert" className="desk-ticket-history-error">
          {activitiesError}
        </p>
      )}
      {/* dsk-0228: backend の取得上限（最新200件）で古い側が切れた時だけ注記を出す。
                    履歴は昇順表示のため切れるのはリスト先頭（古い側）＝注記はヘッダ直下に固定表示する。 */}
      {activitiesTruncated && <p className="desk-ticket-history-truncated">最新200件まで表示</p>}
      <ul className="desk-ticket-history">
        {historyRows.map((row, i) => (
          <li key={i} className="desk-ticket-history-item">
            {/* dsk-0270: 2段構成（上段=タイムスタンプ+実行者の横並び / 下段=変更内容）。 */}
            <div className="desk-ticket-history-meta">
              <span className="desk-ticket-history-time">{formatDateTime(row.time)}</span>
              <span className="desk-ticket-history-actor">{row.actor}</span>
            </div>
            <span className="desk-ticket-history-text">{row.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
