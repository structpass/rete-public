import type { AttachmentDto } from './attachment';

/**
 * チャットテーマのステータス。desk spec の オープン / クローズ に対応。
 * Prisma の `enum ChatThemeStatus`（schema.prisma）と値を完全一致させる SSOT。
 * backend の DTO / バリデーションと frontend の表示が本 enum を import して使う（[[TaskStatus]] と同方針）。
 */
export enum ChatThemeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * リアクションの既定クイックセット（テーマ／メッセージ共通）。最近使用が無いときの初期表示に使う。
 * rete-desk-0094 で任意絵文字が許可されたため「固定許可集合」ではなく「よく使う初期候補」の位置づけ。
 * 並び順が最近使用フォールバック時の表示順になる。
 */
export const REACTION_EMOJIS = ['👍', '❤️', '😄', '🎉', '😮', '🙏', '👀', '🚀'] as const;

/**
 * リアクション絵文字として許可する文字列の正規表現（rete-desk-0094 / SSOT）。
 * 任意の Unicode 絵文字（ZWJ 合字・肌色トーン・異体字セレクタ・国旗の地域指示子を含む）を許可しつつ、
 * 任意テキスト混入を防ぐため「絵文字構成文字のみ」かつ「少なくとも 1 つの絵文字本体（pictographic
 * または地域指示子）を含む」ことを要求する。backend の DTO（@Matches）と frontend の任意ガードが共有する。
 * \u{200D}=ZWJ（合字結合）/ \u{FE0F}=異体字セレクタ16（絵文字表示指定）。
 */
export const REACTION_EMOJI_RE =
  /^(?=.*[\p{Extended_Pictographic}\p{Regional_Indicator}])[\p{Extended_Pictographic}\p{Emoji_Component}\p{Regional_Indicator}\u{200D}\u{FE0F}]{1,64}$/u;

/**
 * リアクション絵文字の最大長（code point 単位 / ZWJ 連結・国旗列を許容しつつ過大入力を弾く）。
 * class-validator の @MaxLength（validator.js isLength = サロゲートペア補正済 code point 数）と
 * REACTION_EMOJI_RE の量化子 {1,64} を一致させる前提値。変更時は正規表現側の 64 も合わせる。
 */
export const REACTION_EMOJI_MAX_LEN = 64;

/** リアクション絵文字の値型。任意絵文字を許可（rete-desk-0094）。形式検証は REACTION_EMOJI_RE が担う。 */
export type ReactionEmoji = string;

/** DTO に集計形で載るリアクション 1 種（emoji 別の件数 + 自分が押したか）。 */
export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/**
 * リアクションのトグル API（POST /chat/messages/:id/reactions 等）の応答形（v2-251 で集約）。
 * 返るのは付与／解除の結果だけで、集計配列（ReactionSummary[]）は返らない＝呼び出し側が GET で再取得する。
 * 対象（message / theme / taskComment / task）に依らず同じ形のため、backend の chat-response.dto.ts は
 * 本型を再公開するだけにし、frontend desk も本型を参照する（同形を層ごとに書き写さない）。
 */
export interface ReactionToggleResponseDto {
  reacted: boolean;
}

/**
 * チャット（chat モジュール）の応答形の SSOT（v2-245 で集約）。
 * backend の chat-response.dto.ts と frontend desk のローカル型が同形を別々に宣言していたため、
 * 形の正本をここへ一本化した（backend の dto は再公開のみ・frontend は本型を参照する）。
 */

/** 投稿者は Account へ正規化済。レスポンスでは id + 表示名のみ公開（email 等は出さない）。 */
export interface ChatAuthorDto {
  id: string;
  name: string;
}

/** チャット詳細スレッド内の 1 発話。 */
export interface ChatMessageResponseDto {
  id: string;
  themeId: string;
  body: string;
  author: ChatAuthorDto;
  createdAt: string;
  /** emoji 別に集計したリアクション（Entity 直返しせず mapper で集計・§1 DTO 境界）。 */
  reactions: ReactionSummary[];
  /** この発話に付いた添付（FL-3b・版固定・添付モジュールの DTO を再利用）。 */
  attachments: AttachmentDto[];
  /** この発話のメンション先（@誰宛て / rete-desk-0049）。account を id+name のみへ畳む（§1 DTO 境界）。 */
  mentions: ChatAuthorDto[];
}

/** チャット明細（左ペイン一覧）のカード 1 件。messages は含めず件数のみ。 */
export interface ChatThemeSummaryDto {
  id: string;
  title: string;
  status: ChatThemeStatus;
  /** アーカイブ済みか（archivedAt != null を boolean へ畳む。明細カードのアーカイブ印に使う）。 */
  archived: boolean;
  /**
   * 顛末が記録済か（tenmatsu 非空を boolean へ畳む。顛末フィルタ用 / rete-desk-0050）。
   * 本文（機密たりうる結論）は summary に載せず、記録の有無だけ公開する。
   */
  hasTenmatsu: boolean;
  /**
   * 自分宛メンション（To に現在ユーザーを含むメッセージ）を 1 件以上含むテーマか（rete-desk-0049）。
   * カードのメンションアイコン点灯に使う。actor 依存のため backend が集約して boolean で公開する。
   */
  hasMentionToMe: boolean;
  /**
   * 未読あり（自分以外の新着が最終既読より後にある）テーマか（rete-desk-0075）。題名太字の点灯に使う。
   * 自分起票・自分投稿は未読に数えない。actor 依存のため backend が集約して boolean で公開する。
   */
  hasUnread: boolean;
  author: ChatAuthorDto;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

/** チャット詳細（右ペインオーバーレイ）。テーマ本体 + スレッドのメッセージ全件。 */
export interface ChatThemeDetailDto {
  id: string;
  title: string;
  description: string | null;
  /** 顛末（スレッドの結論・自由記入ノート / rete-desk-0092）。タスク詳細の顛末と対。未記入は null。 */
  tenmatsu: string | null;
  status: ChatThemeStatus;
  /** アーカイブ済みか（一覧と同じ導出。詳細ヘッダのアーカイブ／解除トグル表示に使う）。 */
  archived: boolean;
  author: ChatAuthorDto;
  messages: ChatMessageResponseDto[];
  /** テーマ起点カードに付いたリアクション（メッセージと同形・mapper で集計）。 */
  reactions: ReactionSummary[];
  /** テーマに付いた添付（FL-3b・新規作成コンポーザ／編集モードで付与・版固定）。 */
  attachments: AttachmentDto[];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}
