import { Injectable } from '@nestjs/common';
import { Attachment, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * 添付の表示用 include（固定版 → ファイル名 + 添付者名のみ）。include 形状の SSOT は本 repository。
 * passwordHash 等の個人情報は select しない（chat / file と同方針）。
 */
export const attachmentDisplayInclude = {
  fileVersion: {
    select: {
      id: true,
      versionNo: true,
      byteSize: true,
      mimeType: true,
      file: { select: { id: true, name: true } },
    },
  },
  attachedBy: { select: { name: true } },
} as const;

/** 表示用 include 済みの Attachment（mapper の入力型）。 */
export type AttachmentWithDisplay = Prisma.AttachmentGetPayload<{
  include: typeof attachmentDisplayInclude;
}>;

/** 添付作成の永続化データ（版固定済み fileVersionId + XOR 対象 + 添付者）。 */
export interface NewAttachmentData {
  fileVersionId: string;
  taskId?: number;
  chatMessageId?: string;
  themeId?: string;
  announcementId?: string;
  taskCommentId?: string;
  attachedById: string;
}

/** ファイル最新版の最小情報（版固定の解決結果）。folderId は添付元フォルダの ACL 判定（cmn-0279）に使う。 */
export interface LatestVersionRef {
  id: string;
  versionNo: number;
  /** 添付元ファイルが属する器（Space）id（非可視 space の添付を 404 で拒否する cmn-0279 の判定材料）。 */
  spaceId: string;
}

/**
 * 解除（DELETE /attachments/:id）の認可判定に要る最小情報（findByIdForAuth の戻り）。
 * 添付本体の XOR 対象列に加え、添付先の器（task / theme。taskComment・chatMessage は親を辿った結果）を持つ。
 */
export interface AttachmentAuthView {
  id: string;
  attachedById: string;
  announcementId: string | null;
  taskId: number | null;
  themeId: string | null;
  chatMessageId: string | null;
  taskCommentId: string | null;
  /** 添付先タスク（task 添付 / taskComment の親タスク）の器。該当なし・対象行が消えていれば null。 */
  taskSpace: { spaceId: string | null } | null;
  /** 添付先テーマ（theme 添付 / chatMessage の親テーマ）の器。同上。 */
  themeSpace: { spaceId: string | null } | null;
}

/**
 * 添付（Attachment）のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * 本クラスは Prisma Entity / payload だけを返し、DTO 変換は mapper（§1）に委ねる。
 * ディレクトリ単位権限（spec §5）は後フェーズ（Phase FB+）のため、ここでは権限フィルタを行わない。
 */
@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 添付先タスクの存在確認 + 所属 Space 解決（存在秘匿の可視性判定に spaceId を返す・ADR 0038）。 */
  findTaskById(id: number): Promise<{ id: number; spaceId: string | null } | null> {
    return this.prisma.task.findUnique({ where: { id }, select: { id: true, spaceId: true } });
  }

  /**
   * 添付先チャット発話の存在確認 + 所属 Space 解決。ChatMessage は spaceId を直接持たず
   * theme（ChatTheme）経由で器に属するため、theme.spaceId を併せて返す（ADR 0038）。
   *
   * 存在秘匿の応答コスト平準化（v2-262）: 入れ子 select で親テーマを取ると、発話行が在るときだけ関係
   * クエリが 1 本増え、不在 1 本 / 実在 2 本と割れる（Prisma の既定は relation ごとに別クエリ）。
   * 発話 id の関係フィルタで親テーマを引き、対象の実在に依らず常に同じ 2 本を走らせる。
   */
  async findChatMessageById(
    id: string,
  ): Promise<{ id: string; theme: { spaceId: string | null } } | null> {
    const [message, theme] = await Promise.all([
      this.prisma.chatMessage.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.chatTheme.findFirst({
        where: { messages: { some: { id } } },
        select: { spaceId: true },
      }),
    ]);
    if (!message) return null;
    return { id: message.id, theme: { spaceId: theme?.spaceId ?? null } };
  }

  /** 添付先チャットテーマの存在確認 + 所属 Space 解決（ADR 0038）。 */
  findThemeById(id: string): Promise<{ id: string; spaceId: string | null } | null> {
    return this.prisma.chatTheme.findUnique({ where: { id }, select: { id: true, spaceId: true } });
  }

  /** 添付先掲示板通知の存在確認（id のみ・H0022）。 */
  findAnnouncementById(id: string): Promise<{ id: string } | null> {
    return this.prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  }

  /**
   * 添付先タスクコメントの存在確認 + 認可用の spaceId 解決（dsk-0249）。TaskComment は spaceId を直接持たず
   * 親タスク（Task）の器に属するため、task.spaceId を併せて返す（findChatMessageById と同方針・ADR 0038）。
   *
   * 存在秘匿の応答コスト平準化（v2-262）: 入れ子 select はコメント行が在るときだけ関係クエリを増やす。
   * コメント id の関係フィルタで親タスクを引き、対象の実在に依らず常に同じ 2 本を走らせる。
   */
  async findTaskCommentById(
    id: string,
  ): Promise<{ id: string; task: { spaceId: string | null } } | null> {
    const [comment, task] = await Promise.all([
      this.prisma.taskComment.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.task.findFirst({
        where: { comments: { some: { id } } },
        select: { spaceId: true },
      }),
    ]);
    if (!comment) return null;
    return { id: comment.id, task: { spaceId: task?.spaceId ?? null } };
  }

  /**
   * 指定ファイルの最新版（versionNo 降順の先頭 1 件）を引く。添付時の版固定に使う。
   * ファイル不在 / 実体未保存（版なし）は null。
   * 所属フォルダの器（spaceId）を file→folder 経由で併せて返す（添付元の可視性判定に使う・
   * cmn-0279。ADR 0063 で判定単位が folder の ACL から Space の可視性へ移った）。
   */
  async findLatestFileVersion(fileId: string): Promise<LatestVersionRef | null> {
    // 存在秘匿の応答コスト平準化（v2-262）: 器（folder.spaceId）を入れ子 select で取ると、版が在るときだけ
    // 親を辿る関係クエリが走り、実測で 版なし 1 本 / 版あり 3 本（file → folder の 2 段）と割れる。
    // 版と器を別クエリに分け、**版が無くても器の照会を省かない**（常に 2 本。器は現在の所属
    // フォルダを読む＝入れ子 select と同じ意味）。
    const [version, folder] = await Promise.all([
      this.prisma.fileVersion.findFirst({
        where: { fileId },
        orderBy: { versionNo: 'desc' },
        select: { id: true, versionNo: true },
      }),
      this.prisma.folder.findFirst({
        where: { files: { some: { id: fileId } } },
        select: { spaceId: true },
      }),
    ]);
    // 版なし / ファイルの器が欠けている不整合（FK 崩れ等）は null として扱い、後段の可視性判定が
    // 同じ 404 メッセージで「添付するファイルが見つかりません」を返す（cmn-0279 と同じ動線）。
    if (!version || !folder) return null;
    return { id: version.id, versionNo: version.versionNo, spaceId: folder.spaceId };
  }

  /**
   * 指定ファイルの **現在の** 所属器（spaceId）のみを select する単一クエリ（cmn-0290）。
   * findLatestFileVersion は「リクエスト開始時点の最新版＋その器」を返すため、①最新版取得後
   * にファイルが別フォルダへ移動されると判定が古い器のままになり、移動先の可視性を無視して
   * 添付できてしまう（TOCTOU・silent accept）。本メソッドはその穴を塞ぐために insert 直前で
   * 現在の器を読み直し、判定をやり直すための専用経路。
   *
   * 返す値の意味:
   * - 文字列: その時点でファイルが属する器（Space）id。可視性判定に使う。
   * - null: ファイル自体が削除済み / 既に存在しない。サービス層は 404（文言「添付するファイルが
   *   見つかりません」）で従来動線と揃える（findLatestFileVersion の null 経路と文言一致・criteria 3）。
   *
   * version は再解決しない（fileVersionId を保持する＝版固定・criteria 2）。器だけを別途読むので、
   * 既存クエリ findLatestFileVersion には手を入れず、判定基準の揺れを最小に留める。
   */
  findFileCurrentSpaceId(fileId: string): Promise<string | null> {
    return this.prisma.file
      .findUnique({ where: { id: fileId }, select: { folder: { select: { spaceId: true } } } })
      .then((row) => row?.folder.spaceId ?? null);
  }

  /** 添付を作成する。二重添付は @@unique で P2002 となり PrismaExceptionFilter が 409 化する。 */
  createAttachment(data: NewAttachmentData): Promise<AttachmentWithDisplay> {
    return this.prisma.attachment.create({
      data: {
        fileVersionId: data.fileVersionId,
        taskId: data.taskId,
        chatMessageId: data.chatMessageId,
        themeId: data.themeId,
        announcementId: data.announcementId,
        taskCommentId: data.taskCommentId,
        attachedById: data.attachedById,
      },
      include: attachmentDisplayInclude,
    });
  }

  /** 指定タスクの添付一覧（添付日時昇順・同一日時は id 昇順で安定順を担保）。 */
  findByTask(taskId: number): Promise<AttachmentWithDisplay[]> {
    return this.prisma.attachment.findMany({
      where: { taskId },
      include: attachmentDisplayInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** 指定チャット発話の添付一覧（添付日時昇順・同一日時は id 昇順で安定順を担保）。 */
  findByChatMessage(chatMessageId: string): Promise<AttachmentWithDisplay[]> {
    return this.prisma.attachment.findMany({
      where: { chatMessageId },
      include: attachmentDisplayInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** 指定チャットテーマの添付一覧（添付日時昇順・同一日時は id 昇順で安定順を担保）。 */
  findByTheme(themeId: string): Promise<AttachmentWithDisplay[]> {
    return this.prisma.attachment.findMany({
      where: { themeId },
      include: attachmentDisplayInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** 指定掲示板通知の添付一覧（添付日時昇順・同一日時は id 昇順で安定順を担保・H0022）。 */
  findByAnnouncement(announcementId: string): Promise<AttachmentWithDisplay[]> {
    return this.prisma.attachment.findMany({
      where: { announcementId },
      include: attachmentDisplayInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** 指定タスクコメントの添付一覧（添付日時昇順・同一日時は id 昇順で安定順を担保・dsk-0249）。 */
  findByTaskComment(taskCommentId: string): Promise<AttachmentWithDisplay[]> {
    return this.prisma.attachment.findMany({
      where: { taskCommentId },
      include: attachmentDisplayInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** id 指定で添付を引く（解除の存在チェック用）。 */
  findById(id: string): Promise<Attachment | null> {
    return this.prisma.attachment.findUnique({ where: { id } });
  }

  /**
   * 解除の認可判定に要る最小情報（添付本体 + 添付先の器）を、添付行の実在に依らず常に同じ 3 本で解決する
   * （存在秘匿の応答コスト平準化・v2-262）。
   *
   * 存在秘匿（ADR 0038）は status・文言だけでなく応答時間でも崩れる: 添付行を引いてから対象種別ごとに器を
   * 引く形（findById → findTaskById 等）は、添付が無い枝が 1 本で 404 を返すのに対し在る枝は対象取得の
   * ぶん遅くなり、応答時間が添付 id の実在 oracle になる。本メソッドは添付本体と器 2 種（task / theme）を
   * 添付 id の関係フィルタで同時に引き、**添付行が無くても器の照会を省かない**（常に 3 本）。
   * XOR 制約（対象列のちょうど一つ）により、添付 1 行に対して当たる器は高々 1 種（announcement は両方 null）。
   *
   * 戻り値の契約: 添付行が無ければ null。器は `{ spaceId } | null` の形で返し、**null を DEFAULT_CHANNEL_ID へ
   * 畳まない**（添付先の行が消えた孤児は「既定チャネルの可視性」ではなく「可視性チェック対象外」のまま）。
   * 本チケットは可視性の判定結果を変えないことを受入にしているため、平準化の前に効いていた
   * `findTaskById → null → 判定対象外` の意味をそのまま保存する。v2-259 の task-comments.findByIdForAuth が
   * 孤児を `{ spaceId: null }` へ合成して DEFAULT_CHANNEL_ID で判定するのは、あちらが入れ子 select の
   * `comment.task` をそのまま読む形（孤児は例外）だったためで、平準化前の契約が違う。ここでは揃えない
   * （孤児は XOR CHECK と FK の onDelete: Cascade により通常到達しない・service 側は null を判定対象外にする）。
   */
  async findByIdForAuth(id: string): Promise<AttachmentAuthView | null> {
    const [attachment, taskSpace, themeSpace] = await Promise.all([
      this.prisma.attachment.findUnique({
        where: { id },
        select: {
          id: true,
          attachedById: true,
          announcementId: true,
          taskId: true,
          themeId: true,
          chatMessageId: true,
          taskCommentId: true,
        },
      }),
      // task 添付は直接、taskComment 添付は親タスク経由。どちらも「この添付 id を持つタスク」を 1 本で引く。
      this.prisma.task.findFirst({
        where: {
          OR: [
            { attachments: { some: { id } } },
            { comments: { some: { attachments: { some: { id } } } } },
          ],
        },
        select: { spaceId: true },
      }),
      // theme 添付は直接、chatMessage 添付は親テーマ経由（発話は spaceId を直接持たない・ADR 0038）。
      this.prisma.chatTheme.findFirst({
        where: {
          OR: [
            { attachments: { some: { id } } },
            { messages: { some: { attachments: { some: { id } } } } },
          ],
        },
        select: { spaceId: true },
      }),
    ]);
    if (!attachment) return null;
    return { ...attachment, taskSpace, themeSpace };
  }

  /** 添付を解除（行削除）する。実体ファイルには触れない（添付はリンクのみ）。 */
  deleteById(id: string): Promise<Attachment> {
    return this.prisma.attachment.delete({ where: { id } });
  }
}
