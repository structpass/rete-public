import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { LoginSettingsRepository } from './login-settings.repository';
import { PrismaService } from '../../../database/prisma.service';
import { DEFAULT_MAX_WAIT_MS, DEFAULT_TIMEOUT_MS } from '../../../common/database/serializable-tx';
import { PASSWORD_POLICY_SINGLETON_ID } from '../login-settings.constants';

/**
 * LoginSettingsRepository のユニットテスト。Prisma はモックし、DB アクセス層の境界だけを固定する。
 *
 * ここで検証すること:
 * - パスワードポリシーが singleton 固定 id で引かれ、upsert が create / update とも全 6 項目を
 *   過不足なく置換すること（特に全体強制 MFA を取りこぼさないこと）。
 * - IP 許可リストの全置換が deleteMany + createMany + 再読込を単一 $transaction（Serializable）に
 *   閉じること、sortOrder が配列 index 採番であること、空配列なら createMany を呼ばないこと。
 *
 * E2E / 実 DB へ委譲すること:
 * - 実 PostgreSQL の直列化（SSI）の実挙動と並行 PUT の実際の abort、ロールバックの実効性、
 *   Prisma が最終的に発行する SQL。
 */

// tx 内で使う Prisma client モック（$transaction のコールバックに渡す）。
// tx 外の mockPrisma.ipWhitelistEntry とは別オブジェクトにしておくことで、
// 「再読込が tx の外へ出た」退行を呼び出し先の違いとして検出できる（cmn-0209）。
const txMock = {
  ipWhitelistEntry: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
};

const mockPrisma = {
  passwordPolicy: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  ipWhitelistEntry: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  // runInSerializableTransaction は prisma.$transaction(fn, { isolationLevel }) を呼ぶ。
  // コールバックに txMock を渡し、tx 内の呼び出しだけを検証可能にする（実装は beforeEach で毎回再設定）。
  $transaction: jest.fn(),
};

describe('LoginSettingsRepository', () => {
  let repo: LoginSettingsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoginSettingsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<LoginSettingsRepository>(LoginSettingsRepository);
    // resetMocks により実装は毎テストで剥がれるため、パススルーをここで張り直す。
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof txMock) => unknown, _options?: unknown): Promise<unknown> =>
        cb(txMock),
    );
  });

  // ============================================================
  // パスワードポリシー（singleton・全置換 upsert）
  // ============================================================
  describe('findPasswordPolicy', () => {
    it('singleton 固定 id で findUnique を呼ぶ', async () => {
      mockPrisma.passwordPolicy.findUnique.mockResolvedValue({ id: PASSWORD_POLICY_SINGLETON_ID });

      await repo.findPasswordPolicy();

      expect(mockPrisma.passwordPolicy.findUnique).toHaveBeenCalledWith({
        where: { id: PASSWORD_POLICY_SINGLETON_ID },
      });
    });

    it('未設定（null）はそのまま null を返す（既定値の補完は mapper に委ねる）', async () => {
      mockPrisma.passwordPolicy.findUnique.mockResolvedValue(null);

      await expect(repo.findPasswordPolicy()).resolves.toBeNull();
    });
  });

  describe('upsertPasswordPolicy', () => {
    const patch = {
      requireLowercase: true,
      requireUppercase: false,
      requireNumber: true,
      requireSymbol: false,
      minLength: 12,
      mfaEnforced: true,
    };

    it('where / create / update が singleton id ＋全 6 項目で完全一致する（全置換）', async () => {
      mockPrisma.passwordPolicy.upsert.mockResolvedValue({ id: PASSWORD_POLICY_SINGLETON_ID });

      await repo.upsertPasswordPolicy(patch);

      expect(mockPrisma.passwordPolicy.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.passwordPolicy.upsert).toHaveBeenCalledWith({
        where: { id: PASSWORD_POLICY_SINGLETON_ID },
        create: { id: PASSWORD_POLICY_SINGLETON_ID, ...patch },
        update: { ...patch },
      });
    });

    it('update 側のキー集合が 6 項目と厳密一致する（取りこぼし・混入で落ちる）', async () => {
      mockPrisma.passwordPolicy.upsert.mockResolvedValue({ id: PASSWORD_POLICY_SINGLETON_ID });

      await repo.upsertPasswordPolicy(patch);

      const args = mockPrisma.passwordPolicy.upsert.mock.calls[0][0];
      // 期待値リテラルは既にアルファベット順のため、こちら側の並べ替えは付けない（実引数側だけ整列する）。
      expect(Object.keys(args.update).sort()).toEqual([
        'mfaEnforced',
        'minLength',
        'requireLowercase',
        'requireNumber',
        'requireSymbol',
        'requireUppercase',
      ]);
    });

    // cmn-0345: 「全体強制 MFA（mfaEnforced・ST-2-2）の取りこぼしは「where / create / update が
    // singleton id ＋全 6 項目で完全一致する（全置換）」と「update 側のキー集合が 6 項目と厳密一致する」
    // の両方が落ちる＝単体 it を別に置いても独立に落ちる条件が無いため、意図の記録だけをここに残す。
    // 上記の完全一致 it を緩める改修をする時は、専用 it（mfaEnforced 単体の取りこぼし検知）を戻すこと。
  });

  // ============================================================
  // IP 許可リスト（全置換の原子性・index 採番）
  // ============================================================
  describe('findIpWhitelist', () => {
    it('sortOrder 昇順（同順位は id）で findMany を呼ぶ', async () => {
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValueOnce([]);

      await repo.findIpWhitelist();

      expect(mockPrisma.ipWhitelistEntry.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
    });
  });

  describe('replaceIpWhitelist', () => {
    it('deleteMany + createMany を単一 $transaction（Serializable）で撃ち、sortOrder は配列 index で採番する', async () => {
      txMock.ipWhitelistEntry.findMany.mockResolvedValueOnce([]);
      // 余計なキー（sortOrder）を混ぜても転記されず、index 採番で上書きされることを同時に確認する。
      const entries = [
        { cidr: '10.0.0.0/8', note: 'a', sortOrder: 99 },
        { cidr: '192.168.0.0/16', note: 'b', sortOrder: 99 },
      ];

      await repo.replaceIpWhitelist(entries);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: DEFAULT_TIMEOUT_MS,
        maxWait: DEFAULT_MAX_WAIT_MS,
      });
      expect(txMock.ipWhitelistEntry.deleteMany).toHaveBeenCalledWith({});
      expect(txMock.ipWhitelistEntry.createMany).toHaveBeenCalledWith({
        data: [
          { cidr: '10.0.0.0/8', note: 'a', sortOrder: 0 },
          { cidr: '192.168.0.0/16', note: 'b', sortOrder: 1 },
        ],
      });
      // 全削除 → 再作成 → 再読込の順序まで固定する（入れ替わると許可リストが空になる / 読み値が古くなる）。
      expect(txMock.ipWhitelistEntry.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
        txMock.ipWhitelistEntry.createMany.mock.invocationCallOrder[0],
      );
      expect(txMock.ipWhitelistEntry.createMany.mock.invocationCallOrder[0]).toBeLessThan(
        txMock.ipWhitelistEntry.findMany.mock.invocationCallOrder[0],
      );
    });

    it('空配列（制限解除）は deleteMany のみで createMany を呼ばず、空一覧を返す', async () => {
      txMock.ipWhitelistEntry.findMany.mockResolvedValueOnce([]);

      await expect(repo.replaceIpWhitelist([])).resolves.toEqual([]);

      expect(txMock.ipWhitelistEntry.deleteMany).toHaveBeenCalledWith({});
      expect(txMock.ipWhitelistEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: DEFAULT_TIMEOUT_MS,
        maxWait: DEFAULT_MAX_WAIT_MS,
      });
    });

    it('競合 abort（P2034）は共通ヘルパのリトライで再実行される（上限まで）', async () => {
      // runInSerializableTransaction 経由になったため、reorder 系と同じ自動リトライが効く。
      txMock.ipWhitelistEntry.findMany.mockResolvedValueOnce([]);
      mockPrisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: '6.2.0',
        }),
      );

      await expect(repo.replaceIpWhitelist([])).resolves.toEqual([]);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('P2034 リトライ時に deleteMany が 2 回呼ばれ、トランザクションの中身がもう一度実行される（cmn-0233 MEDIUM6）', async () => {
      // 「やり直しの中で全削除→全登録がもう一度きちんと走ること」（=部分保存しない）を直接観測する。
      // P2034 は Serializable 競合 abort で、tx 内の処理を実行した後 commit 段階で reject される形に
      // なる＝1 回目の callback は完走してから reject、2 回目で callback 再実行 + 成功、となる。
      // これにより deleteMany / createMany が各 2 回呼ばれる（criteria 6: 「全削除が 2 回呼ばれる」）。
      // 空配列のときは deleteMany のみだが createMany は呼ばれないため、非空配列で両方が
      // 2 回ずつ走る形にして「tx の中身がもう一度実行された」ことを直接 assert する。
      txMock.ipWhitelistEntry.findMany.mockResolvedValue([]);
      // 1 回目: tx callback を完走させてから P2034 で reject。2 回目: 通常実装（callback 実行 + 成功）。
      mockPrisma.$transaction
        .mockImplementationOnce(async (cb: (tx: typeof txMock) => unknown) => {
          await cb(txMock);
          throw new Prisma.PrismaClientKnownRequestError('write conflict', {
            code: 'P2034',
            clientVersion: '6.2.0',
          });
        })
        .mockImplementationOnce(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));

      const entries = [{ cidr: '10.0.0.0/8', note: 'a' }];
      await expect(repo.replaceIpWhitelist(entries)).resolves.toEqual([]);

      // リトライで「全削除→全登録」の経路がもう一度走った（=各 2 回）。ここが崩れると「保存したのに
      // 古い行が残る」形の退行が出るため、tx の処理がリトライごと確実に再実行されることを assert する。
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(txMock.ipWhitelistEntry.deleteMany).toHaveBeenCalledTimes(2);
      expect(txMock.ipWhitelistEntry.createMany).toHaveBeenCalledTimes(2);
      // 2 回目は sortOrder を index 採番で作り直す（1 回目の失敗で書き込まれた行は rollback で消える前提）。
      expect(txMock.ipWhitelistEntry.createMany).toHaveBeenLastCalledWith({
        data: [{ cidr: '10.0.0.0/8', note: 'a', sortOrder: 0 }],
      });
    });

    it('返る一覧は tx 内 findMany の結果（tx 外の findMany は使わない＝読み直しが束の外へ出ていない）', async () => {
      const rows = [{ id: 'ip-1', cidr: '10.0.0.0/8', note: 'a', sortOrder: 0 }];
      // cmn-0335: 自動リセット（resetMocks）で毎テスト実装が剥がれるため、Once で置く（後続テストへ漏らさない）。
      txMock.ipWhitelistEntry.findMany.mockResolvedValueOnce(rows);
      // tx 外で読み直す退行が起きたら、こちらの値が返って toBe(rows) が落ちる。
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValueOnce([{ id: 'stale' }]);

      const result = await repo.replaceIpWhitelist([{ cidr: '10.0.0.0/8', note: 'a' }]);

      expect(result).toBe(rows);
      expect(txMock.ipWhitelistEntry.findMany).toHaveBeenCalledTimes(1);
      expect(txMock.ipWhitelistEntry.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      expect(mockPrisma.ipWhitelistEntry.findMany).not.toHaveBeenCalled();
    });
  });
});
