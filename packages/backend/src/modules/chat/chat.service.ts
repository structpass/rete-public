import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatRepository, UpdateThemeData } from './repositories/chat.repository';
import { CreateChatThemeDto } from './dto/create-chat-theme.dto';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { UpdateChatMessageDto } from './dto/update-chat-message.dto';
import { UpdateChatThemeDto } from './dto/update-chat-theme.dto';
import { CreateReactionDto } from './dto/create-reaction.dto';
import { FindChatThemesDto } from './dto/find-chat-themes.dto';
import type { ReactionToggleResponseDto } from './dto/chat-response.dto';
import { toChatThemeSummary, toChatThemeDetail, toChatMessageResponse } from './chat.mapper';
import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { ok, okMessage, okPaginated, buildPaginatedMeta, type ApiResponse } from '../../common/dto';
import { sanitizeRichText } from '../../common/rich-text';
import { validateMentionAccountIds, toMentionBadRequest } from '../../common/mentions';
import { assertSpaceVisibleOr404 } from '../../common/visibility';
import { assertOwnerOrAdmin, OwnerCheckUser } from '../auth/helpers/assert-owner.helper';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import { CHAT_MESSAGE_NOT_FOUND_MESSAGE, CHAT_THEME_NOT_FOUND_MESSAGE } from './chat.constants';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    // Space 可視性による存在秘匿（rete-hardening）。一覧は可視 Space へフィルタ、単体 GET / write
    // 対象の越境は common/visibility の assertSpaceVisibleOr404（ガードの 404 を対象不在の文言へ
    // 写し替える）で 404 へ揃える（権限の無いリソースは「無いことにする」）。
    private readonly scopeVisibility: ScopeVisibilityService,
  ) {}

  /**
   * 対象取得より先に可視範囲（可視 Space 集合）の解決を通す（存在秘匿の応答コスト平準化・v2-255）。
   *
   * v2-246 で 404 の status と message は揃えたが、応答時間は揃っていなかった: 対象が存在しない枝は
   * 対象取得 1 回で 404 を返すのに対し、存在するが非可視の枝は対象取得に加えて可視 Space 集合の解決
   * （複数クエリ）を通ってから 404 を返すため、応答時間から対象の存在を読み分けられた（timing oracle）。
   * 対象取得の前に本メソッドで解決を済ませると、以降の assertSpaceVisibleOr404 は
   * ScopeVisibilityService の RequestCache（同一リクエスト・同一 accountId で 1 回だけ実行）から同じ
   * 結果を受け取るため、不在の枝も非可視の枝も「可視範囲 1 回 + 対象取得 1 回」の同一コストになる
   * （files の fil-0146 と同じ型＝可視範囲を対象取得より先に解決する）。可視性の判定主体・判定結果は
   * ガードのままで、accountId 未指定（内部経路）のスキップ契約も同じ。
   */
  private async primeVisibleSpaces(accountId: string | undefined | null): Promise<void> {
    if (accountId === undefined || accountId === null) return;
    await this.scopeVisibility.resolveVisibleSpaceIds(accountId);
  }

  async findThemes(query: FindChatThemesDto, currentUserId?: string) {
    // 存在秘匿（rete-hardening）: 認証ユーザーの可視 Space 集合を解決し repository where へ渡す。
    // query.spaceId の越境直打ちは repository 側で「可視集合との交差」に畳まれ、越境器の結果は
    // 一覧へ一切含めない（enforcement=service層で集合解決 / フィルタ=repository where）。
    // currentUserId 無し（匿名/内部経路）は undefined を渡してフィルタをスキップする（基盤の skip 契約に合わせる）。
    const visibleSpaceIds = currentUserId
      ? await this.scopeVisibility.resolveVisibleSpaceIds(currentUserId)
      : undefined;
    // currentUserId を repository へ配線し「自分宛メンション有無（hasMentionToMe）」と
    // 「未読有無（hasUnread）」を一覧ページ全体で集約する（§D / rete-desk-0049・0075）。
    const { items, total, mentionedThemeIds, unreadThemeIds } =
      await this.chatRepository.findThemesAndCount(query, currentUserId, visibleSpaceIds);
    const meta = buildPaginatedMeta(total, query.page, query.limit);
    return okPaginated(
      items.map((theme) =>
        toChatThemeSummary(theme, mentionedThemeIds.has(theme.id), unreadThemeIds.has(theme.id)),
      ),
      meta,
    );
  }

  async findThemeDetail(id: string, currentUserId?: string) {
    // v2-255: 不在 / 非可視の判定は「同梱なしの軽い取得」で先に行う。詳細取得（メッセージ・リアクション・
    // 添付・宛先の同梱）を先に走らせると、行が在る枝だけが同梱ぶんのクエリと水和だけ重くなり、応答時間から
    // 対象の存在（と内容量）が漏れる（実体が 2 メッセージでも同梱クエリの本数は変わらないため差は一定に出る）。
    // 可視範囲の解決を先に通したうえで軽い取得で判定し、可視が確定した後だけ詳細を取得する＝不在も非可視も
    // 「可視範囲 1 回 + 軽い取得 1 回」の同一コストになる。
    await this.primeVisibleSpaces(currentUserId);
    const target = await this.chatRepository.findById(id);
    if (!target) {
      throw new NotFoundException(CHAT_THEME_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のテーマは「無いことにする」（404）。所有判定や既読化より
    // 先に弾き、越境 id 直打ちに対し存在を漏らさない。spaceId は createTheme と同じく DEFAULT_CHANNEL_ID へ
    // coalesce（NULL は孤児化防止で既定器扱い・作成時の刻印と整合）。currentUserId 無しは基盤側で skip。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      currentUserId,
      target.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_THEME_NOT_FOUND_MESSAGE,
    );
    const theme = await this.chatRepository.findThemeDetail(id);
    if (!theme) {
      // 可視判定と詳細取得の間に消えた場合（TOCTOU）も、対象不在と同じ文言へ揃える（存在秘匿）。
      throw new NotFoundException(CHAT_THEME_NOT_FOUND_MESSAGE);
    }
    // スレッドを開いた = 既読化（rete-desk-0075）。本人視点でのみ記録（匿名/未ログイン経路はスキップ）。
    // GET の副作用だが「開いた時点で既読」という UX 契約のため detail 取得経路に置く。
    // 既読化は付随的な書き込みであり、本筋（テーマ詳細の読み取り）の成否を左右させない。transient な
    // 書き込み失敗（接続断・ロック競合）で読み取り 200 を 500 へ転落させないよう、ここで握って warn に留める
    // （§4 の filter 委譲はリクエスト本筋のエラー向け。副作用の失敗は本筋に伝搬させないのが正しい）。
    if (currentUserId) {
      try {
        await this.chatRepository.markThemeRead(id, currentUserId);
      } catch (e) {
        this.logger.warn(`markThemeRead failed (theme=${id}, account=${currentUserId}): ${e}`);
      }
    }
    // currentUserId を mapper へ配線し reactedByMe を本人視点で算出する（§D）。
    return ok(toChatThemeDetail(theme, currentUserId));
  }

  /**
   * RTE HTML フィールド（description / tenmatsu）を未指定なら触らず、指定時のみ sanitize して差し替える
   * （ADR 0019・保存側防御）。createTheme / updateTheme で共通の sanitize イディオム（逐語重複を 1 箇所へ集約）。
   * tenmatsu は 0091 で plain → RTE HTML 化したため description と同じ sanitize 経路へ合流（null はクリアとして素通し）。
   */
  private sanitizeRichTextFields<T extends { description?: string; tenmatsu?: string | null }>(
    dto: T,
  ): T {
    return {
      ...dto,
      ...(dto.description !== undefined && { description: sanitizeRichText(dto.description) }),
      ...(typeof dto.tenmatsu === 'string' && { tenmatsu: sanitizeRichText(dto.tenmatsu) }),
    };
  }

  /**
   * 宛先検証・TOCTOU→400 変換は common/mentions の共通ヘルパを使う（dsk-0203 で本 service の実装を
   * 一般化して切り出したもの。tasks / task-comments と3サービスで共有し逐語重複を排す＝§3）。
   */
  private validateMentionAccountIds(ids?: string[]): Promise<string[] | undefined> {
    return validateMentionAccountIds(ids, (unique) =>
      this.chatRepository.countAccountsByIds(unique),
    );
  }

  /** common/mentions の共通ヘルパへ委譲（catch 節から `this.toMentionBadRequest(e)` で呼ぶ既存呼び出し形を維持）。 */
  private toMentionBadRequest(e: unknown): never {
    toMentionBadRequest(e);
  }

  async createTheme(authorId: string, dto: CreateChatThemeDto) {
    // Space 越境作成の封鎖（rete-hardening / tasks の create と同方針）。器の確定値（未指定は
    // DEFAULT_CHANNEL_ID を刻印・repository と整合）に対し作成者が可視かを検証する。create は owner
    // チェック不能（新規＝所有者がまだ無い）のため本検証が唯一の防御線。非可視は 404（存在秘匿）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      authorId,
      dto.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_THEME_NOT_FOUND_MESSAGE,
    );
    // 説明面の宛先（rete-desk-0116）を重複排除 + 存在検証してから sanitize 済み dto へ載せる。
    const descriptionMentionAccountIds = await this.validateMentionAccountIds(
      dto.descriptionMentionAccountIds,
    );
    const safeDto = { ...this.sanitizeRichTextFields(dto), descriptionMentionAccountIds };
    try {
      const theme = await this.chatRepository.createTheme(authorId, safeDto);
      return ok(toChatThemeSummary(theme));
    } catch (e) {
      return this.toMentionBadRequest(e);
    }
  }

  async updateTheme(id: string, dto: UpdateChatThemeDto, user: OwnerCheckUser) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(user.id);
    const theme = await this.chatRepository.findById(id);
    if (!theme) {
      throw new NotFoundException(CHAT_THEME_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のテーマは 404。所有判定（403）より先に弾き、越境者へ
    // 存在を漏らさない（403 と 404 の差で存在が推測されるのを防ぐ）。spaceId は createTheme と整合させ
    // DEFAULT_CHANNEL_ID へ coalesce。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      user.id,
      theme.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_THEME_NOT_FOUND_MESSAGE,
    );
    // テーマ編集（本文 / アーカイブ）は投稿者本人のみ（rete-desk-0083）。UI の所有判定（編集ボタン
    // 非表示）は HTTP 直叩きで迂回できるため、backend で所有者でなければ 403 にして IDOR を塞ぐ。
    // ただし顛末（tenmatsu / 顛末面宛先）のみの更新は所有者ゲートを免除する（rete-desk-0122:
    // 決着を付けて顛末を記すのは投稿者本人とは限らない。誰でもいつでも記録できる運用が正）。
    // H4: assertOwnerOrAdmin に統一し、ADMIN は所有者チェックをバイパスする（管理者は他者テーマも編集可）。
    const isTenmatsuOnly = Object.entries(dto).every(
      ([key, value]) =>
        value === undefined || key === 'tenmatsu' || key === 'tenmatsuMentionAccountIds',
    );
    if (!isTenmatsuOnly) {
      assertOwnerOrAdmin(theme.authorId, user);
    }
    // archived(boolean) は DB の archivedAt(時刻) / description・tenmatsu の宛先は面別差し替えへ
    // 畳むため dto から分離してから sanitize する。
    const { archived, descriptionMentionAccountIds, tenmatsuMentionAccountIds, ...rest } = dto;
    // description / tenmatsu（RTE HTML）を sanitize（title は plain text）。未指定キーは生やさず部分更新の shape を保つ。
    const safeData: UpdateThemeData = this.sanitizeRichTextFields(rest);
    // 説明面（rete-desk-0116）/ 顛末面（Phase B）の宛先。undefined=据え置き / 配列（空含む）=当該面を全置換。
    // 検証 OK 時のみ載せる（面別の独立保存）。
    const validatedDescriptionMentions = await this.validateMentionAccountIds(
      descriptionMentionAccountIds,
    );
    if (validatedDescriptionMentions !== undefined) {
      safeData.descriptionMentionAccountIds = validatedDescriptionMentions;
    }
    const validatedTenmatsuMentions =
      await this.validateMentionAccountIds(tenmatsuMentionAccountIds);
    if (validatedTenmatsuMentions !== undefined) {
      safeData.tenmatsuMentionAccountIds = validatedTenmatsuMentions;
    }
    // true=現在時刻でアーカイブ / false=NULL で解除 / undefined=据え置き（キーを生やさない）。
    if (archived !== undefined) {
      safeData.archivedAt = archived ? new Date() : null;
    }
    try {
      const updated = await this.chatRepository.updateTheme(id, safeData);
      return ok(toChatThemeSummary(updated));
    } catch (e) {
      return this.toMentionBadRequest(e);
    }
  }

  /**
   * テーマの物理削除（rete-desk-0095: 起点カード「その他 > メッセージ削除」）。削除できるのは投稿者
   * 本人のみ（updateTheme と同じ IDOR 防御 — UI のボタン非表示は HTTP 直叩きで迂回できるため backend
   * で 403 にする）。配下データは repository 側コメントのとおり Cascade / SetNull に委ねる。
   * H4: assertOwnerOrAdmin に統一し、ADMIN は他者テーマも削除可。
   */
  async deleteTheme(id: string, user: OwnerCheckUser) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(user.id);
    const theme = await this.chatRepository.findById(id);
    if (!theme) {
      throw new NotFoundException(CHAT_THEME_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のテーマは 404（所有判定より先・越境者へ存在を漏らさない）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      user.id,
      theme.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_THEME_NOT_FOUND_MESSAGE,
    );
    assertOwnerOrAdmin(theme.authorId, user);
    await this.chatRepository.deleteTheme(id);
    // 物理削除は復元不能の破壊的操作のため、成功時に誰が何を消したかの監査トレースを残す
    // （エラー系は filter がログするが成功系はここでしか記録できない）。
    this.logger.log(`Chat theme deleted: theme=${id} by account=${user.id}`);
    return okMessage('Chat theme deleted successfully');
  }

  /** メッセージへのリアクションをトグル（同一 author+emoji が在れば解除・無ければ付与）。 */
  async toggleMessageReaction(messageId: string, authorId: string, dto: CreateReactionDto) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(authorId);
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundException(CHAT_MESSAGE_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のメッセージは 404。spaceId は親テーマ経由で解決する
    // （message 自身は spaceId を持たない / repository が theme を同梱）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      authorId,
      message.theme?.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_MESSAGE_NOT_FOUND_MESSAGE,
    );
    return this.toggleReaction({ messageId }, authorId, dto.emoji);
  }

  /** テーマ起点カードへのリアクションをトグル。 */
  async toggleThemeReaction(themeId: string, authorId: string, dto: CreateReactionDto) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(authorId);
    const theme = await this.chatRepository.findById(themeId);
    if (!theme) {
      throw new NotFoundException(CHAT_THEME_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のテーマは 404。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      authorId,
      theme.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_THEME_NOT_FOUND_MESSAGE,
    );
    return this.toggleReaction({ themeId }, authorId, dto.emoji);
  }

  /**
   * 対象（message / theme / taskComment / task）共通のトグル本体。返却は {reacted} のみ（再描画は GET detail
   * に委ねる）。task-comments / tasks モジュール（dsk-0297）が cross-module DI 経由でそのまま呼ぶ共有ロジック
   * （§3 コピペ禁止＝対象種別が増えても複製しない）。
   *
   * 冪等化（TOCTOU 緩和）: findReaction → create/delete は非トランザクションのため、連打/並列で
   * 同一トグルが競合し得る。そこで
   *  - 解除方向は deleteMany（対象 0 でもエラー化しない＝既に消えていても reacted:false へ収束）
   *  - 付与方向は create を try/catch し P2002（@@unique 衝突＝別リクエストが先に作成済）を握って
   *    reacted:true へ収束させる
   * ことで、トグル結果が常に正常レスポンスへ落ちる（409 にしてトグル UX を壊さない）。
   * これはトグルの冪等性を service が保証する箇所なので、§4 エラー一元化（filter 委譲）の
   * 意図的な例外として service 内で P2002 のみを握る。P2002 以外は再 throw し filter へ委ねる。
   */
  async toggleReaction(
    target: { messageId?: string; themeId?: string; taskCommentId?: string; taskId?: number },
    authorId: string,
    emoji: string,
  ): Promise<ApiResponse<ReactionToggleResponseDto>> {
    const existing = await this.chatRepository.findReaction(target, authorId, emoji);
    if (existing) {
      await this.chatRepository.deleteReactions(target, authorId, emoji);
      return ok({ reacted: false });
    }
    try {
      await this.chatRepository.createReaction({ ...target, authorId, emoji });
    } catch (e) {
      // 並列の別リクエストが先に同一リアクションを作成済（@@unique 衝突）= トグル結果は付与済みと同義。
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return ok({ reacted: true });
      }
      throw e;
    }
    return ok({ reacted: true });
  }

  /**
   * 自分の発話の本文編集（rete-desk-0146）。編集できるのは投稿者本人のみ（updateTheme と同じ IDOR 防御 —
   * UI のボタン非表示は HTTP 直叩きで迂回できるため backend で 403 にする）。本文は postMessage と同じ
   * sanitize 経路を通し（ADR 0019）、宛先（mentionAccountIds）は指定時のみ重複排除 + 存在検証して全置換する。
   * H4: assertOwnerOrAdmin に統一し、ADMIN は他者メッセージも編集可。
   */
  async updateMessage(messageId: string, user: OwnerCheckUser, dto: UpdateChatMessageDto) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(user.id);
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundException(CHAT_MESSAGE_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のメッセージは 404（所有判定より先・越境者へ存在を漏らさない）。
    // spaceId は親テーマ経由で解決する（repository が theme を同梱）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      user.id,
      message.theme?.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_MESSAGE_NOT_FOUND_MESSAGE,
    );
    assertOwnerOrAdmin(message.authorId, user);
    const mentionAccountIds = await this.validateMentionAccountIds(dto.mentionAccountIds);
    try {
      const updated = await this.chatRepository.updateMessage(messageId, {
        body: sanitizeRichText(dto.body),
        mentionAccountIds,
      });
      return ok(toChatMessageResponse(updated));
    } catch (e) {
      // toMentionBadRequest は never（必ず throw）。return を付けて method 戻り型から undefined を閉じる
      // （P2003→400 変換 / それ以外は再 throw・§4 filter へ委譲。code-review/security-review 0146 指摘）。
      return this.toMentionBadRequest(e);
    }
  }

  /**
   * 発話（返信メッセージ）の物理削除（dsk-0316: 発話「その他」>メッセージの削除・updateMessage と同じ
   * 所有判定/存在秘匿境界）。削除できるのは投稿者本人のみ（UI のボタン非表示は HTTP 直叩きで迂回できる
   * ため backend で 403 にする）。H4: assertOwnerOrAdmin に統一し、ADMIN は他者の発話も削除可。
   */
  async deleteMessage(messageId: string, user: OwnerCheckUser) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(user.id);
    const message = await this.chatRepository.findMessageById(messageId);
    if (!message) {
      throw new NotFoundException(CHAT_MESSAGE_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のメッセージは 404（所有判定より先・越境者へ存在を漏らさない）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      user.id,
      message.theme?.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_MESSAGE_NOT_FOUND_MESSAGE,
    );
    assertOwnerOrAdmin(message.authorId, user);
    await this.chatRepository.deleteMessage(messageId);
    // 物理削除は復元不能の破壊的操作のため、成功時に誰が何を消したかの監査トレースを残す（deleteTheme と同方針）。
    this.logger.log(`Chat message deleted: message=${messageId} by account=${user.id}`);
    return okMessage('Chat message deleted successfully');
  }

  async postMessage(themeId: string, authorId: string, dto: CreateChatMessageDto) {
    // v2-255: 対象取得より先に可視範囲を解決する（不在枝と非可視枝の同期コストを揃える・timing oracle）。
    await this.primeVisibleSpaces(authorId);
    const theme = await this.chatRepository.findById(themeId);
    if (!theme) {
      throw new NotFoundException(CHAT_THEME_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（rete-hardening）: 非可視 Space のテーマへの投稿は 404（越境投稿を封じる）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      authorId,
      theme.spaceId ?? DEFAULT_CHANNEL_ID,
      CHAT_THEME_NOT_FOUND_MESSAGE,
    );
    // 宛先（メンション先）の重複排除 + 存在検証（rete-desk-0049・共通ヘルパ）。0 件なら検証スキップ。
    const mentionAccountIds = await this.validateMentionAccountIds(dto.mentionAccountIds);
    // 本文はリッチテキスト（HTML）。保存前に sanitize（ADR 0019・多層防御の保存側）。body は必須。
    const safeDto: CreateChatMessageDto = {
      ...dto,
      body: sanitizeRichText(dto.body),
      mentionAccountIds,
    };
    try {
      const message = await this.chatRepository.createMessage(themeId, authorId, safeDto);
      return ok(toChatMessageResponse(message));
    } catch (e) {
      return this.toMentionBadRequest(e);
    }
  }
}
