import type { DisplayPreferenceDto } from '@rete/shared';
import type { AccountSummaryDto } from './dto/account-response.dto';
import type { DeskPreferenceDto } from './dto/desk-preference.dto';
import type {
  AccountSummary,
  DeskPreferenceRow,
  DisplayPreferenceRow,
} from './repositories/accounts.repository';

/**
 * Account Entity → 担当者サマリ DTO（§1 DTO 境界・純粋関数）。
 * id + 表示名のみに絞る（email / role / passwordHash 等は repository select 段階で既に除外済）。
 */
export function toAccountSummary(a: AccountSummary): AccountSummaryDto {
  return {
    id: a.id,
    name: a.name,
  };
}

/** DeskPreference row → DTO（§1 DTO 境界・純粋関数 / rete-desk-0142）。 */
export function toDeskPreference(p: DeskPreferenceRow): DeskPreferenceDto {
  return {
    leftPaneRatio: p.leftPaneRatio,
  };
}

/** DisplayPreference row → DTO（§1 DTO 境界・純粋関数 / mdl-0022）。 */
export function toDisplayPreference(p: DisplayPreferenceRow): DisplayPreferenceDto {
  return {
    stripeEnabled: p.stripeEnabled,
    stripeColor: p.stripeColor,
  };
}
