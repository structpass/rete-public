import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { ok, okMessage } from '../../common/dto';
import { assertSpaceVisibleOr404, primeVisibleSpaces } from '../../common/visibility';
import { validateMentionAccountIds, toMentionBadRequest } from '../../common/mentions';
import { sanitizeRichText, toExcerpt } from '../../common/rich-text';
import { assertOwnerOrAdmin, OwnerCheckUser } from '../auth/helpers/assert-owner.helper';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import { TaskCommentsRepository } from './repositories/task-comments.repository';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { UpdateTaskCommentDto } from './dto/update-task-comment.dto';
import { toTaskCommentResponse } from './task-comments.mapper';
import { TaskActivitiesService } from '../task-activities/task-activities.service';
import { ChatService } from '../chat/chat.service';
import { CreateReactionDto } from '../chat/dto/create-reaction.dto';

/**
 * 履歴（commentAdd/commentEdit）に載せるコメント本文抜粋の最大文字数（dsk-0269）。
 * announcement 概要（ANNOUNCEMENT_EXCERPT_MAX_LENGTH=40）と同じ toExcerpt 切り詰めパターンだが、
 * 履歴は「何を書いたか」を追える情報量が要るため上限は独立に持つ（40 字へ連動させない）。
 */
export const TASK_COMMENT_ACTIVITY_EXCERPT_MAX_LENGTH = 140;

/**
 * 404 の「対象不在」文言（v2-254）。対象が存在しない時と、存在するが呼び出し元に非可視の時で
 * 同じ文言を返す——という不変条件を 1 箇所で保つため定数にする。非可視側は common/visibility の
 * assertSpaceVisibleOr404 で本定数へ写し替える（片側だけ変えると応答本文が存在の oracle に戻る・
 * 存在秘匿 ADR 0038）。
 */
const TASK_NOT_FOUND_MESSAGE = 'Task not found';
const TASK_COMMENT_NOT_FOUND_MESSAGE = 'Task comment not found';

@Injectable()
export class TaskCommentsService {
  private readonly logger = new Logger(TaskCommentsService.name);

  constructor(
    private readonly repo: TaskCommentsRepository,
    // 認可境界はタスクと同一（tasks.service / chat.service と同じ ScopeVisibilityService）。
    // 親タスクが非可視 Space なら「無いことにする」= 404（存在秘匿・越境に存在を漏らさない）。
    private readonly scopeVisibility: ScopeVisibilityService,
    // コメント投稿・編集（スレッド明細の追加/編集）を履歴へ記録するため借用（dsk-0246 / dsk-0269）。
    private readonly taskActivities: TaskActivitiesService,
    // リアクショントグル本体を再利用するため借用（dsk-0297・§3 コピペ禁止・ChatModule が export 済）。
    private readonly chatService: ChatService,
  ) {}

  /**
   * 親タスクの存在検証 + Space 可視性ゲートを 1 箇所に集約する（取得・投稿で共通 §3）。
   * tasks.service.findOne と同じ境界: 親タスク不在は 404、非可視 Space も 404 へ畳む。
   * 非可視の 404 は不在と同じ 'Task not found' へ揃える（common/visibility の写し替え・v2-254）。
   */
  private async assertTaskVisible(taskId: number, accountId?: string) {
    // v2-259: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const task = await this.repo.findTaskForComment(taskId);
    if (!task) {
      throw new NotFoundException(TASK_NOT_FOUND_MESSAGE);
    }
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      task.spaceId ?? DEFAULT_CHANNEL_ID,
      TASK_NOT_FOUND_MESSAGE,
    );
  }

  /**
   * 宛先検証・TOCTOU→400 変換は common/mentions の共通ヘルパを使う（dsk-0203・code-review HIGH 是正。
   * chat.service の同名ヘルパを一般化したもの＝逐語重複の3重コピーを排し §3 を守る）。
   */
  private validateMentionAccountIds(ids?: string[]): Promise<string[] | undefined> {
    return validateMentionAccountIds(ids, (unique) => this.repo.countAccountsByIds(unique));
  }

  /** 当該タスクのコメントを時系列昇順で返す（タスク閲覧権限が無ければ 404・親タスクと同じ可視性）。 */
  async list(taskId: number, accountId?: string) {
    await this.assertTaskVisible(taskId, accountId);
    const comments = await this.repo.listByTask(taskId);
    return ok(comments.map((c) => toTaskCommentResponse(c, accountId)));
  }

  /** コメントを投稿する。投稿者は認証ユーザー（authorId）。本文は保存前に sanitize（ADR 0019・保存側防御）。 */
  async create(taskId: number, authorId: string, dto: CreateTaskCommentDto) {
    await this.assertTaskVisible(taskId, authorId);
    // 宛先（メンション先）の重複排除 + 存在検証（dsk-0203・共通ヘルパ）。未指定なら検証スキップ。
    const mentionAccountIds = await this.validateMentionAccountIds(dto.mentionAccountIds);
    const body = sanitizeRichText(dto.body);
    try {
      const comment = await this.repo.create(taskId, authorId, body, mentionAccountIds);
      // dsk-0269: コメント投稿を「メッセージを追加：<本文抜粋>」として履歴に記録する（旧 dsk-0246 の
      // field='thread' 固定文から専用種別 commentAdd へ分離。起点カード更新の 'thread' とは混在しない）。
      // 記録は監査用の副作用。失敗してもコメント投稿（commit 済み）を巻き戻さないよう try/catch で隔離する
      // （tasks.service.recordActivitiesSafely と同方針・recordCommentActivitySafely は throw しない）。
      await this.recordCommentActivitySafely(taskId, authorId, 'commentAdd', body);
      return ok(toTaskCommentResponse(comment, authorId));
    } catch (e) {
      // 検証通過後に対象アカウントが消えた TOCTOU（P2003）を 400 へ変換。それ以外は再 throw（§4 filter へ委譲）。
      return toMentionBadRequest(e);
    }
  }

  /**
   * 親タスク経由で可視性ゲート + taskId cross-validate を 1 箇所に集約する（編集・削除・リアクション
   * トグルで共通・dsk-0241 → dsk-0297 で所有判定を分離）。順序は chat.service.updateMessage と同じ
   * 「存在 → 可視性（404） → cross-validate（404）」。非可視 Space 配下は所有判定より先に 404 へ畳む
   * （越境者へ存在を漏らさない・存在秘匿）。返り値は確定したコメントの認可情報。
   */
  private async assertCommentVisible(
    commentId: string,
    accountId: string | undefined,
    taskId?: number,
  ) {
    // v2-259: 対象取得より先に可視範囲の解決を通す（不在 / 非可視の応答コスト平準化・v2-255 と同型）。
    await primeVisibleSpaces(this.scopeVisibility, accountId);
    const comment = await this.repo.findByIdForAuth(commentId);
    if (!comment) {
      throw new NotFoundException(TASK_COMMENT_NOT_FOUND_MESSAGE);
    }
    // 可視性ゲートを先に通す。非可視 Space 配下のコメントは可視性判定が taskId に依らず一律 404 を返すため、
    // この後の taskId cross-validate がメッセージ差で「正しい親 taskId」を漏らす oracle を作らない
    // （dsk-0260 security-review LOW: 可視性より前に taskId を畳むと、非可視コメントの親 task を taskId 総当たりで
    //  推測できる差分が生じる。可視性先行で非可視は一律遮断＝差分を消す）。非可視の 404 はコメント不在と
    // 同じ 'Task comment not found' へ揃える（common/visibility の写し替え・v2-254）。
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      accountId,
      comment.task.spaceId ?? DEFAULT_CHANNEL_ID,
      TASK_COMMENT_NOT_FOUND_MESSAGE,
    );
    // 可視な親タスク配下でのみ、URL の taskId と実体コメントの親 task.id を cross-validate（dsk-0260）。
    // 不一致は 404（別タスクの URL から他タスクのコメントを触れる経路を塞ぐ）。可視コメントなので親 task は
    // 元から閲覧可能＝ここで 404 を返しても新たな情報漏洩はない。
    if (taskId !== undefined && comment.task.id !== taskId) {
      throw new NotFoundException(TASK_COMMENT_NOT_FOUND_MESSAGE);
    }
    return comment;
  }

  /**
   * 可視性ゲート + 投稿者本人チェック（編集・削除限定・dsk-0241）。所有判定(403)は可視性/cross-validate
   * （404）より後に畳む（存在秘匿と一貫）。リアクショントグルは所有判定不要のため assertCommentVisible を
   * 直接使う（誰でも押せる・dsk-0297 criteria）。
   */
  private async assertCommentOwned(commentId: string, user: OwnerCheckUser, taskId?: number) {
    const comment = await this.assertCommentVisible(commentId, user.id, taskId);
    assertOwnerOrAdmin(comment.authorId, user);
    return comment;
  }

  /**
   * タスクコメントへのリアクションをトグル（dsk-0297）。投稿者本人限定ではなく可視な参加者なら誰でも押せる
   * （所有判定なし＝assertCommentOwned でなく assertCommentVisible を使う）。トグル本体は ChatService の
   * 共有ロジックをそのまま呼び複製しない（§3 コピペ禁止）。
   */
  async toggleReaction(
    taskId: number,
    commentId: string,
    authorId: string,
    dto: CreateReactionDto,
  ) {
    await this.assertCommentVisible(commentId, authorId, taskId);
    return this.chatService.toggleReaction({ taskCommentId: commentId }, authorId, dto.emoji);
  }

  /**
   * コメント本文の編集（dsk-0241）。編集できるのは投稿者本人のみ（assertOwnerOrAdmin / ADMIN はバイパス）。
   * UI のボタン非表示に依存せず backend で 403/404 を返す（IDOR 防御）。本文は保存前に sanitize（ADR 0019）。
   * 宛先（mentionAccountIds / dsk-0203）は指定時のみ重複排除 + 存在検証して全置換する
   * （undefined=据え置き / chat.updateMessage と同方針）。
   */
  async update(
    commentId: string,
    user: OwnerCheckUser,
    dto: UpdateTaskCommentDto,
    taskId?: number,
  ) {
    const comment = await this.assertCommentOwned(commentId, user, taskId);
    const mentionAccountIds = await this.validateMentionAccountIds(dto.mentionAccountIds);
    const body = sanitizeRichText(dto.body);
    try {
      const updated = await this.repo.update(commentId, body, mentionAccountIds);
      // dsk-0269: コメント編集を「メッセージを編集：<本文抜粋>」として履歴に記録する（従来は編集の履歴なし）。
      // taskId は URL 経由（optional）でなく認可済みコメントの実体（comment.task.id）から取る。
      await this.recordCommentActivitySafely(comment.task.id, user.id, 'commentEdit', body);
      return ok(toTaskCommentResponse(updated, user.id));
    } catch (e) {
      // 検証通過後に対象アカウントが消えた TOCTOU（P2003）を 400 へ変換。それ以外は再 throw（§4 filter へ委譲）。
      return toMentionBadRequest(e);
    }
  }

  /**
   * コメントの削除（dsk-0241）。削除できるのは投稿者本人のみ（assertOwnerOrAdmin / ADMIN はバイパス）。
   * 物理削除（復元不能）。UI のボタン非表示に依存せず backend で 403/404 を返す（IDOR 防御）。
   */
  async remove(commentId: string, user: OwnerCheckUser, taskId?: number) {
    await this.assertCommentOwned(commentId, user, taskId);
    await this.repo.deleteById(commentId);
    // 物理削除は復元不能の破壊的操作のため、成功時に誰が何を消したかの監査トレースを残す
    // （chat.service.deleteTheme と同方針・エラー系は filter がログするが成功系はここでしか記録できない）。
    this.logger.log(`Task comment deleted: comment=${commentId} by account=${user.id}`);
    return okMessage('Task comment deleted successfully');
  }

  /**
   * コメント追加・編集の履歴記録を例外隔離して実行する（dsk-0246 → dsk-0269 で種別・抜粋対応）。
   * record 例外でコメント投稿/編集全体を 500 にすると「保存は成功したのに 500」になるため、ここで握って
   * console.error に留める（Prisma 生エラーは接続情報を含みうるため message のみ記録）。
   * toLabel には sanitize 済み本文の抜粋（タグ除去・先頭140字+…）を載せる（fromLabel は使わない）。
   */
  private async recordCommentActivitySafely(
    taskId: number,
    actorAccountId: string,
    field: 'commentAdd' | 'commentEdit',
    sanitizedBody: string,
  ): Promise<void> {
    try {
      await this.taskActivities.record(taskId, actorAccountId, [
        {
          field,
          fromLabel: null,
          toLabel: toExcerpt(sanitizedBody, TASK_COMMENT_ACTIVITY_EXCERPT_MAX_LENGTH),
        },
      ]);
    } catch (err) {
      this.logger.error(
        `[TaskActivity] failed to record ${field} activity for task ${taskId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
