import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { attachmentDisplayInclude } from '../../attachments/repositories/attachments.repository';

// 投稿者は表示名 + id のみ取得（email 等の個人情報をクエリに乗せない・chat.repository と同方針）。
const authorSelect = { select: { id: true, name: true } } as const;

// 添付（dsk-0249）はチャット発話と同じく添付モジュールの表示用 include を再利用（include 形状の SSOT は
// attachments.repository）。createdAt 昇順 + id タイブレークの二段キーで同梱し、コメント＝スレッド
// 投稿物にぶら下がる添付を安定順で表示する（cmn-0236 で attachments.repository と整合）。
// 各要素に `as const` を付けるのは文字列リテラル 'asc' を型推論させるためで、配列自体は mutable
// のままにして Prisma の AttachmentOrderByWithRelationInput[] 互換を保つ（chat.repository と同型）。
const attachmentOrderBy = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
const attachmentInclude = {
  include: attachmentDisplayInclude,
  orderBy: attachmentOrderBy,
} as const;

// メンション先は account を id+name に絞って同梱（DTO 境界・dsk-0203・chat.repository と同方針）。
const mentionInclude = { include: { account: authorSelect } } as const;

// リアクションは集計に使う emoji / authorId のみ取得（chat.repository.reactionSelect と同方針・
// mapper の aggregateReactions が消費・dsk-0297）。
const reactionInclude = { select: { emoji: true, authorId: true } } as const;

// コメント取得の共通 include（author + 添付 + 宛先 + リアクション）。listByTask / create / update が
// 共有する（§3 コピペ回避）。
const commentDisplayInclude = {
  author: authorSelect,
  attachments: attachmentInclude,
  mentions: mentionInclude,
  reactions: reactionInclude,
} as const;

/**
 * タスクコメントのデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * 認可（Space 可視性）に必要な親タスクの spaceId 解決もここで担い、Service が tasks モジュールへ依存しないようにする。
 */
@Injectable()
export class TaskCommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 親タスクの存在確認 + 認可用の spaceId を 1 クエリで解決する（コメントの可視性は親タスクの器に従う）。
   * tasks モジュールへ依存せず、コメント側 repository が直接 Task を引く（chat → account 存在検証と同パターン）。
   */
  async findTaskForComment(taskId: number) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, spaceId: true },
    });
  }

  /**
   * 当該タスクのコメントを時系列昇順で取得（@@index([taskId, createdAt]) に整合）。author を id+name で、
   * 添付（dsk-0249）を表示用 include で同梱する（チャット発話一覧と対称）。
   */
  async listByTask(taskId: number) {
    return this.prisma.taskComment.findMany({
      where: { taskId },
      include: commentDisplayInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * コメント作成 + メンション行作成を 1 トランザクションで原子的に行い、投稿レスポンス用に
   * author（id+name）+ 添付（作成直後は空・後から flush で紐づく）+ 宛先（mentions / dsk-0203）を
   * 同梱して返す。body は service で sanitize 済み、メンション存在検証は service（countAccountsByIds）で
   * 済ませた前提（chat.createMessage と同方針・ここは永続化に専念）。
   */
  async create(taskId: number, authorId: string, body: string, mentionAccountIds?: string[]) {
    const mentionIds = mentionAccountIds ?? [];
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: { taskId, authorId, body },
        select: { id: true },
      });
      if (mentionIds.length > 0) {
        await tx.taskCommentMention.createMany({
          data: mentionIds.map((accountId) => ({ commentId: comment.id, accountId })),
        });
      }
      // 宛先（mentions）を含めて再取得し、投稿レスポンスに誰宛てかを載せる（mapper が id+name へ畳む）。
      return tx.taskComment.findUniqueOrThrow({
        where: { id: comment.id },
        include: commentDisplayInclude,
      });
    });
  }

  /**
   * 編集・削除の認可判定に必要な情報のみを解決する（dsk-0241）。投稿者（authorId）・親タスク id・可視性ゲート用の
   * 親タスク spaceId を、コメント行の実在に依らず同じ本数（常に 2 本を並行）で取得する（v2-259）。
   * コメント不在は null（service が 404 へ畳む）。
   */
  async findByIdForAuth(commentId: string) {
    // v2-259: 同梱（nested select）はコメント行が在るときだけ追加クエリが走るため、対象の実在に依存せず
    // 常に同じ 2 本を走らせる形（Promise.all）へ変える（不在 1 本 / 実在 2 本の差が応答時間の oracle だった）。
    // 親タスクはコメント id の関係フィルタで引く（chat.repository.findMessageById と同型・v2-255）。
    const [comment, task] = await Promise.all([
      this.prisma.taskComment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, taskId: true },
      }),
      // task.id は URL の taskId との親子 cross-validate（dsk-0260）に使う。
      this.prisma.task.findFirst({
        where: { comments: { some: { id: commentId } } },
        select: { id: true, spaceId: true },
      }),
    ]);
    if (!comment) return null;
    // 返す形は従来の include と同じ（呼び出し側は comment.task.spaceId / comment.task.id を読む）。
    return {
      id: comment.id,
      authorId: comment.authorId,
      task: task ?? { id: comment.taskId, spaceId: null },
    };
  }

  /**
   * コメント本文の編集（dsk-0241）。body 差し替えと宛先（mentions / dsk-0203）の全置換を
   * 1 トランザクションで原子的に行う。mentionAccountIds=undefined は宛先据え置き（mentions を一切
   * 触らない）/ 配列（空含む）は delete→createMany で全置換（chat.updateMessage と同方針）。
   * body は service で sanitize 済み、メンション存在検証は service（countAccountsByIds）で済ませた前提。
   * レスポンス用に author（id+name）+ 添付（dsk-0249）+ 宛先を同梱して返す（編集では既存添付を保持）。
   */
  async update(commentId: string, body: string, mentionAccountIds?: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.taskComment.update({ where: { id: commentId }, data: { body } });
      if (mentionAccountIds !== undefined) {
        await tx.taskCommentMention.deleteMany({ where: { commentId } });
        if (mentionAccountIds.length > 0) {
          await tx.taskCommentMention.createMany({
            data: mentionAccountIds.map((accountId) => ({ commentId, accountId })),
          });
        }
      }
      return tx.taskComment.findUniqueOrThrow({
        where: { id: commentId },
        include: commentDisplayInclude,
      });
    });
  }

  /** コメントを物理削除する（復元不能・dsk-0241）。所有/可視性検証は service 層で済ませた前提。 */
  async deleteById(commentId: string) {
    await this.prisma.taskComment.delete({ where: { id: commentId } });
  }

  /** 指定 id 群のうち実在するアカウント数（mentionAccountIds の存在検証用 / service が件数照合する）。 */
  countAccountsByIds(ids: string[]): Promise<number> {
    return this.prisma.account.count({ where: { id: { in: ids } } });
  }
}
