'use client';

/**
 * タグマスタ hook（共有化 / rete-home-0043）。
 * 汎用実装は @/hooks/use-tag-master へ移動。後方互換のため型・hook を再公開する。
 *
 * files-shell は useFilesTagMaster を import して Files API をバインドした形で使う（fil-0094）。
 * tag-assign-overlay など他のファイル機能コードは UseTagMasterResult をここから import し続けられる。
 * （引数なし版 useFileTagMaster は未参照のため knip 検出・set-0049 で削除済み）
 */
import { useCallback } from 'react';
import { useTagMaster, type UseTagMasterResult } from '@/hooks/use-tag-master';
import { fetchTags, createTag, updateTag, deleteTag } from '../lib/api';

export {
  useTagMaster,
  type UseTagMasterResult,
  type UseTagMasterOptions,
  type TagLike,
} from '@/hooks/use-tag-master';

/**
 * File タグマスタ hook（fil-0094・useAnnouncementTagMaster と同型）。
 * 汎用 useTagMaster に Files API をバインドする。
 * includeArchived はタグ管理オーバーレイのアーカイブ表示切替用。true にするとアーカイブ済みタグも
 * 含めて返す（既定は除外・ADMIN のみ許可は backend が担う）。値が変わるたび fetch の identity が変わり
 * useTagMaster 内の mount useEffect が再発火して再フェッチする（cmn-0044 と同じ仕組み）。
 */
export function useFilesTagMaster(includeArchived = false): UseTagMasterResult {
  // cmn-0044: fetch は useTagMaster 内で reload の identity 依存になるため useCallback で安定参照にする
  // （inline arrow だと毎レンダー再生成され mount useEffect が無限再発火する）。
  const fetch = useCallback(() => fetchTags(includeArchived), [includeArchived]);
  return useTagMaster({ fetch, create: createTag, update: updateTag, remove: deleteTag });
}
