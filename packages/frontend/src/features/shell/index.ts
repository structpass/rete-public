// 外部（app ルート）が使うのは AppShell のみ。タブ/お気に入り定義・resolveTabs は
// feature 内（app-shell / app-header / spec）から直接 import する（barrel に出さない）。
export { AppShell } from './components/app-shell';
// ★トグル（HM-1-4）は各タブ（files / desk）が現在コンテキストを★化するために横断利用する。
export { FavoriteToggle, type FavoriteTarget } from './components/favorite-toggle';
// 共有お気に入り state（HM-1-4 一括登録）。files ツールバーの複数選択登録が重複判定 + add に使う。
export { useFavoritesContext } from './hooks/favorites-context';
