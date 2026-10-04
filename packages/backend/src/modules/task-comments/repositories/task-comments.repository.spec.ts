import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { TaskCommentsRepository } from './task-comments.repository';
import { PrismaService } from '../../../database/prisma.service';
import { installTxPassthrough } from '../../../__tests__/tx-passthrough';

// tx 内で使う Prisma client モック（$transaction のコールバックに渡す）。
// コメント作成/編集（dsk-0241）と宛先（mentions / dsk-0203）の原子的な書き込みを検証する
// （chat.repository.spec の createMessage / updateMessage と同型）。
const txMock = {
  taskComment: {
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  taskCommentMention: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockPrisma = {
  task: {
    findUnique: jest.fn(),
  },
  taskComment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  account: {
    count: jest.fn(),
  },
  // $transaction(cb) は cb(txMock) を実行して結果を返す（実装は beforeEach で毎回再設定）。
  $transaction: jest.fn(),
};

describe('TaskCommentsRepository', () => {
  let repo: TaskCommentsRepository;

  // cmn-0335: $transaction の通し設定を共通ヘルパへ委譲（見張り込みで beforeEach/afterEach を自前登録）。
  installTxPassthrough(mockPrisma, txMock);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskCommentsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<TaskCommentsRepository>(TaskCommentsRepository);
  });

  describe('create', () => {
    beforeEach(() => {
      txMock.taskComment.create.mockResolvedValue({ id: 'c1' });
      txMock.taskComment.findUniqueOrThrow.mockResolvedValue({ id: 'c1' });
    });

    it('mentionAccountIds 指定時はコメント作成と同一トランザクションで mention 行を createMany すること', async () => {
      await repo.create(1, 'author1', '<p>本文</p>', ['u2', 'u3']);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.taskComment.create.mock.calls[0][0]).toMatchObject({
        data: { taskId: 1, authorId: 'author1', body: '<p>本文</p>' },
      });
      expect(txMock.taskCommentMention.createMany.mock.calls[0][0].data).toEqual([
        { commentId: 'c1', accountId: 'u2' },
        { commentId: 'c1', accountId: 'u3' },
      ]);
    });

    it('mentionAccountIds 未指定なら mention 書き込みを一切行わないこと（従来どおりの投稿）', async () => {
      await repo.create(1, 'author1', '<p>本文</p>');

      expect(txMock.taskCommentMention.createMany).not.toHaveBeenCalled();
      expect(txMock.taskCommentMention.deleteMany).not.toHaveBeenCalled();
    });

    it('作成後に author + 宛先(mentions: account id+name) を include して再取得し返すこと', async () => {
      await repo.create(1, 'author1', '<p>本文</p>', ['u2']);

      const call = txMock.taskComment.findUniqueOrThrow.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'c1' });
      expect(call.include.author).toEqual({ select: { id: true, name: true } });
      expect(call.include.mentions).toEqual({
        include: { account: { select: { id: true, name: true } } },
      });
    });
  });

  describe('update（dsk-0241: コメント本文の編集）', () => {
    beforeEach(() => {
      txMock.taskComment.findUniqueOrThrow.mockResolvedValue({ id: 'c1' });
    });

    it('body 差し替えと宛先全置換（deleteMany→createMany）を同一トランザクションで行うこと', async () => {
      await repo.update('c1', '<p>修正後</p>', ['u2', 'u3']);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.taskComment.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'c1' },
        data: { body: '<p>修正後</p>' },
      });
      expect(txMock.taskCommentMention.deleteMany).toHaveBeenCalledWith({
        where: { commentId: 'c1' },
      });
      expect(txMock.taskCommentMention.createMany.mock.calls[0][0].data).toEqual([
        { commentId: 'c1', accountId: 'u2' },
        { commentId: 'c1', accountId: 'u3' },
      ]);
      // delete → create の順序（全置換のセマンティクス）。
      const deleteOrder = txMock.taskCommentMention.deleteMany.mock.invocationCallOrder[0];
      const createOrder = txMock.taskCommentMention.createMany.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(createOrder);
    });

    it('mentionAccountIds 未指定なら宛先を一切触らない（据え置き / deleteMany も createMany も呼ばない）', async () => {
      await repo.update('c1', '<p>x</p>');

      expect(txMock.taskCommentMention.deleteMany).not.toHaveBeenCalled();
      expect(txMock.taskCommentMention.createMany).not.toHaveBeenCalled();
    });

    it('mentionAccountIds が空配列なら deleteMany のみ（全クリア・createMany は呼ばない）', async () => {
      await repo.update('c1', '<p>x</p>', []);

      expect(txMock.taskCommentMention.deleteMany).toHaveBeenCalledWith({
        where: { commentId: 'c1' },
      });
      expect(txMock.taskCommentMention.createMany).not.toHaveBeenCalled();
    });

    it('更新後に author + 宛先(mentions: account id+name) を include して再取得し返すこと', async () => {
      await repo.update('c1', '<p>x</p>');

      const call = txMock.taskComment.findUniqueOrThrow.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'c1' });
      expect(call.include.mentions).toEqual({
        include: { account: { select: { id: true, name: true } } },
      });
    });
  });

  describe('countAccountsByIds', () => {
    it('指定 id 群のうち実在するアカウント数を返すこと（存在検証用）', async () => {
      mockPrisma.account.count.mockResolvedValue(2);

      const n = await repo.countAccountsByIds(['u1', 'u2']);

      expect(mockPrisma.account.count.mock.calls[0][0].where).toEqual({ id: { in: ['u1', 'u2'] } });
      expect(n).toBe(2);
    });
  });
});
