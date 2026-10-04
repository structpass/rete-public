import type { FileItem } from '../lib/types';
import { fileExt } from '../lib/format';

/**
 * ファイル / フォルダ種別アイコン（モック iconFor / FOLDER_FILLED / TREE_FOLDER_SVG 移植）。
 * 拡張子で色と形を出し分ける。色値はモック正本に一致させる（feedback_desk_rich_visual_shells）。
 */

const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif']);
const SHEET_EXT = new Set(['xlsx', 'xls', 'csv']);

/** 塗りつぶしフォルダ（黄）。ツリー / 一覧フォルダ行で共有。 */
export function FolderIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="file-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0}
      style={{ color: '#FFB300' }}
      aria-hidden="true"
    >
      <path d="M3 5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** 一覧の名前セル用アイコン（フォルダ or 拡張子別ファイル）。 */
export function FileIcon({ item }: { item: Pick<FileItem, 'kind' | 'name'> }) {
  if (item.kind === 'folder') return <FolderIcon />;

  const ext = fileExt(item.name);

  if (IMG_EXT.has(ext)) {
    return (
      <svg
        className="file-icon h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: '#B66E00' }}
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    );
  }

  let color = 'var(--sp-text-warm-2)';
  if (ext === 'md') color = '#5EBFFF';
  else if (ext === 'pdf') color = '#E63946';
  else if (SHEET_EXT.has(ext)) color = '#2A9B85';

  return (
    <svg
      className="file-icon h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      {SHEET_EXT.has(ext) && (
        <>
          <line x1="8" x2="16" y1="13" y2="13" />
          <line x1="8" x2="16" y1="17" y2="17" />
          <line x1="10" x2="14" y1="9" y2="9" />
        </>
      )}
    </svg>
  );
}
