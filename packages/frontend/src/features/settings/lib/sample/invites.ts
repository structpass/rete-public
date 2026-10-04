import type { SettingTone } from '../types';
import type { InviteStatus } from '@rete/shared';

/**
 * 招待管理画面のラベル/トーン定数（@rete/shared の InviteStatus に準拠）。
 * SAMPLE_INVITES / InviteRow / 旧 InviteStatus（小文字）は ST-5 Phase 2 配線で撤去済み。
 * 旧小文字型（'pending' | 'expired'）との差分: キーを大文字化 + 'ACCEPTED' を追加。
 */

/** 状態ラベルマップ（管理画面表示用）。 */
export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  PENDING: '招待中',
  ACCEPTED: '受諾済み',
  EXPIRED: '期限切れ',
};

/** 状態 → バッジ tone マップ。 */
export const INVITE_STATUS_TONE: Record<InviteStatus, SettingTone> = {
  PENDING: 'blue',
  ACCEPTED: 'teal',
  EXPIRED: 'orange',
};
