/**
 * ファイルタグ（分類マスタ）の共有型（rete-files-0006 / SSOT）。
 * タグは「名前（任意文字列）＋アイコン（lucide 名）」のマスタで、ファイルへ多対多で付与する。
 * backend の DTO / バリデーションと frontend のマスタ UI・一覧表示が本定義を import して使う（§5 shared 型整合）。
 */

/**
 * タグに使える lucide アイコン名の許可サブセット。任意アイコン名の自由保存を避け、
 * backend が `@IsIn` で強制し frontend のアイコンレジストリ（tag-icons.ts）が同じ集合を描画する SSOT。
 * 値は lucide-react のコンポーネント名（PascalCase）と一致させる。
 */
export const TAG_ICONS = [
  'Tag',
  'Star',
  'Flag',
  'Bookmark',
  'Heart',
  'Bell',
  'Pin',
  'Award',
  'Briefcase',
  'Folder',
  'FileText',
  'Hash',
  'Zap',
  'AlertCircle',
  'CheckCircle',
  'Circle',
  'Clock',
  'Calendar',
  'Clipboard',
  'Lock',
  'Key',
  'Eye',
  'Rocket',
  'Target',
] as const;

/** 許可アイコン名のリテラル union（TAG_ICONS の要素型）。 */
export type TagIconName = (typeof TAG_ICONS)[number];

/**
 * タグに使える色名の許可集合（rete-files-0021/0022 / SSOT）。
 * 自由 hex の保存を避け、backend が `@IsIn` で強制し frontend のカラーレジストリ（tag-icon.tsx）が
 * 同じ集合を hex へ写す（§5 shared 型整合）。値は Tailwind 系の色名（小文字）に揃える。
 * 一覧ではアイコンのみ表示（rete-files-0010）するため、色がタグ識別の主役になる。
 */
export const TAG_COLORS = [
  'slate',
  'red',
  'orange',
  'amber',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'violet',
  'pink',
  'rose',
] as const;

/** 許可色名のリテラル union（TAG_COLORS の要素型）。 */
export type TagColorName = (typeof TAG_COLORS)[number];

/** 色未指定（既存タグ / 旧データ）のフォールバック色名。 */
export const TAG_COLOR_DEFAULT: TagColorName = 'slate';

/** タグ名の最大長（一覧チップ・マスタ表示が破綻しない範囲）。 */
export const TAG_NAME_MAX_LEN = 30;

/** タグ 1 件の Response 形（マスタ一覧・ファイル行のタグ表示で共通）。 */
export interface TagDto {
  id: string;
  name: string;
  /** lucide アイコン名（TAG_ICONS のいずれか）。 */
  icon: string;
  /** 色名（TAG_COLORS のいずれか / rete-files-0021/0022）。 */
  color: string;
  /** archivedAt 非 null を畳んだ計算値（fil-0094・AnnouncementTagDto と同型）。生の archivedAt は公開しない。 */
  archived: boolean;
}
