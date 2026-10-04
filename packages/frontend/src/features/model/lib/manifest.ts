import type { ModelCategory, ModelTheme } from '../types';

/** サイドバー第1階層の表示順。 */
export const MODEL_CATEGORIES: ModelCategory[] = [
  { key: 'ui', label: 'UI共通' },
  { key: 'api-data', label: 'API・データ共通' },
  { key: 'naming', label: '用語・命名' },
  { key: 'structure', label: '画面構造・モデル概念' },
  { key: 'ui-component', label: 'UIコンポーネント' },
  { key: 'screen-composition', label: '画面構成' },
];

export interface ManifestGroup {
  category: ModelCategory;
  themes: ModelTheme[];
}

/**
 * テーマ配列を MODEL_CATEGORIES 順にグルーピングする（純関数・サイドバー駆動用）。
 * テーマの 0 件なカテゴリは出さない。各カテゴリ内はテーマ配列の登録順を保つ。
 */
export function buildManifest(themes: ModelTheme[]): ManifestGroup[] {
  return MODEL_CATEGORIES.map((category) => ({
    category,
    themes: themes.filter((t) => t.category === category.key),
  })).filter((group) => group.themes.length > 0);
}

/** id でテーマを引く（URL ハッシュ / 初期選択の解決）。見つからなければ null。 */
export function findTheme(themes: ModelTheme[], id: string | null | undefined): ModelTheme | null {
  if (!id) return null;
  return themes.find((t) => t.id === id) ?? null;
}
