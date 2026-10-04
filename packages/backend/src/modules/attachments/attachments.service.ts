import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { ok } from '../../common/dto';
import { assertSpaceVisibleOr404, primeVisibleSpaces } from '../../common/visibility';
import { assertOwnerOrAdmin, OwnerCheckUser } from '../auth/helpers/assert-owner.helper';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import {
  AttachmentsRepository,
  AttachmentWithDisplay,
} from './repositories/attachments.repository';
import {
  AttachmentResponseDto,
  AttachmentTargetType,
  CreateAttachmentDto,
  ListAttachmentsQueryDto,
} from './dto';
import { toAttachment } from './attachments.mapper';

/**
 * 添付操作の主体（ADR 0063）。可視性判定に要るのは accountId だけになった（旧 AclUser の後継で、
 * files 側の FileUser と同形。モジュール間の型依存を作らないため各モジュールで持つ）。
 */
interface AttachmentUser {
  id: string;
}

/** 添付先の XOR 列（ちょうど一つが埋まる）。resolveTarget / linkLatestVersion の受け渡し型。 */
type AttachmentTargetCols = {
  taskId?: number;
  chatMessageId?: string;
  themeId?: string;
  announcementId?: string;
  taskCommentId?: string;
};

/**
 * 404 の「対象不在」文言（v2-254）。対象が存在しない時と、存在するが呼び出し元に非可視の時で
 * 同じ文言を返す——という不変条件を 1 箇所で保つため定数にする。非可視側は common/visibility の
 * assertSpaceVisibleOr404 で本定数へ写し替える（片側だけ変えると応答本文が存在の oracle に戻る・
 * 存在秘匿 ADR 0038）。
 */
const ATTACHMENT_NOT_FOUND_MESSAGE = '添付が見つかりません';

/** 添付先（targetType）ごとの「対象不在」文言。作成・一覧の両経路で同じ文言を使う（v2-254）。 */
const ATTACHMENT_TARGET_NOT_FOUND_MESSAGE: Record<AttachmentTargetType, string> = {
  task: '添付先のタスクが見つかりません',
  theme: '添付先のテーマが見つかりません',
  taskComment: '添付先のコメントが見つかりません',
  chatMessage: '添付先のメッセージが見つかりません',
};

/**
 * Desk 添付のアプリケーションサービス。検証 + オーケストレーションのみを担い、DB アクセスは
 * AttachmentsRepository 経由（§2）、Entity→DTO 変換は mapper（§1）に委ねる。
 *
 * 設計（案A・版固定）: 添付は「添付時点の最新版」を FileVersion id で固定して指す。後からファイルへ
 * 新版が上がっても添付内容は当時の版を指し続ける。targetType により混在 PK（task=Int / chatMessage・theme=UUID）
 * を解決し、ポリモーフィック対象は taskId / chatMessageId / themeId のちょうど一つを埋める（XOR は DB CHECK が backstop）。
 * 権限（添付先ファイルの role 粒度）は後フェーズ（Phase FB+）のため、本フェーズは全認証ユーザー共通。
 * taskComment 分岐もコメント作者と accountId の一致は検証していない（本文の編集/削除は owner 限定
 * だが添付作成はコメント投稿と同種の行為として4種対称に扱う・開発統括承認 dsk-0293）。Phase FB+ 着手時に
 * task/theme/chatMessage と一括で role 粒度化する。
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly repo: AttachmentsRepository,
    private readonly scopeVisibility: ScopeVisibilityService,
  ) {}

  /**
   * 添付元ファイルの器が可視でなければ 404（ADR 0063）。ScopeVisibilityService.assertVisibleOr404 を
   * 使わないのは文言のため: 添付経路は「ファイルが存在しない」時と同一文言でなければ、文言差が
   * ファイル実在の oracle になる（存在秘匿・ADR 0038）。
   */
  private async assertFileSpaceVisible(accountId: string, spaceId: string): Promise<void> {
    const canAccess = await this.scopeVisibility.canAccessSpace(accountId, spaceId);
    if (!canAccess) {
      throw new NotFoundException('添付するファイルが見つかりません');
    }
  }

  /**
   * 添付を作成する。検証順: 添付先（タスク/メッセージ）存在 → ファイル最新版の解決（版固定）→ 作成。
   * 二重添付（同一対象 × 同一版）は @@unique が強制失敗させ、その P2002 を global PrismaExceptionFilter が
   * 409 Conflict へ変換する（§4 エラー一元化・try/catch を書かない）。
   */
  async createAttachment(dto: CreateAttachmentDto, user: AttachmentUser) {
    // v2-262: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, user.id);
    // resolveTarget が対象存在検証 + 存在秘匿の可視性チェック（非可視 Space=404）を兼ねる（ADR 0038）。
    const target = await this.resolveTarget(dto.targetType, dto.targetId, user.id);
    const created = await this.linkLatestVersion(target, dto.fileId, user);
    return ok(toAttachment(created));
  }

  /**
   * 指定対象（タスク/メッセージ/テーマ/コメント）の添付一覧を返す。対象不在も非可視も同じ 404。
   *
   * 存在秘匿（ADR 0038）: 対象不在と、対象が在るが呼び出しアカウントに非可視な Space の 2 枝を、
   * status でも文言でも区別させない。片側だけ 200 空配列で返すと status の差が対象実在の oracle に
   * 戻るため、両枝を同じ targetType の「不在」文言の 404 にする（v2-257）。
   * 「容器/親の配下を返す一覧は不在も 404」という線引きは files.getFolderContent /
   * task-comments.list / task-activities.list / tasks.findTree / accounts.findBySpace と同じ（ADR 0082）。
   */
  async listAttachments(query: ListAttachmentsQueryDto, accountId?: string) {
    // v2-262: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const spaceId = await this.resolveTargetSpaceId(query.targetType, query.targetId);
    if (spaceId === null) {
      // 対象不在の 404。形式不正（BadRequest）は resolveTargetSpaceId が先に投げる。
      throw new NotFoundException(ATTACHMENT_TARGET_NOT_FOUND_MESSAGE[query.targetType]);
    }
    // 対象は在るが非可視の 404。不在と同じ文言にする（v2-254）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      spaceId,
      ATTACHMENT_TARGET_NOT_FOUND_MESSAGE[query.targetType],
    );
    if (query.targetType === 'task') {
      const taskId = this.parseTaskId(query.targetId);
      const rows = await this.repo.findByTask(taskId);
      return ok(rows.map(toAttachment));
    }
    if (query.targetType === 'theme') {
      const themeId = this.assertUuid(query.targetId, '添付先テーマ ID が不正です');
      const rows = await this.repo.findByTheme(themeId);
      return ok(rows.map(toAttachment));
    }
    if (query.targetType === 'taskComment') {
      const taskCommentId = this.assertUuid(query.targetId, '添付先コメント ID が不正です');
      const rows = await this.repo.findByTaskComment(taskCommentId);
      return ok(rows.map(toAttachment));
    }
    const chatMessageId = this.assertUuid(query.targetId, '添付先メッセージ ID が不正です');
    const rows = await this.repo.findByChatMessage(chatMessageId);
    return ok(rows.map(toAttachment));
  }

  /**
   * 添付を解除する。実体ファイルは削除しない（添付はリンクのみ）。対象不在は NOT_FOUND。所有者チェック（H4）。
   * LOW: user optional 運用の意図を明確化（省略時＝内部経路として所有者チェックをスキップ）。
   * controller は必ず user を渡す前提。内部経路から呼ぶ場合は undefined を明示渡しすることでスキップ意図を示す。
   */
  async removeAttachment(id: string, user?: OwnerCheckUser) {
    // v2-262: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型。
    // user 未指定の内部経路は prime 側も判定側もスキップする＝従来どおり）。
    await primeVisibleSpaces(this.scopeVisibility, user?.id);
    // 添付本体と添付先の器を、添付行の実在に依らず常に同じ 3 本で解決する（v2-262）。実在で本数が割れると
    // 応答時間が添付 id の実在 oracle に戻る。
    const existing = await this.repo.findByIdForAuth(id);
    if (!existing) {
      throw new NotFoundException(ATTACHMENT_NOT_FOUND_MESSAGE);
    }
    // 存在秘匿（ADR 0038）: 添付対象の所属 Space が非可視なら、所有者チェックより先に 404 で隠す
    // （他 Space の添付 id 直打ちで存在/所有者の有無を 403/404 の差から推測されるのを防ぐ）。
    // announcement スコープ添付・対象解決不能（孤児）は spaceId=null で本チェック対象外（ADMIN 経路で別途統制）。
    const spaceId = this.resolveAttachmentSpaceId(existing);
    if (spaceId !== null) {
      // 非可視の 404 は添付の不在と同じ文言へ揃える（common/visibility の写し替え・v2-254）。
      await assertSpaceVisibleOr404(
        this.scopeVisibility,
        user?.id,
        spaceId,
        ATTACHMENT_NOT_FOUND_MESSAGE,
      );
    } else if (existing.announcementId != null) {
      // announcement スコープ添付は汎用経路（DELETE /attachments/:id）では扱わない（専用 ADMIN 経路
      // removeForAnnouncement のみ）。spaceId=null で可視性チェックが効かず、存在を 403/404 の差から
      // 推測されるのを防ぐため「無いことにする」=404 で隠す（存在秘匿・ADR 0038）。
      throw new NotFoundException(ATTACHMENT_NOT_FOUND_MESSAGE);
    }
    // 添付者本人または ADMIN のみ解除可能（H4）。user 未指定時は内部経路として通過させる。
    if (user !== undefined) {
      assertOwnerOrAdmin(existing.attachedById, user);
    }
    await this.repo.deleteById(id);
    return ok({ id });
  }

  // ── 掲示板通知（Announcement）専用の添付経路（H0022） ─────────────────────
  // 通知添付は汎用 attachments controller（feature='file' ゲート）を通さず、announcement controller の
  // ADMIN 限定エンドポイントから呼ぶ（汎用経路を ADMIN 以外が叩いて通知へ添付する bypass を避けるため）。
  // 版固定・二重添付防止・409 化のロジックは createAttachment と共通（linkLatestVersion ヘルパで一元化・§3）。

  /** 通知へファイルを添付する。通知存在を検証 → 最新版を固定して作成。二重添付は @@unique で 409。 */
  async createForAnnouncement(announcementId: string, fileId: string, accountId: string) {
    // v2-262: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const announcement = await this.repo.findAnnouncementById(announcementId);
    if (!announcement) {
      throw new NotFoundException('添付先の通知が見つかりません');
    }
    // 通知添付経路は controller 側で ADMIN 限定（@Roles(Role.ADMIN)）。ただし ADR 0063 で
    // 「system Role ADMIN は全フォルダを見られる」バイパスは廃止したため、添付元ファイルの可視性は
    // 一般ユーザーと同じく所属 Space で判定する（ADMIN でも非可視チャネルのファイルは添付できない）。
    const created = await this.linkLatestVersion({ announcementId }, fileId, { id: accountId });
    return ok(toAttachment(created));
  }

  /**
   * 指定通知の添付一覧を DTO 配列で返す（通知詳細への埋め込み用・通知不在でも空配列）。
   * 独立エンドポイントを設けず announcement detail GET に埋めるため ok() で包まない raw 配列を返す。
   */
  async listDtosForAnnouncement(announcementId: string): Promise<AttachmentResponseDto[]> {
    const rows = await this.repo.findByAnnouncement(announcementId);
    return rows.map(toAttachment);
  }

  /**
   * 通知スコープで添付を解除する。当該添付が指定通知のものでなければ NOT_FOUND（他通知 / 他対象の添付 id を
   * 渡しての横断削除を防ぐ）。実体ファイルには触れない（添付はリンクのみ）。ADMIN 限定は controller 側で enforce。
   */
  async removeForAnnouncement(announcementId: string, attachmentId: string) {
    const existing = await this.repo.findById(attachmentId);
    if (!existing || existing.announcementId !== announcementId) {
      throw new NotFoundException(ATTACHMENT_NOT_FOUND_MESSAGE);
    }
    await this.repo.deleteById(attachmentId);
    return ok({ id: attachmentId });
  }

  /**
   * 添付先（XOR 列）とファイル id から、添付時点の最新版を固定して Attachment を作成する共通処理（§3）。
   * createAttachment（task/chat/theme）と createForAnnouncement で共有。ファイル不在 / 版なしは NOT_FOUND。
   * 二重添付（同一対象 × 同一版）は @@unique → P2002 を global filter が 409 化（§4・try/catch を書かない）。
   *
   * 【既知の許容点（cmn-0290）: 可視性喪失の残余窓】
   * 下の「現在の器で可視性を判定」直後〜 insert の間に並行して所属（membership）が外れると、
   * 判定は通ったのに保存されてしまう。影響は「剥奪直後の 1 リクエスト」＝添付メタデータ
   * （ファイル名等）が 1 行残るだけに閉じる。中身の閲覧はファイル側のダウンロード経路が同じ可視性で
   * 別途ガードしているため漏れない。直列化には可視性解決の経路全体へ tx を通す構造改変が要り、
   * 手術の大きさが影響に見合わないため fil-0108 と同理由で許容する。本メソッドはファイル移動の競合
   * （①で読んだ器で判定 → 移動後の器を無視）は insert 直前の再読で塞ぐ。
   */
  private async linkLatestVersion(
    target: AttachmentTargetCols,
    fileId: string,
    user: AttachmentUser,
  ): Promise<AttachmentWithDisplay> {
    const version = await this.repo.findLatestFileVersion(fileId);
    if (!version) {
      throw new NotFoundException('添付するファイルが見つかりません');
    }
    // ① 添付元ファイルの器が可視であることを要求する（cmn-0279・metadata IDOR 封止）。
    // ② さらに insert 直前に現在の器を **読み直して** 判定し直す（cmn-0290・TOCTOU 窓の
    //    file 移動ケース塞ぎ）。fileVersionId は維持（版固定）。
    // 非可視は「ファイル実在しない時」と同一文言の 404（存在秘匿・ADR 0038）で応答する。
    await this.assertFileSpaceVisible(user.id, version.spaceId);
    const currentSpaceId = await this.repo.findFileCurrentSpaceId(fileId);
    if (currentSpaceId === null) {
      // ① と ② の間にファイル自体が消えたケース。findLatestFileVersion の null 経路と文言を揃え、
      // 外部キー違反（P2003）に頼らず fail-closed（criteria 3）。
      throw new NotFoundException('添付するファイルが見つかりません');
    }
    await this.assertFileSpaceVisible(user.id, currentSpaceId);
    return this.repo.createAttachment({
      fileVersionId: version.id,
      taskId: target.taskId,
      chatMessageId: target.chatMessageId,
      themeId: target.themeId,
      announcementId: target.announcementId,
      taskCommentId: target.taskCommentId,
      attachedById: user.id,
    });
  }

  /**
   * targetType に応じて添付先の存在を検証し、XOR 対象（taskId / chatMessageId / themeId のいずれか一つ）を返す。
   * task は整数 id、chatMessage / theme は UUID。形式不正は BadRequest、存在しなければ NOT_FOUND。
   * 存在秘匿（ADR 0038）: accountId 指定時、対象の所属 Space が非可視なら 404 を投げ、
   * 他 Space の対象への添付作成を塞ぐ（accountId 未指定の内部経路はチェックをスキップ）。
   * 非可視の 404 は対象不在と同じ文言へ揃える（common/visibility の写し替え・v2-254）。
   */
  private async resolveTarget(
    targetType: AttachmentTargetType,
    targetId: string,
    accountId?: string,
  ): Promise<AttachmentTargetCols> {
    if (targetType === 'task') {
      const taskId = this.parseTaskId(targetId);
      const task = await this.repo.findTaskById(taskId);
      if (!task) {
        throw new NotFoundException(ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.task);
      }
      await assertSpaceVisibleOr404(
        this.scopeVisibility,
        accountId,
        task.spaceId ?? DEFAULT_CHANNEL_ID,
        ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.task,
      );
      return { taskId };
    }
    if (targetType === 'theme') {
      const themeId = this.assertUuid(targetId, '添付先テーマ ID が不正です');
      const theme = await this.repo.findThemeById(themeId);
      if (!theme) {
        throw new NotFoundException(ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.theme);
      }
      await assertSpaceVisibleOr404(
        this.scopeVisibility,
        accountId,
        theme.spaceId ?? DEFAULT_CHANNEL_ID,
        ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.theme,
      );
      return { themeId };
    }
    if (targetType === 'taskComment') {
      const taskCommentId = this.assertUuid(targetId, '添付先コメント ID が不正です');
      const comment = await this.repo.findTaskCommentById(taskCommentId);
      if (!comment) {
        throw new NotFoundException(ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.taskComment);
      }
      // コメントの可視性は親タスクの器に従う（コメントは spaceId を直接持たない・ADR 0038）。
      await assertSpaceVisibleOr404(
        this.scopeVisibility,
        accountId,
        comment.task.spaceId ?? DEFAULT_CHANNEL_ID,
        ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.taskComment,
      );
      return { taskCommentId };
    }
    const chatMessageId = this.assertUuid(targetId, '添付先メッセージ ID が不正です');
    const message = await this.repo.findChatMessageById(chatMessageId);
    if (!message) {
      throw new NotFoundException(ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.chatMessage);
    }
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      message.theme.spaceId ?? DEFAULT_CHANNEL_ID,
      ATTACHMENT_TARGET_NOT_FOUND_MESSAGE.chatMessage,
    );
    return { chatMessageId };
  }

  /**
   * 一覧用の Space 解決（ADR 0038）。targetType+targetId から添付対象の所属 Space を解決する。
   * 対象不在は null（呼び出し元の一覧は同じ targetType の「不在」文言の 404 にして存在を隠す・v2-257）。
   * 形式不正は BadRequest（作成側と同じ検証）。
   * spaceId 直接列を持たない chatMessage は theme.spaceId を辿る。未刻印は DEFAULT_CHANNEL_ID へ収容。
   */
  private async resolveTargetSpaceId(
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<string | null> {
    if (targetType === 'task') {
      const taskId = this.parseTaskId(targetId);
      const task = await this.repo.findTaskById(taskId);
      return task ? (task.spaceId ?? DEFAULT_CHANNEL_ID) : null;
    }
    if (targetType === 'theme') {
      const themeId = this.assertUuid(targetId, '添付先テーマ ID が不正です');
      const theme = await this.repo.findThemeById(themeId);
      return theme ? (theme.spaceId ?? DEFAULT_CHANNEL_ID) : null;
    }
    if (targetType === 'taskComment') {
      const taskCommentId = this.assertUuid(targetId, '添付先コメント ID が不正です');
      const comment = await this.repo.findTaskCommentById(taskCommentId);
      return comment ? (comment.task.spaceId ?? DEFAULT_CHANNEL_ID) : null;
    }
    const chatMessageId = this.assertUuid(targetId, '添付先メッセージ ID が不正です');
    const message = await this.repo.findChatMessageById(chatMessageId);
    return message ? (message.theme.spaceId ?? DEFAULT_CHANNEL_ID) : null;
  }

  /**
   * 解除用の Space 解決（ADR 0038）。findByIdForAuth が解決済みの添付先の器を XOR 対象列から選ぶ。
   * task / taskComment は親タスクの器、theme / chatMessage は親テーマの器に従う（コメント・メッセージは
   * spaceId を直接持たない）。対象行が消えている（孤児）と announcement スコープは null を返し、
   * Space 可視性チェックの対象外とする（announcement 添付は ADMIN 限定経路で別途統制）。
   * 対象の実在で照会を省くと本数の差が応答時間の oracle に戻るため、本数の平準化は repository
   * （findByIdForAuth が実在に依らず同じ 3 本を走らせる）が担い、本メソッドは分岐せず写すだけにする（v2-262）。
   */
  private resolveAttachmentSpaceId(att: {
    taskId: number | null;
    themeId: string | null;
    chatMessageId: string | null;
    taskCommentId: string | null;
    taskSpace: { spaceId: string | null } | null;
    themeSpace: { spaceId: string | null } | null;
  }): string | null {
    if (att.taskId != null || att.taskCommentId != null) {
      return att.taskSpace ? (att.taskSpace.spaceId ?? DEFAULT_CHANNEL_ID) : null;
    }
    if (att.themeId != null || att.chatMessageId != null) {
      return att.themeSpace ? (att.themeSpace.spaceId ?? DEFAULT_CHANNEL_ID) : null;
    }
    return null;
  }

  /** task の targetId（整数文字列）を正の整数へ。非整数 / 0 以下は BadRequest。 */
  private parseTaskId(raw: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('添付先タスク ID が不正です');
    }
    return n;
  }

  /** chatMessage の targetId（UUID）を検証。不正は BadRequest。 */
  private assertUuid(raw: string, message: string): string {
    if (!isUUID(raw)) {
      throw new BadRequestException(message);
    }
    return raw;
  }
}
