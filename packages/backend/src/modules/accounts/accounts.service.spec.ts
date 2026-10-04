import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './repositories/accounts.repository';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';

const mockRepo = {
  findOrgScopeIds: jest.fn(),
  findActiveByOrgs: jest.fn(),
  findSummaryById: jest.fn(),
  findProjectIdBySpace: jest.fn(),
  findActiveByProject: jest.fn(),
  findDeskPreference: jest.fn(),
  upsertDeskPreference: jest.fn(),
  findDisplayPreference: jest.fn(),
  upsertDisplayPreference: jest.fn(),
};

// Space の可視性判定主体（v2-230）。既定は「可視」＝ assertVisibleOr404 が resolve する（beforeEach）。
const mockScopeVisibility = {
  assertVisibleOr404: jest.fn(),
};

describe('AccountsService', () => {
  let service: AccountsService;

  beforeEach(async () => {
    mockScopeVisibility.assertVisibleOr404.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: AccountsRepository, useValue: mockRepo },
        { provide: ScopeVisibilityService, useValue: mockScopeVisibility },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  describe('findAll（dsk-0408: 呼び出し元の組織境界で絞る）', () => {
    it('caller の所属組織圏の有効アカウントを { success, data:[{id,name}] } で返す（同一組織内のみ・表示名昇順）', async () => {
      mockRepo.findOrgScopeIds.mockResolvedValue(['org-1']);
      // dsk-0414 (database-reviewer HIGH) 修正後: DB 側の DISTINCT 結果は account_id 順になる。
      // 表示名昇順契約は service.findAll の localeCompare('ja') ソートで満たす。
      // node v24 の localeCompare('ja') は「山田 < 田中」順（や < さ 行ではない gojūon 実装）。
      mockRepo.findActiveByOrgs.mockResolvedValue([
        { id: 'acc-1', name: '田中 太郎' },
        { id: 'acc-2', name: '山田 太郎' },
      ]);

      const result = await service.findAll('acc-1');

      expect(mockRepo.findOrgScopeIds).toHaveBeenCalledWith('acc-1');
      expect(mockRepo.findActiveByOrgs).toHaveBeenCalledWith(['org-1']);
      // caller が結果に含まれるため findSummaryById（本人保険）は呼ばれない。
      expect(mockRepo.findSummaryById).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        { id: 'acc-2', name: '山田 太郎' },
        { id: 'acc-1', name: '田中 太郎' },
      ]);
    });

    it('他組織アカウントは repository の org 絞り込みへ委譲され結果に混入しない（越境視認の防止）', async () => {
      // service は findActiveByOrgs の返す集合をそのまま使う＝全件系メソッドを一切呼ばないことを検証する。
      mockRepo.findOrgScopeIds.mockResolvedValue(['org-1', 'org-2']);
      mockRepo.findActiveByOrgs.mockResolvedValue([{ id: 'acc-1', name: '田中 太郎' }]);

      const result = await service.findAll('acc-1');

      expect(mockRepo.findActiveByOrgs).toHaveBeenCalledWith(['org-1', 'org-2']);
      expect(result.data).toEqual([{ id: 'acc-1', name: '田中 太郎' }]);
    });

    it('caller が org 未所属（membership 0件）でも本人だけは返す（候補ゼロの詰み回避）', async () => {
      mockRepo.findOrgScopeIds.mockResolvedValue([]);
      mockRepo.findSummaryById.mockResolvedValue({ id: 'acc-solo', name: '独立 太郎' });

      const result = await service.findAll('acc-solo');

      // org 0 件では組織横断クエリ自体を発行しない。
      expect(mockRepo.findActiveByOrgs).not.toHaveBeenCalled();
      expect(mockRepo.findSummaryById).toHaveBeenCalledWith('acc-solo');
      expect(result.data).toEqual([{ id: 'acc-solo', name: '独立 太郎' }]);
    });

    it('組織圏の結果に caller 不在なら本人を補完し表示名順を保つ', async () => {
      // isActive=false 等で caller が和集合から漏れるケースの保険経路。
      mockRepo.findOrgScopeIds.mockResolvedValue(['org-1']);
      mockRepo.findActiveByOrgs.mockResolvedValue([
        { id: 'acc-2', name: 'あんず' },
        { id: 'acc-3', name: 'んだ 次郎' },
      ]);
      mockRepo.findSummaryById.mockResolvedValue({ id: 'acc-1', name: 'さくら' });

      const result = await service.findAll('acc-1');

      expect(result.data.map((a: { id: string }) => a.id)).toEqual(['acc-2', 'acc-1', 'acc-3']);
    });

    it('DTO は id + name のみで email / role / passwordHash を載せない（§1 DTO 境界）', async () => {
      // repository が万一機密列を返しても mapper が遮断することを担保する。
      mockRepo.findOrgScopeIds.mockResolvedValue(['org-1']);
      mockRepo.findActiveByOrgs.mockResolvedValue([
        {
          id: 'acc-1',
          name: '田中 太郎',
          email: 'leak@example.com',
          role: 'ADMIN',
          passwordHash: 'secret-hash',
        },
      ]);

      const result = await service.findAll('acc-1');

      expect(result.data[0]).toEqual({ id: 'acc-1', name: '田中 太郎' });
      expect(result.data[0]).not.toHaveProperty('email');
      expect(result.data[0]).not.toHaveProperty('role');
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });
  });

  describe('findBySpace（dsk-0211 criteria 1・assignee を Space メンバー限定 / v2-230 可視性ガード）', () => {
    it('spaceId 未指定なら可視性判定を呼ばず findAll（org 境界済み）へフォールバック（dsk-0408 自動波及）', async () => {
      mockRepo.findOrgScopeIds.mockResolvedValue(['org-1']);
      mockRepo.findActiveByOrgs.mockResolvedValue([{ id: 'acc-1', name: '田中' }]);

      const result = await service.findBySpace('acc-1', undefined);

      expect(mockScopeVisibility.assertVisibleOr404).not.toHaveBeenCalled();
      expect(mockRepo.findOrgScopeIds).toHaveBeenCalledWith('acc-1');
      expect(mockRepo.findProjectIdBySpace).not.toHaveBeenCalled();
      expect(result.data).toEqual([{ id: 'acc-1', name: '田中' }]);
    });

    it('space が project 未紐付け（projectId=null）なら可視確認のうえ findAll（org 境界済み）へフォールバック', async () => {
      mockRepo.findProjectIdBySpace.mockResolvedValue(null);
      mockRepo.findOrgScopeIds.mockResolvedValue(['org-1']);
      mockRepo.findActiveByOrgs.mockResolvedValue([{ id: 'acc-1', name: '田中' }]);

      const result = await service.findBySpace('acc-1', 'space-9');

      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('acc-1', 'space-9');
      expect(mockRepo.findProjectIdBySpace).toHaveBeenCalledWith('space-9');
      expect(mockRepo.findActiveByProject).not.toHaveBeenCalled();
      expect(mockRepo.findOrgScopeIds).toHaveBeenCalledWith('acc-1');
      expect(result.data).toEqual([{ id: 'acc-1', name: '田中' }]);
    });

    it('projectId が解決したら project メンバーのみを返す（無関係アカウントを出さない）', async () => {
      mockRepo.findProjectIdBySpace.mockResolvedValue('proj-1');
      mockRepo.findActiveByProject.mockResolvedValue([
        { id: 'acc-2', name: '佐藤' },
        { id: 'acc-3', name: '鈴木' },
      ]);

      const result = await service.findBySpace('acc-1', 'space-1');

      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('acc-1', 'space-1');
      expect(mockRepo.findActiveByProject).toHaveBeenCalledWith('proj-1');
      expect(mockRepo.findOrgScopeIds).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        { id: 'acc-2', name: '佐藤' },
        { id: 'acc-3', name: '鈴木' },
      ]);
    });

    it('非可視 Space の spaceId 指定（越境）は 404 で弾き repository を一切呼ばない（v2-230）', async () => {
      // 呼び出し元が非メンバーの Space を指定しても、主経路の認可で止まり他人の氏名を列挙できない。
      mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
        new NotFoundException('Resource not found'),
      );

      await expect(service.findBySpace('acc-1', 'space-evil')).rejects.toThrow(NotFoundException);

      expect(mockScopeVisibility.assertVisibleOr404).toHaveBeenCalledWith('acc-1', 'space-evil');
      expect(mockRepo.findProjectIdBySpace).not.toHaveBeenCalled();
      expect(mockRepo.findActiveByProject).not.toHaveBeenCalled();
      expect(mockRepo.findOrgScopeIds).not.toHaveBeenCalled();
    });

    it('DTO は id + name のみ（§1 DTO 境界・mapper が機密列を遮断）', async () => {
      mockRepo.findProjectIdBySpace.mockResolvedValue('proj-1');
      mockRepo.findActiveByProject.mockResolvedValue([
        { id: 'acc-2', name: '佐藤', email: 'leak@example.com', role: 'ADMIN' },
      ]);

      const result = await service.findBySpace('acc-1', 'space-1');

      expect(result.data[0]).toEqual({ id: 'acc-2', name: '佐藤' });
      expect(result.data[0]).not.toHaveProperty('email');
      expect(result.data[0]).not.toHaveProperty('role');
    });
  });

  describe('desk preference（rete-desk-0142）', () => {
    it('getDeskPreference は未保存なら data:null を返す（frontend は既定比率で描画）', async () => {
      mockRepo.findDeskPreference.mockResolvedValue(null);

      const result = await service.getDeskPreference('acc-1');

      expect(mockRepo.findDeskPreference).toHaveBeenCalledWith('acc-1');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('getDeskPreference は保存済みなら { leftPaneRatio } のみ返す（§1 DTO 境界）', async () => {
      // repository が万一内部列を返しても mapper が遮断することを担保する。
      mockRepo.findDeskPreference.mockResolvedValue({
        leftPaneRatio: 0.6,
        accountId: 'acc-1',
        createdAt: new Date(),
      });

      const result = await service.getDeskPreference('acc-1');

      expect(result.data).toEqual({ leftPaneRatio: 0.6 });
    });

    it('updateDeskPreference は upsert に委譲し DTO を返す', async () => {
      mockRepo.upsertDeskPreference.mockResolvedValue({ leftPaneRatio: 0.3 });

      const result = await service.updateDeskPreference('acc-1', { leftPaneRatio: 0.3 });

      expect(mockRepo.upsertDeskPreference).toHaveBeenCalledWith('acc-1', 0.3);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ leftPaneRatio: 0.3 });
    });
  });

  describe('display preference（明細の縞模様 / mdl-0022）', () => {
    it('getDisplayPreference は未保存なら data:null を返す（frontend は CSS 既定＝縞 ON で描画）', async () => {
      mockRepo.findDisplayPreference.mockResolvedValue(null);

      const result = await service.getDisplayPreference('acc-1');

      expect(mockRepo.findDisplayPreference).toHaveBeenCalledWith('acc-1');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('getDisplayPreference は保存済みなら { stripeEnabled, stripeColor } のみ返す（§1 DTO 境界）', async () => {
      // repository が万一内部列を返しても mapper が遮断することを担保する。
      mockRepo.findDisplayPreference.mockResolvedValue({
        stripeEnabled: false,
        stripeColor: '#FDF1F4',
        accountId: 'acc-1',
        createdAt: new Date(),
      });

      const result = await service.getDisplayPreference('acc-1');

      expect(result.data).toEqual({ stripeEnabled: false, stripeColor: '#FDF1F4' });
    });

    it('updateDisplayPreference は upsert に委譲し DTO を返す', async () => {
      mockRepo.upsertDisplayPreference.mockResolvedValue({
        stripeEnabled: true,
        stripeColor: '#FAFCFF',
      });

      const result = await service.updateDisplayPreference('acc-1', {
        stripeEnabled: true,
        stripeColor: '#FAFCFF',
      });

      expect(mockRepo.upsertDisplayPreference).toHaveBeenCalledWith('acc-1', {
        stripeEnabled: true,
        stripeColor: '#FAFCFF',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ stripeEnabled: true, stripeColor: '#FAFCFF' });
    });
  });

  /**
   * 存在秘匿の応答平準化（v2-254）。findBySpace の spaceId は「実在するが非可視」と「実在しない」を
   * 区別する分岐を持たず、どちらも共有ガードの 404 へ畳まれる。文言が対象不在側（器の不在）と
   * 一致していることを固定する（片側だけ変えると応答本文が存在の oracle に戻る・ADR 0038）。
   */
  describe('404 の応答平準化（不在と非可視で同じ文言・v2-254）', () => {
    const messageOf = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
        return '<no-error>';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    it('findBySpace: 非可視と不在が同じ文言（器が見つかりません）', async () => {
      const deny = () =>
        mockScopeVisibility.assertVisibleOr404.mockRejectedValueOnce(
          new NotFoundException('Resource not found'),
        );

      deny();
      const invisible = await messageOf(() => service.findBySpace('acc-1', 'space-evil'));
      deny();
      const missing = await messageOf(() => service.findBySpace('acc-1', 'space-not-exist'));

      expect(invisible).toBe('器が見つかりません');
      expect(missing).toBe(invisible);
    });
  });
});
