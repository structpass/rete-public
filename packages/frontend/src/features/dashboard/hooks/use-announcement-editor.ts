'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  addAnnouncementAttachment,
  fetchAnnouncementDetail,
  setAnnouncementTags,
  type AnnouncementAttachment,
  type AnnouncementInput,
  type AnnouncementPatch,
  type AnnouncementTagDto,
} from '../lib/api';

/** 右ペインの編集状態: null=詳細表示 / create=新規 / edit=既存編集（初期値 + 既存添付 + 既存タグ込み）。 */
export type EditorState =
  | { mode: 'create' }
  | {
      mode: 'edit';
      id: string;
      initial: AnnouncementInput;
      attachments: AnnouncementAttachment[];
      /** edit 時の既存タグ一覧（rete-home-0043）。AnnouncementForm の初期選択状態・dirty 判定に渡す。 */
      tags: AnnouncementTagDto[];
    }
  | null;

export interface UseAnnouncementEditorOptions {
  /** 現在選択中の通知 id（closeEditor の詳細再取得判定に使う）。 */
  selectedId: string | null;
  /** 選択変更（作成成功後に新通知を選択する）。 */
  setSelectedId: (id: string | null) => void;
  create: (input: AnnouncementInput) => Promise<string>;
  update: (id: string, patch: AnnouncementPatch) => Promise<void>;
  /** 編集を閉じた時に選択中通知の詳細を再取得（即時反映した添付変更を詳細ペインへ映す）。 */
  refetchDetail: () => Promise<void> | void;
}

export interface UseAnnouncementEditorResult {
  editor: EditorState;
  setEditor: React.Dispatch<React.SetStateAction<EditorState>>;
  saving: boolean;
  openEdit: (id: string) => Promise<void>;
  closeEditor: () => void;
  handleSubmit: (data: AnnouncementInput, pendingFileIds: string[]) => Promise<void>;
}

/**
 * 掲示板の編集ライフサイクル（H0022 添付 flush / rete-home-0043 タグ付与含む）を DashboardView から切り出した hook（code-review HIGH）。
 * 右ペインの create/edit オーバーレイ状態・保存中フラグ・編集オープン・クローズ・確定（作成/更新 + 保留添付 flush + タグ付与）を集約する。
 * - openEdit: 詳細 GET で既存値 + 既存添付 + 既存タグを取得して edit 状態へ。
 * - closeEditor: 選択中通知を編集していたら詳細を再取得して整合（submit/cancel どちらの閉じ方でも）。
 * - handleSubmit:
 *     create: 作成後に保留添付を新 id へ best-effort flush → タグ付与（個別失敗で本体巻き戻しなし）
 *     edit:   更新後にタグ付与（best-effort）
 *     AnnouncementInput.tagIds は backend body には含めず、ここで取り出して setAnnouncementTags へ渡す。
 */
export function useAnnouncementEditor({
  selectedId,
  setSelectedId,
  create,
  update,
  refetchDetail,
}: UseAnnouncementEditorOptions): UseAnnouncementEditorResult {
  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = useCallback(async (id: string) => {
    try {
      const d = await fetchAnnouncementDetail(id);
      setEditor({
        mode: 'edit',
        id,
        initial: {
          title: d.title,
          body: d.body,
        },
        attachments: d.attachments,
        tags: d.tags,
      });
    } catch {
      toast.error('通知の取得に失敗しました');
    }
  }, []);

  // 編集オーバーレイを閉じる。edit で選択中通知を編集していた時は、フォーム内で即時反映した添付変更を
  // 詳細ペインへ映すため詳細を再取得する（submit / cancel いずれの閉じ方でも整合させる）。
  const closeEditor = useCallback(() => {
    setEditor((cur) => {
      if (cur?.mode === 'edit' && cur.id === selectedId) void refetchDetail();
      return null;
    });
  }, [selectedId, refetchDetail]);

  // editor は開閉時のみ変化する（フォームの入力値は AnnouncementForm のローカル state でここには波及しない）
  // ため、依存に含めても churn は起きない。
  const handleSubmit = useCallback(
    async (data: AnnouncementInput, pendingFileIds: string[]) => {
      if (!editor) return;
      setSaving(true);
      // tagIds は backend の create/update DTO に含めず、ここで取り出してタグ付与 API へ送る（rete-home-0043）。
      const { tagIds = [], ...announcementData } = data;
      try {
        if (editor.mode === 'create') {
          const newId = await create(announcementData);
          // 作成成功後に保留添付を新通知 id へ flush（best-effort で続行し、失敗は件数を集約通知する。
          // 通知本体の作成は成功しているため、個別失敗で本筋を巻き戻さない）。
          let failed = 0;
          for (const fileId of pendingFileIds) {
            try {
              await addAnnouncementAttachment(newId, fileId);
            } catch {
              failed += 1;
            }
          }
          // タグ付与（best-effort。タグ失敗で本体作成を巻き戻さない）。
          try {
            await setAnnouncementTags(newId, tagIds);
          } catch {
            toast.error('タグの更新に失敗しました');
          }
          toast.success('通知を作成しました');
          if (failed > 0) toast.error(`${failed} 件の添付に失敗しました`);
          setSelectedId(newId);
        } else {
          await update(editor.id, announcementData);
          // タグ付与（best-effort。タグ失敗で本体保存を巻き戻さない）。
          try {
            await setAnnouncementTags(editor.id, tagIds);
          } catch {
            toast.error('タグの更新に失敗しました');
          }
          toast.success('通知を保存しました');
        }
        closeEditor();
      } catch {
        toast.error(editor.mode === 'create' ? '作成に失敗しました' : '保存に失敗しました');
      } finally {
        setSaving(false);
      }
    },
    [editor, create, update, closeEditor, setSelectedId],
  );

  return { editor, setEditor, saving, openEdit, closeEditor, handleSubmit };
}
