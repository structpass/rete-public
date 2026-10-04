import { toTaskCommentResponse } from './task-comments.mapper';

// 固定日時で ISO 文字列変換を決定的に検証する。
const CREATED = new Date('2026-06-23T01:23:45.000Z');
const UPDATED = new Date('2026-06-23T02:00:00.000Z');
const author = { id: 'acc-1', name: '山田太郎' };

describe('task-comments.mapper', () => {
  const comment = {
    id: 'cmt-1',
    taskId: 42,
    authorId: 'acc-1',
    body: '対応しました',
    createdAt: CREATED,
    updatedAt: UPDATED,
    author,
  };

  it('主要フィールドと投稿者(id+name)を DTO に写すこと', () => {
    const dto = toTaskCommentResponse(comment);
    expect(dto.id).toBe('cmt-1');
    expect(dto.taskId).toBe(42);
    expect(dto.body).toBe('対応しました');
    expect(dto.author).toEqual({ id: 'acc-1', name: '山田太郎' });
  });

  it('author は id/name のみへ絞り、authorId 等の生フィールドを露出しないこと（§1 DTO 境界）', () => {
    const dto = toTaskCommentResponse(comment);
    expect(Object.keys(dto.author).sort()).toEqual(['id', 'name']);
    // Entity の authorId スカラーは DTO author に漏らさない。
    expect((dto.author as unknown as Record<string, unknown>).authorId).toBeUndefined();
  });

  it('createdAt / updatedAt を ISO 8601 文字列へ変換すること', () => {
    const dto = toTaskCommentResponse(comment);
    expect(dto.createdAt).toBe('2026-06-23T01:23:45.000Z');
    expect(dto.updatedAt).toBe('2026-06-23T02:00:00.000Z');
    expect(typeof dto.createdAt).toBe('string');
  });

  it('DTO は許可されたキーのみを持つこと（Entity 直返しでない）', () => {
    const dto = toTaskCommentResponse(comment);
    expect(Object.keys(dto).sort()).toEqual([
      'attachments',
      'author',
      'body',
      'createdAt',
      'id',
      'mentions',
      'reactions',
      'taskId',
      'updatedAt',
    ]);
  });

  it('添付を include しない経路（attachments 未指定）では空配列を返すこと（dsk-0249）', () => {
    const dto = toTaskCommentResponse(comment);
    expect(dto.attachments).toEqual([]);
  });

  it('宛先を include しない経路（mentions 未指定）では空配列を返すこと（dsk-0203）', () => {
    const dto = toTaskCommentResponse(comment);
    expect(dto.mentions).toEqual([]);
  });

  it('リアクションを include しない経路（reactions 未指定）では空配列を返すこと（dsk-0297）', () => {
    const dto = toTaskCommentResponse(comment);
    expect(dto.reactions).toEqual([]);
  });

  it('リアクションは chat.mapper.aggregateReactions で emoji 別集計・reactedByMe 判定すること（dsk-0297・§3 コピペ禁止で再利用）', () => {
    const dto = toTaskCommentResponse(
      {
        ...comment,
        reactions: [
          { emoji: '👍', authorId: 'acc-1' },
          { emoji: '👍', authorId: 'acc-2' },
          { emoji: '🎉', authorId: 'acc-2' },
        ],
      },
      'acc-1',
    );
    expect(dto.reactions).toEqual([
      { emoji: '👍', count: 2, reactedByMe: true },
      { emoji: '🎉', count: 1, reactedByMe: false },
    ]);
  });

  it('宛先ありは account を id+name のみへ畳むこと（dsk-0203・§1 DTO 境界）', () => {
    const dto = toTaskCommentResponse({
      ...comment,
      mentions: [
        { account: { id: 'acc-2', name: '受信 花子' } },
        { account: { id: 'acc-3', name: '受信 次郎' } },
      ],
    });
    expect(dto.mentions).toEqual([
      { id: 'acc-2', name: '受信 花子' },
      { id: 'acc-3', name: '受信 次郎' },
    ]);
    // account の生フィールド（email 等）を持ち込まない（id/name のみ）。
    expect(Object.keys(dto.mentions[0]).sort()).toEqual(['id', 'name']);
  });

  it('添付ありは toAttachment で表示用 DTO へ写すこと（dsk-0249・チャット発話と対称）', () => {
    const attDisplay = {
      id: 'att-1',
      fileVersionId: 'ver-1',
      taskId: null,
      chatMessageId: null,
      themeId: null,
      announcementId: null,
      taskCommentId: 'cmt-1',
      attachedById: 'acc-1',
      createdAt: CREATED,
      fileVersion: {
        id: 'ver-1',
        versionNo: 2,
        byteSize: BigInt(2048),
        mimeType: 'text/csv',
        file: { id: 'file-1', name: 'data.csv' },
      },
      attachedBy: { name: '山田太郎' },
    };
    const dto = toTaskCommentResponse({
      ...comment,
      // mapper は AttachmentWithDisplay payload 型を受ける（include 経路の Prisma 戻り値と同型）。
      attachments: [attDisplay as never],
    });
    expect(dto.attachments).toEqual([
      {
        id: 'att-1',
        fileId: 'file-1',
        fileName: 'data.csv',
        versionNo: 2,
        byteSize: 2048,
        mimeType: 'text/csv',
        attachedBy: '山田太郎',
        createdAt: CREATED.toISOString(),
      },
    ]);
  });
});
