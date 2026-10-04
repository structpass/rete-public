// 外部（app ルート）が使うのは DeskPage（器スコープ Provider + ?spaceId= 取り込み済みの完成形）のみ。
// DeskShell / DeskSidebar は DeskPage 内部から組まれる（barrel には出さない）。
export { DeskPage } from './components/desk-page';
