/**
 * モデルタブ（rete 固有共通仕様カタログ）の型定義。
 *
 * 設計方針: rete 固有の共通仕様の「正本」をこのフィーチャ配下の型付きコンテンツとして持ち、
 * 開発エージェントは実装前に content/*.ts を Read し、画面は同じ配列を描画する（ソース1・消費者2）。
 * Markdown エンジンは持ち込まず（CSP `script-src` が eval なし / 新規依存回避 / 全環境バンドル同梱）、
 * 構造化ブロックの union を固定 JSX で描画する。詳細は ADR 0041。
 */

/** サイドバー第1階層のカテゴリキー。 */
export type ModelCategoryKey =
  | 'ui'
  | 'api-data'
  | 'naming'
  | 'structure'
  | 'ui-component'
  | 'screen-composition';

export interface ModelCategory {
  key: ModelCategoryKey;
  label: string;
}

/** テーマの整備状態。active=正本記述あり / stub=枠のみ（監視軸の要約＋後追い整理）。 */
export type ThemeStatus = 'active' | 'stub';

/** 本文ブロック。Markdown を使わず構造化ブロックの union を固定描画する。 */
export type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'code'; code: string }
  | { type: 'note'; text: string }
  /**
   * 実描画見本（mdl-0011）。demo は components/demos の registry キー。
   * スクショ静止画でなく実物コンポーネントをその場に描画するため、実装改修に自動追随する。
   */
  | { type: 'demo'; demo: string; caption?: string };

/**
 * 適用例/アンチパターンの1項目。UI 系カテゴリ（ui / ui-component）の active テーマは
 * demo（実描画見本）必須 — manifest.test がこのルールを機械強制する（mdl-0011）。
 * 非視覚カテゴリ（naming 等）は文字列のままでよい。
 */
export type ThemeExample = string | { text: string; demo?: string };

/** 準拠先 / 関連ADR などの参照。href があればリンク（外部は別タブ）、無ければテキスト参照。 */
export interface ThemeRef {
  label: string;
  href?: string;
}

export interface ModelTheme {
  /** URL ハッシュ・サイドバーキーに使う安定 slug。 */
  id: string;
  title: string;
  /**
   * サイドバーメニュー表示用の短縮名（任意）。未指定なら title をそのまま使う。
   * title が長く 2 行折返しするテーマだけ単行に収まる短縮名を持たせる（rete-model-0001）。
   * 本文 h2 見出しは title（正本の詳細名）を使い続けるため、メニューだけ短縮しても情報は失われない。
   */
  navLabel?: string;
  category: ModelCategoryKey;
  status: ThemeStatus;
  /** サイドバー副文・ヘッダ要約の1行。 */
  summary: string;
  /** 正本移管元（例: 'memory: feedback-button-color-convention' / 'CLAUDE.md' / 'ADR 0037'）。 */
  sources: string[];
  /** 目的（なぜこの規約があるか・揺れると何が困るか）。 */
  purpose: string;
  /** 仕様（守るべき規範本文）。 */
  spec: ContentBlock[];
  /** 挙動（インタラクション・状態遷移）。該当時のみ。 */
  behavior?: ContentBlock[];
  /** デザイン（トークン値・サンプル）。該当時のみ。 */
  design?: ContentBlock[];
  /** 準拠先（上位グローバル規約など）。 */
  compliesWith?: ThemeRef[];
  /** 関連ADR（この規約からの差分・例外の記録）。 */
  relatedAdr?: ThemeRef[];
  /** 適用例 / アンチパターン。 */
  examples?: { good?: ThemeExample[]; bad?: ThemeExample[] };
}
