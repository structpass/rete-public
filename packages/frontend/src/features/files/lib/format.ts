import type { FileItem } from './types';

/** ファイル名から拡張子（小文字・ドット無し）を取り出す。ドット無しは ''。 */
export function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** 一覧「種類」列のラベル（フォルダ / XXXファイル / ファイル）。モック kindLabel 移植。 */
export function kindLabel(item: Pick<FileItem, 'kind' | 'name'>): string {
  if (item.kind === 'folder') return 'フォルダ';
  const ext = fileExt(item.name);
  return ext ? `${ext.toUpperCase()}ファイル` : 'ファイル';
}

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/**
 * バイト数を人間可読サイズへ整形する（backend byteSize → 一覧サイズ列）。
 * 1024 未満は B、以降は 1024 進で KB/MB/GB/TB に丸め（小数 1 桁・末尾 .0 は出さない）。
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${Math.round(v * 10) / 10} ${BYTE_UNITS[i]}`;
}

// cmn-0253: ここにあった JST 固定の formatDateTime は撤去した。lib/utils.ts に同名で
// 「閲覧者ローカル時刻」を返す formatDateTime があり、**同名で時間軸だけ違う**関数が
// 2 つ並ぶ状態が取り違えの温床だったため（fil-0111 の CI 落ちの原因そのもの）。
// ファイル一覧の updatedAt も他画面と同じく閲覧者ローカル表示へ統一し、日時整形は
// lib/utils.ts の 1 箇所に寄せる。JST 固定表示が要件になったら、ここへ戻さず
// lib/utils.ts へ formatDateTimeJst のような明示名で置くこと（同名の再導入は禁止）。
