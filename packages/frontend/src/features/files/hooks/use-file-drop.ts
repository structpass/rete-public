'use client';

import { useCallback, useEffect, useState, type DragEvent } from 'react';

/**
 * DataTransfer に OS ファイルが含まれるか（@dnd-kit の内部ドラッグや単なるテキスト D&D を除外）。
 * types は DOMStringList（ブラウザ）または string[]（jsdom）で来るため Array.from で正規化する。
 */
function hasOsFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types as ArrayLike<string>).includes('Files');
}

/** ゾーンへ spread する native ドロップハンドラ群（OS ファイル D&D 専用）。 */
export interface FileDropZoneProps {
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

export interface UseFileDropResult {
  /** 現在ハイライト中のドロップゾーン id（null=なし・同時に光るのは 1 ゾーンのみ）。 */
  activeZone: string | null;
  /**
   * ゾーンを OS ファイル D&D の受け口にする native ハンドラ群を返す。
   * folderId=null のゾーン（検索中の右ペイン等）はドロップ不可＝ハイライトもアップロードもしない。
   */
  getZoneProps: (zoneId: string, folderId: string | null) => FileDropZoneProps;
}

const NOOP_PROPS: FileDropZoneProps = {
  onDragEnter: () => {},
  onDragOver: () => {},
  onDragLeave: () => {},
  onDrop: () => {},
};

/**
 * OS からのファイル D&D アップロードの受け口（fil-0052）。
 *
 * @dnd-kit（並べ替え / reparent）は PointerSensor 基盤で native HTML5 drag を使わないため、
 * native の dragenter/over/leave/drop は OS ファイル D&D 専用レイヤとして干渉しない（設計の別レイヤ前提）。
 * 1 つの hook で複数ゾーン（左ペインの各フォルダ / 右ペインの現在フォルダ）を id で識別し、
 * ハイライト中ゾーンを activeZone に持つ（最後に dragover したゾーンが勝つ＝同時に 1 ゾーンのみ点灯）。
 * 実アップロードは onDropFiles へ委譲（複数ファイルは DataTransfer.files をまとめて渡す）。
 *
 * フォルダ階層 D&D（fil-0055）: drop に**ディレクトリが含まれ** onDropEntries が渡された時は、
 * `webkitGetAsEntry()` で取得した FileSystemEntry 群を onDropEntries へ委譲する（階層を再帰展開）。
 * エントリは drop イベント終了後に無効化するため、ハンドラ内で**同期的に**取得する。
 * ディレクトリを含まない（ファイルのみ）/ onDropEntries 未指定の時は従来通り onDropFiles へフォールバック。
 */
export function useFileDrop(
  onDropFiles: (folderId: string, files: File[]) => void | Promise<void>,
  onDropEntries?: (folderId: string, entries: FileSystemEntry[]) => void | Promise<void>,
): UseFileDropResult {
  const [activeZone, setActiveZone] = useState<string | null>(null);

  // ドロップゾーン外（ツールバー / パンくず / ツリーの隙間 / 検索中の右ペイン等）へ OS ファイルを落とすと
  // ブラウザが既定でそのファイルをタブで開きアプリから離脱する。document レベルで Files の dragover/drop を
  // 既定抑止し離脱を防ぐ（ゾーン内 drop は stopPropagation で document へ伝播しないためアップロードに影響しない）。
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => {
      const types = e.dataTransfer?.types;
      if (types && Array.from(types as ArrayLike<string>).includes('Files')) e.preventDefault();
    };
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', prevent);
    return () => {
      document.removeEventListener('dragover', prevent);
      document.removeEventListener('drop', prevent);
    };
  }, []);

  const getZoneProps = useCallback(
    (zoneId: string, folderId: string | null): FileDropZoneProps => {
      // ドロップ先フォルダが無いゾーン（未選択 / 検索中の右ペイン）は受け口にしない。
      if (folderId === null) return NOOP_PROPS;

      const activate = (e: DragEvent) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        setActiveZone(zoneId);
      };

      return {
        onDragEnter: activate,
        onDragOver: activate,
        onDragLeave: (e) => {
          if (!hasOsFiles(e)) return;
          // 子要素間の移動では relatedTarget が currentTarget 内に残るので消さない（ちらつき防止）。
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          setActiveZone((z) => (z === zoneId ? null : z));
        },
        onDrop: (e) => {
          if (!hasOsFiles(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setActiveZone(null);
          // フォルダ階層 D&D（fil-0055）: ディレクトリを含むなら webkitGetAsEntry でエントリを同期取得し
          // onDropEntries へ委譲（drop 後はエントリが無効化するため即時に読む）。混在ドロップ（ファイル＋
          // フォルダ）はトップレベルのファイルもエントリに含まれるため onDropEntries 側で一括処理する。
          if (onDropEntries) {
            const items = e.dataTransfer?.items;
            const entries = items
              ? Array.from(items as ArrayLike<DataTransferItem>)
                  .map((it) =>
                    typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null,
                  )
                  .filter((en): en is FileSystemEntry => en !== null)
              : [];
            if (entries.some((en) => en.isDirectory)) {
              void onDropEntries(folderId, entries);
              return;
            }
          }
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length > 0) void onDropFiles(folderId, files);
        },
      };
    },
    [onDropFiles, onDropEntries],
  );

  return { activeZone, getZoneProps };
}
