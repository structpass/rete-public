import type { ChatThemeDetail } from '@/features/desk/lib/api';
import type { Account } from '@/features/tasks/lib/api';
import { type ReactionEmoji } from '@rete/shared';

export interface ChatThreadProps {
  theme: ChatThemeDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** 返信投稿。fileIds は deferred-flush 添付（FL-3b）/ mentionAccountIds は宛先（rete-desk-0049）—
   *  いずれも投稿成功後に作成発話へ紐づく。 */
  onReply: (body: string, fileIds: string[], mentionAccountIds: string[]) => Promise<unknown>;
  /** 自分の発話の本文編集（PATCH /chat/messages/:id / rete-desk-0146）。成功で resolve・失敗で throw。
   *  mentionAccountIds は本文中の @ から再抽出した宛先で全置換する。 */
  onUpdateMessage: (
    messageId: string,
    body: string,
    mentionAccountIds: string[],
  ) => Promise<unknown>;
  /** スレッド再取得（dsk-0265・dsk-0287）。発話編集/テーマ編集の保存で保留添付を commit した後、
   *  発話カード・起点カードの添付一覧（embed）へ反映するために呼ぶ（onUpdateMessage/onUpdateTheme 内の
   *  再取得は commit 前で添付が乗らないため）。 */
  onRefetchTheme?: () => Promise<unknown>;
  /** 宛先ピッカーの候補（全アカウント / rete-desk-0049）。ReplyComposer へ素通し。 */
  accounts: Account[];
  /** テーマ編集の保存（title / description / tenmatsu）。成功で resolve・失敗で throw（本体が error 表示）。
   *  description/tenmatsuMentionAccountIds は各面の @ メンション宛先（rete-desk-0116）。 */
  onUpdateTheme: (payload: {
    title?: string;
    description?: string;
    tenmatsu?: string | null;
    descriptionMentionAccountIds?: string[];
    tenmatsuMentionAccountIds?: string[];
  }) => Promise<unknown>;
  /** アーカイブ状態のトグル（true=アーカイブ / false=解除）。成功後に一覧/詳細を最新化する（呼び出し側）。 */
  onArchive: (archived: boolean) => Promise<unknown>;
  /** テーマ（起点メッセージ）の物理削除（rete-desk-0095）。成功後の詳細クローズ・一覧再取得は呼び出し側。 */
  onDeleteTheme: () => Promise<unknown>;
  /** 自分の発話の物理削除（DELETE /chat/messages/:id / dsk-0316）。成功で resolve・失敗で throw。 */
  onDeleteMessage: (messageId: string) => Promise<unknown>;
  /** メッセージのリアクションをトグル。 */
  onToggleMessageReaction: (messageId: string, emoji: ReactionEmoji) => Promise<unknown>;
  /** テーマ起点カードのリアクションをトグル。 */
  onToggleThemeReaction: (emoji: ReactionEmoji) => Promise<unknown>;
  /**
   * テーマ編集モードの dirty 変化を上位へ報告（タスク詳細編集と同じ破棄ガードへ合流）。
   * チャット詳細は右ペインオーバーレイのため、左ペイン用 leftDirtyRef とは別系統で扱う。
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * 現在ログイン中ユーザーの id（編集・その他アクションの所有判定に使う / rete-desk-0083）。
   * theme.author.id と一致する時だけ起点カードの編集／その他ボタンを出す（他人の投稿は操作不可）。
   */
  currentUserId?: string;
  /**
   * 検索キーワード（rete-desk-0048）。チャット明細の検索語をチャット詳細へ配線し、説明欄・メッセージ本文の
   * 一致箇所を薄い黄色でハイライトする（タイトルのみだった欠陥の解消）。空/未指定でハイライトなし。
   */
  highlight?: string;
}
