/**
 * Hub 画面のメニュー shape（SSOT・cmn-0211）。現状は静的カタログ（DB テーブルは持たない）。
 * 将来 membership / role でフィルタする余地を残すが、先回りのテーブルは作らない。
 *
 * backend の DTO 境界型と frontend の API 契約型は本定義を import した別名として置き、
 * 同じ形を二度書かない（§5 shared 型整合）。
 */

/** rete=Rete 自身の機能 / system=外部システム連携（OIDC RP 経由で遷移）。 */
export type HubMenuCategory = 'rete' | 'system';

/** internal=Rete 内の画面遷移 / external=外部 URL への遷移。 */
export type HubMenuItemType = 'internal' | 'external';

/** Hub メニュー 1 件（GET /hub/menu）。 */
export interface HubMenuItemDto {
  key: string;
  label: string;
  description: string;
  category: HubMenuCategory;
  type: HubMenuItemType;
  href: string;
  /** その導線が現時点で利用可能か（未接続のシステムは frontend 側で「準備中」表示にできる）。 */
  available: boolean;
}

/** Hub メニュー全体（GET /hub/menu のレスポンス）。 */
export interface HubMenuDto {
  items: HubMenuItemDto[];
}
