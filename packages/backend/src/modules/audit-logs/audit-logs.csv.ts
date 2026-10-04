import type { AuditLogDto } from '@rete/shared';
import { AUDIT_ACTION_LABELS } from '@rete/shared';
import { toCsv } from '../../common/text/csv';

const HEADERS = [
  'ユーザー名',
  'メールアドレス',
  'システム名',
  '操作',
  '機能名',
  '内容',
  '実行元IP',
  '実行日時',
];

/**
 * 実行日時を JST（Asia/Tokyo）の 'YYYY/MM/DD HH:mm:ss' で整形する。サーバ TZ に依存せず、
 * 日本単一テナント前提の表示に合わせる（多 TZ 対応は将来の宿題）。
 */
function formatJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // en-CA は YYYY-MM-DD・24h。'/' 区切りへ整える。
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * 操作ログ DTO 配列 → CSV 文字列（UTF-8 BOM・RFC4180・formula injection 対策は共通 toCsv が担保）。
 * 操作種別は @rete/shared AUDIT_ACTION_LABELS で日本語ラベル化（frontend バッジと同一ラベル・§5 SSOT）。
 */
export function buildAuditLogsCsv(dtos: AuditLogDto[]): string {
  const rows = dtos.map((d) => [
    d.actorName,
    d.actorEmail,
    d.systemName,
    AUDIT_ACTION_LABELS[d.actionType],
    d.feature,
    d.summary,
    d.ipAddress ?? '',
    formatJst(d.createdAt),
  ]);
  return toCsv(HEADERS, rows);
}
