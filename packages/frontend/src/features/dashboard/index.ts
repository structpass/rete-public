// hom-0077: 共通シェル（AppShell・タグ管理オーバーレイ）は app/hub/layout.tsx が保持する。
// 外部（app ルート）は DashboardView を直接 import する（旧 HubView は廃止）。
// 通知未読カウント共有 state（HM-3・ADR 0029）。Provider はシェル（AppShell）が mount し、
// バッジ（AppSidebar）が hook で参照する。
export {
  AnnouncementUnreadProvider,
  useAnnouncementUnread,
} from './hooks/announcement-unread-context';
// お知らせタグマスタの board/faq 共有インスタンス（hom-0074）。Provider はシェル（AppShell）が mount し、
// タグ管理タブ付きオーバーレイ（hom-0074）・HubView（hom-0073 で kind 対応後）が hook で参照する。
export {
  AnnouncementTagMasterProvider,
  useAnnouncementTagMasterContext,
} from './hooks/announcement-tag-master-context';
