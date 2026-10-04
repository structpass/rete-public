import type { ModelTheme } from '../types';
import { UI_THEMES } from './ui';
import { API_DATA_THEMES } from './api-data';
import { NAMING_THEMES } from './naming';
import { STRUCTURE_THEMES } from './structure';
import { UI_COMPONENT_THEMES } from './ui-components';
import { SCREEN_COMPOSITION_THEMES } from './screen-composition';

/**
 * モデルタブの共通仕様カタログ「正本」（rete 固有）。
 *
 * rete 固有の共通仕様はここが唯一のソース。開発エージェントは実装前にこの content/*.ts を Read し、
 * 画面（ModelView）はこの同じ配列を描画する（ソース1・消費者2 ＝ 揺れの自己防止）。
 * 全PJ横断のグローバル規約（architecture-invariants）はここへ移さず、各テーマの
 * compliesWith から参照する（A案 / ADR 0041）。
 */
export const MODEL_THEMES: ModelTheme[] = [
  ...UI_THEMES,
  ...API_DATA_THEMES,
  ...NAMING_THEMES,
  ...STRUCTURE_THEMES,
  ...UI_COMPONENT_THEMES,
  ...SCREEN_COMPOSITION_THEMES,
];
