import {
  type Account,
  type Category,
  type ParentTaskOption,
  type Task,
} from '@/features/tasks/lib/api';
import { type ReactionEmoji } from '@rete/shared';
import { type MutableRefObject } from 'react';

export type DetailTab = 'thread' | 'tenmatsu' | 'history';

export interface TaskDetailOverlayProps {
  task: Task | null;
  categories: Category[];
  /**
   * 親タスク picker（rete-desk-0068/0071/0072）の候補。自身＋子孫は呼び出し側で除外済み（循環防止）。
   */
  parentTasks: ParentTaskOption[];
  /** 担当者候補（rete-desk-0062）。指定時は担当者を Account select として描画する。 */
  accounts?: Account[];
  /**
   * ログイン中ユーザーの Account id（dsk-0244）。起点カード（題名・説明）の編集ボタンは
   * task.owner.id === currentUserId（作成者本人）のときだけ表示する。他人のタスクでは編集導線を出さない
   * （backend は assertOwnerOrAdmin で 403 を返すため、フロントは「押せそうで押すと 403」の UX 不整合を防ぐ表示ガード）。
   */
  currentUserId?: string | null;
  error: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<unknown>;
  /**
   * 親付け替え（rete-desk-0071）。既存タスクの reparent は sortOrder / 循環 / カテゴリ波及を一元処理する
   * move endpoint に流すため、属性更新（onSave）とは別経路で呼ぶ。parentTaskId=null はトップレベル化。
   * categoryId は picker の分類連動で親と一致済みの値を渡す。
   */
  onReparent: (parentTaskId: number | null, categoryId: number | null) => Promise<unknown>;
  /** 編集中フラグの報告（C-編集・DBT-7 / 閉じ経路の破棄ガード用）。属性フォームの dirty を中継。 */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Esc 横取り（dsk-0242）。起点カード編集中の Esc は overlay 側で「編集モードのみ解除」し詳細画面は閉じない。
   * desk-shell の Esc ハンドラが closeAllGuarded を呼ぶ前にこの interceptor を consult し、編集中なら true
   * （消費）を受けて閉じ処理を行わない。非編集時は false を返し従来どおり閉じる。
   */
  escapeInterceptorRef?: MutableRefObject<(() => boolean) | null>;
  /** 統合検索のタスクキーワード（検索ハイライト用 / cmn-0092）。空/未指定はハイライトなし。 */
  taskKeyword?: string;
  /**
   * 起点カード（タスク本体）へのリアクショントグル（dsk-0297）。所有判定なし＝誰でも押せるため
   * currentUserId ガードは不要（コメントの ReactionBar と同方針）。未指定時はリアクションバーを描画しない。
   */
  onToggleReaction?: (emoji: ReactionEmoji) => Promise<void>;
}
