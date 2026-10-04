import { AUDIT_ACTION_LABELS, AUDIT_ACTION_TYPES, type AuditActionType } from '@rete/shared';
import type { SettingTone } from './types';

/**
 * 操作ログ画面の表示メタ（本番）。ラベル（日本語）は @rete/shared AUDIT_ACTION_LABELS を SSOT とし、
 * バッジ配色 tone のみ frontend の表示要素としてここで対応づける（CSV と共有する必要が無いのは tone だけ）。
 * 旧サンプル（lib/sample/audit-log.ts）の OP_META を実データ用に移設したもの。
 */
const TONE_BY_ACTION: Record<AuditActionType, SettingTone> = {
  login: 'ink',
  logout: 'muted',
  create: 'teal',
  update: 'blue',
  delete: 'orange',
  read: 'muted',
  approve: 'teal',
  admin: 'orange',
};

/** 操作種別 → 表示ラベル + バッジ tone。 */
export const OP_META: Record<AuditActionType, { label: string; tone: SettingTone }> =
  Object.fromEntries(
    AUDIT_ACTION_TYPES.map((t) => [t, { label: AUDIT_ACTION_LABELS[t], tone: TONE_BY_ACTION[t] }]),
  ) as Record<AuditActionType, { label: string; tone: SettingTone }>;

/** 操作種別フィルタの選択肢（'' = すべて + 全種別）。 */
export const OP_OPTIONS: { value: AuditActionType | ''; label: string }[] = [
  { value: '', label: '操作: すべて' },
  ...AUDIT_ACTION_TYPES.map((t) => ({ value: t, label: AUDIT_ACTION_LABELS[t] })),
];
