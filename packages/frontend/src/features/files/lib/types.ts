/**
 * File タブ（① 見た目シェル）の view 型。
 *
 * 本フェーズは backend を持たず、サンプルデータ（sample-data.ts）をこの型経由で hook に流す。
 * 後続フェーズ（FB: backend 実挙動）でこの view 型を Response DTO に差し替える境界とする
 * （architecture-invariants §1 DTO 境界の準備）。version / size / updatedBy 等の表示フィールドは
 * 後で破壊的変更にならないよう、サンプル段階から型に含めておく。
 */

export type FileKind = 'folder' | 'file';

/** パンくず 1 セグメント（ルート→対象の順・id 付きで祖先へ直接遷移できる）。 */
export interface FolderCrumb {
  id: string;
  name: string;
}

/** ファイルへ付与された 1 タグの表示形（rete-files-0006・一覧のタグ列で使う）。 */
export interface FileTagView {
  id: string;
  name: string;
  /** lucide アイコン名（@rete/shared TAG_ICONS のいずれか）。tag-icons の registry で描画する。 */
  icon: string;
  /** 色名（@rete/shared TAG_COLORS のいずれか / rete-files-0021/0022）。TAG_COLOR_HEX で着色する。 */
  color: string;
}

/** 一覧の 1 行（フォルダ または ファイル）。 */
export interface FileItem {
  kind: FileKind;
  name: string;
  /** backend エンティティ id（folder=フォルダ id / file=ファイル id・ダウンロードに使う）。 */
  id?: string;
  /** フォルダの遷移先 folder id（folder のみ・id と同値）。file は未設定。 */
  fid?: string;
  /** ファイルの版数（後続 FB: 版管理）。folder は未設定。 */
  versionNo?: number;
  /** 更新者表示名（全 entity の updatedBy 規約に統一）。 */
  updatedBy: string;
  /** 更新日時表示（サンプルは整形済み文字列。後続 FB: ISO → 整形）。 */
  updatedAt: string;
  /** ファイルサイズ表示（後続 FB: バイト数 → 整形）。folder は未設定。 */
  size?: string;
  /** 付与タグ（rete-files-0006・folder は空配列。未設定は空配列扱い）。 */
  tags?: FileTagView[];
}

/** 1 フォルダの中身（パンくず + 直下の項目）。 */
export interface FolderContent {
  name: string;
  /** ルートから対象フォルダまでのパンくず（対象自身を末尾に含む・祖先クリックで遷移）。 */
  crumb: FolderCrumb[];
  items: FileItem[];
}

/** ロケーションのツリー 1 ノード（フラットリスト + level でインデント表現）。 */
export interface TreeNode {
  fid: string;
  level: number;
  name: string;
}

/**
 * 横断検索の 1 ヒット（rete-files-0004・ツリー先頭「検索結果」フォルダ内の項目）。
 * 表示 + D&D 移動に必要な最小フィールドのみ持つ（移動先はドロップ先フォルダで決まるため移動元 path は不要）。
 */
export interface SearchResultItem {
  kind: FileKind;
  /** entity id（folder=フォルダ id / file=ファイル id）。移動 API に渡す。 */
  id: string;
  name: string;
  /** 現在の親フォルダ id（folder=親・ルート直下は null / file=所属フォルダ id）。同一フォルダへの無駄移動回避に使う。 */
  parentFolderId: string | null;
}

/** ソート可能な列。 */
export type SortKey = 'name' | 'kind' | 'updatedBy' | 'updatedAt';
export type SortDir = 'asc' | 'desc';

/** 共有オーバーレイに挿入するパス付きリンク（spec §6.2 構造参照のサンプル表現）。 */
export interface PathLink {
  kind: FileKind;
  /** 種別ラベル（'フォルダ' / 'ファイル'）。 */
  label: string;
  /** パンくず付きのフルパス文字列（例: '中央倉庫PJ ＞ 受入オペレーション ＞ 在庫アラート検討'）。 */
  path: string;
}

/** 共有オーバーレイの宛先種別（チャット / タスク）。 */
export type ShareTarget = 'chat' | 'task';

/**
 * お気に入りファイル編集オーバーレイ（FF・rete-files-0026）の対象。
 * Home のお気に入り★（/files?fileId=）から解決した 1 ファイルを指す。所属フォルダ（folderId）は
 * 編集オーバーレイ自体では使わず deep link 時の遷移にのみ要るため、本型には載せない（fetchFileMeta が別に返す）。
 */
export interface FileEditTarget {
  id: string;
  name: string;
  /** 最新版番号（実体未保存は null）。 */
  versionNo: number | null;
}
