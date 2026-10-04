// Hub の旧 UI（カードリンク集）は掲示板ダッシュボード（features/dashboard + features/shell）へ移行済み。
// menu API（fetchHubMenu）は共通シェルの「システム」タブ（reference 連携）解決に再利用する。
export { fetchHubMenu, type HubMenu, type HubMenuItem } from './lib/api';
