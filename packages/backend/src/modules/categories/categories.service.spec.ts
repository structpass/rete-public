import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './repositories/categories.repository';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import { makeCategoryEntity } from '../../__tests__/factories';

const mockCategory = makeCategoryEntity();

// 認可テスト用の固定値。可視 Space 集合 = ['space-1','space-A']、非可視 = 'space-evil'。
const ACCOUNT_ID = 'acct-1';
const VISIBLE_IDS = ['space-1', 'space-A'];

// cmn-0221: service.reorder が findIdsBySpace での事前検証を捨て、repository.reorder に集合検証を
// 委ねる（tx 内で閉じる）構成になった。service.create は repo.maxSortOrder + repo.create の
// 2 段を repo.createWithAutoSortOrder 1 本に集約（採番と create を同一 tx）。mock の対応も追従。
const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  maxSortOrder: jest.fn(),
  create: jest.fn(),
  createWithAutoSortOrder: jest.fn(),
  update: jest.fn(),
  reorder: jest.fn(),
  delete: jest.fn(),
  countTasks: jest.fn(),
};

const mockScopeVisibility = {
  resolveVisibleSpaceIds: jest.fn(),
  assertVisibleOr404: jest.fn(),
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: CategoriesRepository, useValue: mockRepo },
        { provide: ScopeVisibilityService, useValue: mockScopeVisibility },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    // 既定は「可視」: list は可視集合を返し、write の存在秘匿ガードは通過する。
    // 越境（IDOR）テストのみ各 it 内で reject / 非可視集合に差し替える。
    mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(VISIBLE_IDS);
    mockScopeVisibility.assertVisibleOr404.mockResolvedValue(undefined);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('spaceId スコープで CategoryResponseDto 配列を { success, data } で返すこと（rete-desk-0158）', async () => {
      mockRepo.findAll.mockResolvedValue([mockCategory]);

      const result = await service.findAll('space-1', ACCOUNT_ID);

      // 可視 Space 集合を解決し、repository where へ渡す（フィルタ=repository / ADR 0042）。
      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(mockRepo.findAll).toHaveBeenCalledWith('space-1', false, VISIBLE_IDS);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: mockCategory.id,
          name: mockCategory.name,
          spaceId: mockCategory.spaceId,
          sortOrder: mockCategory.sortOrder,
          archived: false,
        }),
      );
      // mapper 経由で Date が ISO 文字列化されていること
      expect(typeof result.data[0].createdAt).toBe('string');
    });

    it('spaceId と includeArchived=true を repo へ伝搬し、archived フラグを畳んで返す（rete-desk-0140・0158）', async () => {
      const archived = makeCategoryEntity({ id: 2, name: '旧分類', archivedAt: new Date() });
      mockRepo.findAll.mockResolvedValue([mockCategory, archived]);

      const result = await service.findAll('space-1', ACCOUNT_ID, true);

      expect(mockRepo.findAll).toHaveBeenCalledWith('space-1', true, VISIBLE_IDS);
      expect(result.data[1].archived).toBe(true);
      // 生の archivedAt は公開しない（§1 DTO 境界）
      expect(result.data[1]).not.toHaveProperty('archivedAt');
    });

    it('別 Space の分類は混ざらない（spaceId で絞った repo 結果のみ返す / rete-desk-0158）', async () => {
      // repo は spaceId スコープで絞った結果だけを返す契約。service はそれをそのまま DTO 化する。
      const inScope = makeCategoryEntity({ id: 1, name: '受入待ち', spaceId: 'space-A' });
      mockRepo.findAll.mockResolvedValue([inScope]);

      const result = await service.findAll('space-A', ACCOUNT_ID);

      expect(mockRepo.findAll).toHaveBeenCalledWith('space-A', false, VISIBLE_IDS);
      expect(result.data).toHaveLength(1);
      expect(result.data.every((c) => c.spaceId === 'space-A')).toBe(true);
    });

    // IDOR negative（read）: 他 space を直打ちしても、可視集合外なので repository where で
    // 弾かれ空配列になる（他 space の分類は一覧に含まれない / 存在秘匿 ADR 0042）。
    it('可視範囲外の spaceId を直打ちしても、非可視集合を repo へ渡し結果に他 space を含めないこと（IDOR）', async () => {
      mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(['space-1']); // 'space-evil' は不可視
      // 可視フィルタにより Prisma は空を返す（repo は本物では where で除外。ここは契約を模す）。
      mockRepo.findAll.mockResolvedValue([]);

      const result = await service.findAll('space-evil', ACCOUNT_ID);

      // 非可視集合が repository where へ渡されること（フィルタ点は repository）。
      expect(mockRepo.findAll).toHaveBeenCalledWith('space-evil', false, ['space-1']);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.data.some((c) => c.spaceId === 'space-evil')).toBe(false);
    });
  });

  describe('create', () => {
    // cmn-0221: 採番と create を repo.createWithAutoSortOrder 1 本に集約。service は dto.spaceId
    // と create input（space は {connect:{id}}）と dto.sortOrder を素通しするだけ。採番ロジックは
    // repository 側の spec（空 Space で 1 / 既存 max+1）で固定する。
    it('sortOrder 明示時はそれを渡して createWithAutoSortOrder を呼ぶ（採番は repository 内で実施）', async () => {
      mockRepo.createWithAutoSortOrder.mockResolvedValue(mockCategory);

      const result = await service.create(
        { name: '出荷', spaceId: 'space-1', sortOrder: 2 },
        ACCOUNT_ID,
      );

      expect(result.success).toBe(true);
      // 存在秘匿ガードを対象 Space へ通すこと（ADR 0042）。
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(ACCOUNT_ID, 'space-1');
      // 旧 maxSortOrder + create の 2 段ではなく、createWithAutoSortOrder 1 本へ委譲（cmn-0221 §3）。
      expect(mockRepo.maxSortOrder).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.createWithAutoSortOrder).toHaveBeenCalledWith(
        'space-1',
        { name: '出荷', space: { connect: { id: 'space-1' } } },
        2,
      );
      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockCategory.id,
          name: mockCategory.name,
          spaceId: mockCategory.spaceId,
          sortOrder: mockCategory.sortOrder,
        }),
      );
      expect(typeof result.data.createdAt).toBe('string');
    });

    it('sortOrder 省略時は undefined を渡し、採番は repository.createWithAutoSortOrder 側に委ねる', async () => {
      mockRepo.createWithAutoSortOrder.mockResolvedValue(mockCategory);

      await service.create({ name: '在庫', spaceId: 'space-1' }, ACCOUNT_ID);

      // service 側で max を引かない＝repository の tx 採番に丸投げ（cmn-0221 §3 の肝）。
      expect(mockRepo.maxSortOrder).not.toHaveBeenCalled();
      expect(mockRepo.createWithAutoSortOrder).toHaveBeenCalledWith(
        'space-1',
        { name: '在庫', space: { connect: { id: 'space-1' } } },
        undefined,
      );
    });

    // IDOR negative（write）: 非可視 Space への create は 404 で弾き、作成しない。
    it('可視範囲外の spaceId へ create すると NotFoundException(404) を投げ、作成しないこと（IDOR）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );

      await expect(
        service.create({ name: '侵入', spaceId: 'space-evil' }, ACCOUNT_ID),
      ).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(ACCOUNT_ID, 'space-evil');
      expect(mockRepo.createWithAutoSortOrder).not.toHaveBeenCalled();
    });
  });

  describe('reorder（rete-desk-0197・0199 / cmn-0221 §2）', () => {
    // cmn-0221: 集合検証を service.findIdsBySpace + service 側 Set 比較 から repository.reorder 内の
    // tx 検証へ移管。service は (spaceId, orderedIds) を repo に渡し、ReorderResult を DTO 化するだけ。
    it('repo.reorder が {ok:true, items} を返したら、それを DTO 化して {success, data} で返す', async () => {
      const reordered = [
        makeCategoryEntity({ id: 3, sortOrder: 1 }),
        makeCategoryEntity({ id: 1, sortOrder: 2 }),
        makeCategoryEntity({ id: 2, sortOrder: 3 }),
      ];
      mockRepo.reorder.mockResolvedValue({ ok: true, items: reordered });

      const result = await service.reorder('space-1', [3, 1, 2], ACCOUNT_ID);

      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(ACCOUNT_ID, 'space-1');
      // spaceId と orderedIds を一緒に渡す（集合検証は repository の tx 内で実施）。
      expect(mockRepo.reorder).toHaveBeenCalledWith('space-1', [3, 1, 2]);
      expect(result.success).toBe(true);
      expect(result.data.map((c) => c.id)).toEqual([3, 1, 2]);
      expect(result.data.map((c) => c.sortOrder)).toEqual([1, 2, 3]);
    });

    it('repo.reorder が {ok:false, reason:"set-mismatch"} を返したら BadRequestException を投げる（HTTP 400 維持）', async () => {
      mockRepo.reorder.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      // 過剰（99 は当該 Space に存在しない id）。
      await expect(service.reorder('space-1', [1, 2, 99], ACCOUNT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('set-mismatch 時のメッセージが従来どおり「当該チャネルの全分類と完全一致」を維持すること', async () => {
      mockRepo.reorder.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      // 既存メッセージ文言が変わっていないこと（UI・外部仕様の退行防止）。
      await expect(service.reorder('space-1', [1, 2, 99], ACCOUNT_ID)).rejects.toThrow(
        '並び替え対象は当該チャネルの全分類と完全に一致する必要があります。',
      );
    });

    // IDOR negative（write）: 非可視 Space の reorder は 404。集合検証より前に弾くので
    // repository.reorder も呼ばれない。
    it('可視範囲外の spaceId を reorder すると NotFoundException(404) を投げ、並び替えしないこと（IDOR）', async () => {
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );

      await expect(service.reorder('space-evil', [1, 2, 3], ACCOUNT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(ACCOUNT_ID, 'space-evil');
      expect(mockRepo.reorder).not.toHaveBeenCalled();
    });
  });

  describe('update（rete-desk-0140）', () => {
    it('対象不在なら NotFoundException を投げること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, { name: 'x' }, ACCOUNT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('名称変更は name のみを update に渡すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.update.mockResolvedValue({ ...mockCategory, name: '入荷検品' });

      const result = await service.update(1, { name: '入荷検品' }, ACCOUNT_ID);

      // 対象 category の spaceId（直接列）で存在秘匿ガードを通すこと（ADR 0042）。
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(
        ACCOUNT_ID,
        mockCategory.spaceId,
      );
      expect(mockRepo.update).toHaveBeenCalledWith(1, { name: '入荷検品' });
      expect(result.data.name).toBe('入荷検品');
    });

    it('archived:true でアーカイブ日時を刻むこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory); // archivedAt: null
      mockRepo.update.mockResolvedValue({ ...mockCategory, archivedAt: new Date() });

      const result = await service.update(1, { archived: true }, ACCOUNT_ID);

      expect(mockRepo.update).toHaveBeenCalledWith(1, { archivedAt: expect.any(Date) });
      expect(result.data.archived).toBe(true);
    });

    it('archived:false でアーカイブを解除（null 化）すること', async () => {
      mockRepo.findById.mockResolvedValue(makeCategoryEntity({ archivedAt: new Date() }));
      mockRepo.update.mockResolvedValue(mockCategory);

      const result = await service.update(1, { archived: false }, ACCOUNT_ID);

      expect(mockRepo.update).toHaveBeenCalledWith(1, { archivedAt: null });
      expect(result.data.archived).toBe(false);
    });

    it('既にアーカイブ済へ archived:true を再送しても日時を上書きしないこと', async () => {
      const archivedAt = new Date('2026-06-01T00:00:00Z');
      mockRepo.findById.mockResolvedValue(makeCategoryEntity({ archivedAt }));
      mockRepo.update.mockResolvedValue(makeCategoryEntity({ archivedAt }));

      await service.update(1, { archived: true }, ACCOUNT_ID);

      // archivedAt を data に含めない（初回アーカイブ日時を保持）
      expect(mockRepo.update).toHaveBeenCalledWith(1, {});
    });

    // IDOR negative（write）: 他 space の category id を直打ちで update → 対象の spaceId が
    // 非可視なので 404（存在しない id と同じ応答）。update は実行しない。
    it('他 space の category id を直打ちで update すると NotFoundException(404)・更新しないこと（IDOR）', async () => {
      const foreign = makeCategoryEntity({ id: 50, spaceId: 'space-evil' });
      mockRepo.findById.mockResolvedValue(foreign);
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );

      await expect(service.update(50, { name: '侵入' }, ACCOUNT_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(ACCOUNT_ID, 'space-evil');
      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('remove（rete-desk-0140）', () => {
    it('対象不在なら NotFoundException を投げること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999, ACCOUNT_ID)).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('紐づくタスクがあれば ConflictException（アーカイブ案内）を投げ、削除しないこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.countTasks.mockResolvedValue(3);

      await expect(service.remove(1, ACCOUNT_ID)).rejects.toThrow(ConflictException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('タスク 0 件なら削除して message レスポンスを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.countTasks.mockResolvedValue(0);
      mockRepo.delete.mockResolvedValue(mockCategory);

      const result = await service.remove(1, ACCOUNT_ID);

      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(
        ACCOUNT_ID,
        mockCategory.spaceId,
      );
      expect(mockRepo.delete).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data.message).toBe('Category deleted successfully');
    });

    // IDOR negative（write）: 他 space の category id を直打ちで delete → 404・削除しない。
    it('他 space の category id を直打ちで delete すると NotFoundException(404)・削除しないこと（IDOR）', async () => {
      const foreign = makeCategoryEntity({ id: 60, spaceId: 'space-evil' });
      mockRepo.findById.mockResolvedValue(foreign);
      mockScopeVisibility.assertVisibleOr404.mockRejectedValue(
        new NotFoundException('Resource not found'),
      );

      await expect(service.remove(60, ACCOUNT_ID)).rejects.toThrow(NotFoundException);
      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith(ACCOUNT_ID, 'space-evil');
      // 存在秘匿はタスク件数チェックより前。countTasks / delete は呼ばれない。
      expect(mockRepo.countTasks).not.toHaveBeenCalled();
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });

  /**
   * 存在秘匿の応答平準化（v2-254）。分類の不在の 404 と、分類は在るが器が非可視の 404 が、
   * status だけでなく文言まで一致することを両分岐の実メッセージ比較で固定する。片側だけ変えると
   * 応答本文が「存在するか」の oracle に戻る（ADR 0042 / ADR 0038）。
   */
  describe('404 の応答平準化（不在と非可視で同じ文言・v2-254）', () => {
    const EVIL = 'space-evil';

    const denySpace = (spaceId: string) =>
      mockScopeVisibility.assertVisibleOr404.mockImplementation(
        (accountId: string | undefined | null, target: string) =>
          target === spaceId
            ? Promise.reject(new NotFoundException('Resource not found'))
            : Promise.resolve(undefined),
      );

    const messageOf = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
        return '<no-error>';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    it('update / remove: 不在と非可視が同じ文言（指定された分類が見つかりません。）', async () => {
      mockRepo.findById.mockResolvedValue(null);
      const updateMissing = await messageOf(() => service.update(999, { name: 'x' }, ACCOUNT_ID));
      const removeMissing = await messageOf(() => service.remove(999, ACCOUNT_ID));

      mockRepo.findById.mockResolvedValue(makeCategoryEntity({ id: 60, spaceId: EVIL }));
      denySpace(EVIL);
      const updateInvisible = await messageOf(() => service.update(60, { name: 'x' }, ACCOUNT_ID));
      const removeInvisible = await messageOf(() => service.remove(60, ACCOUNT_ID));

      expect(updateMissing).toBe('指定された分類が見つかりません。');
      expect(updateInvisible).toBe(updateMissing);
      expect(removeInvisible).toBe(removeMissing);
    });

    it('create / reorder: 器の非可視は分類の不在と同じ文言（器の不在と同じ枝）', async () => {
      denySpace(EVIL);

      expect(await messageOf(() => service.create({ name: 'x', spaceId: EVIL }, ACCOUNT_ID))).toBe(
        '指定された分類が見つかりません。',
      );
      expect(await messageOf(() => service.reorder(EVIL, [1], ACCOUNT_ID))).toBe(
        '指定された分類が見つかりません。',
      );
    });
  });

  /**
   * v2-259: 入力依存不変条件（不在でも可視範囲の解決を対象取得より先に通す）。
   */
  describe('404 の応答コスト平準化（不在でも可視範囲の解決を先に通す・v2-259）', () => {
    /** 呼び出し順の比較（resetMocks 済みなので各テストの 1 回目同士を比べる）。 */
    const calledBefore = (first: jest.Mock, second: jest.Mock): boolean =>
      first.mock.invocationCallOrder[0] < second.mock.invocationCallOrder[0];

    beforeEach(() => {
      mockRepo.findById.mockResolvedValue(null);
      mockScopeVisibility.resolveVisibleSpaceIds.mockResolvedValue(VISIBLE_IDS);
    });

    it('update: 対象不在でも可視範囲の解決を対象取得より先に通る', async () => {
      await expect(service.update(999, { name: 'x' }, ACCOUNT_ID)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(calledBefore(mockScopeVisibility.resolveVisibleSpaceIds, mockRepo.findById)).toBe(
        true,
      );
    });

    it('remove: 対象不在でも可視範囲の解決を対象取得より先に通る', async () => {
      await expect(service.remove(999, ACCOUNT_ID)).rejects.toThrow(NotFoundException);

      expect(mockScopeVisibility.resolveVisibleSpaceIds).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(calledBefore(mockScopeVisibility.resolveVisibleSpaceIds, mockRepo.findById)).toBe(
        true,
      );
    });
  });
});
