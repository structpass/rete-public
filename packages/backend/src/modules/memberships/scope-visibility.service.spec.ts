import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ScopeVisibilityService } from './scope-visibility.service';
import { ScopeVisibilityRepository } from './repositories/scope-visibility.repository';
import { RequestCacheService } from '../../common/services';

/**
 * ScopeVisibilityService のユニットテスト。
 * ScopeVisibilityRepository を jest.fn() でモックし、union 解決ロジックを検証する。
 * テスト対象: resolveVisibleSpaceIds の各経路（membership / grant / personal）と union 重複除去、
 * および「membership 1回・管理グループ所属 grant 1回」への取得集約。
 */

const ACC = 'account-1';
const ORG_MEM_SPACE = 'ch-via-org-1'; // org membership 経由のチャネル
const PROJ_MEM_SPACE = 'ch-via-proj-1'; // project membership 直接のチャネル
const GROUP_SPACE = 'group-space-1'; // group membership 経由のグループ
const MEMO_SPACE = 'memo-1'; // 個人メモ
const DM_SPACE = 'dm-1'; // 1:1 DM

type ScopeIdRow = { scopeId: string };
type ScopeRow = { scopeId: string; scopeType: string };

describe('ScopeVisibilityService', () => {
  let service: ScopeVisibilityService;
  let repo: jest.Mocked<ScopeVisibilityRepository>;
  let requestCache: RequestCacheService;

  beforeEach(async () => {
    const mockRepo = {
      findMembershipScopes: jest.fn(),
      findGrantScopes: jest.fn(),
      findPersonalSpaces: jest.fn(),
      findActiveProjectsByOrgIds: jest.fn(),
      findGroupSpaces: jest.fn(),
      findChannelSpacesByProjectIds: jest.fn(),
      findActiveChannelSpacesByIds: jest.fn(),
    } as unknown as jest.Mocked<ScopeVisibilityRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopeVisibilityService,
        { provide: ScopeVisibilityRepository, useValue: mockRepo },
        RequestCacheService,
      ],
    }).compile();

    service = module.get<ScopeVisibilityService>(ScopeVisibilityService);
    repo = module.get(ScopeVisibilityRepository) as jest.Mocked<ScopeVisibilityRepository>;
    requestCache = module.get<RequestCacheService>(RequestCacheService);
  });

  /** 種別ごとの入力を、Repository が返す種別まとめの行（scopeId + scopeType）へ畳む。 */
  function rowsOf(
    byType: Partial<Record<'ORGANIZATION' | 'PROJECT' | 'GROUP' | 'CHANNEL', ScopeIdRow[]>>,
  ): ScopeRow[] {
    return Object.entries(byType).flatMap(([scopeType, rows]) =>
      (rows ?? []).map((row) => ({ scopeId: row.scopeId, scopeType })),
    );
  }

  describe('resolveVisibleSpaceIds', () => {
    function setupMocks({
      orgMemberships = [] as ScopeIdRow[],
      projectMemberships = [] as ScopeIdRow[],
      groupMemberships = [] as ScopeIdRow[],
      channelMemberships = [] as ScopeIdRow[],
      grantOrgMemberships = [] as ScopeIdRow[],
      grantProjectMemberships = [] as ScopeIdRow[],
      grantChannelMemberships = [] as ScopeIdRow[],
      extraMembershipRows = [] as ScopeRow[],
      extraGrantRows = [] as ScopeRow[],
      personalSpaces = [] as { id: string }[],
      orgProjects = [] as { id: string }[],
      groupSpaces = [] as { id: string }[],
      channelSpaces = [] as { id: string }[],
      directChannelSpaces = [] as { id: string }[],
    } = {}) {
      // membership は全種別まとめて 1 回、grant も全種別まとめて 1 回で返す（実装と同じ形）。
      (repo.findMembershipScopes as jest.Mock).mockResolvedValueOnce([
        ...rowsOf({
          ORGANIZATION: orgMemberships,
          PROJECT: projectMemberships,
          GROUP: groupMemberships,
          CHANNEL: channelMemberships,
        }),
        ...extraMembershipRows,
      ]);
      (repo.findGrantScopes as jest.Mock).mockResolvedValueOnce([
        ...rowsOf({
          ORGANIZATION: grantOrgMemberships,
          PROJECT: grantProjectMemberships,
          CHANNEL: grantChannelMemberships,
        }),
        ...extraGrantRows,
      ]);
      (repo.findPersonalSpaces as jest.Mock).mockResolvedValueOnce(personalSpaces);
      (repo.findActiveProjectsByOrgIds as jest.Mock).mockResolvedValueOnce(orgProjects);
      (repo.findGroupSpaces as jest.Mock).mockResolvedValueOnce(groupSpaces);
      (repo.findChannelSpacesByProjectIds as jest.Mock).mockResolvedValueOnce(channelSpaces);
      (repo.findActiveChannelSpacesByIds as jest.Mock).mockResolvedValueOnce(directChannelSpaces);
    }

    it('membership が全て空・personal も空なら空配列を返す', async () => {
      setupMocks();

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(ids).toEqual([]);
    });

    it('org membership 経由のチャネルを含む', async () => {
      setupMocks({
        orgMemberships: [{ scopeId: 'org-1' }],
        orgProjects: [{ id: 'proj-1' }],
        channelSpaces: [{ id: ORG_MEM_SPACE }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(ids).toContain(ORG_MEM_SPACE);
    });

    it('org grant も org membership と同じ org 集合へ加算される', async () => {
      setupMocks({ grantOrgMemberships: [{ scopeId: 'org-grant-1' }] });

      await service.resolveVisibleSpaceIds(ACC);

      expect(repo.findActiveProjectsByOrgIds).toHaveBeenCalledWith(['org-grant-1']);
    });

    it('project membership 直接のチャネルを含む', async () => {
      setupMocks({
        projectMemberships: [{ scopeId: 'proj-direct' }],
        channelSpaces: [{ id: PROJ_MEM_SPACE }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(ids).toContain(PROJ_MEM_SPACE);
      expect(repo.findChannelSpacesByProjectIds).toHaveBeenCalledWith(['proj-direct']);
    });

    it('直接 CHANNEL membership と CHANNEL grant を親PROJECT経由の結果へ加算する', async () => {
      setupMocks({
        channelMemberships: [{ scopeId: 'ch-direct' }],
        grantChannelMemberships: [{ scopeId: 'ch-grant' }],
        directChannelSpaces: [{ id: 'ch-direct' }, { id: 'ch-grant' }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(ids).toEqual(expect.arrayContaining(['ch-direct', 'ch-grant']));
      expect(repo.findActiveChannelSpacesByIds).toHaveBeenCalledWith(['ch-direct', 'ch-grant']);
    });

    it('同一 scopeId が membership と grant の両方に来ても 1 件へ畳んで問い合わせる', async () => {
      setupMocks({
        channelMemberships: [{ scopeId: 'shared-1' }],
        grantChannelMemberships: [{ scopeId: 'shared-1' }],
        directChannelSpaces: [{ id: 'shared-1' }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(repo.findActiveChannelSpacesByIds).toHaveBeenCalledWith(['shared-1']);
      expect(ids.filter((id) => id === 'shared-1')).toHaveLength(1);
    });

    it('group membership 経由のグループスペースを含む', async () => {
      setupMocks({
        groupMemberships: [{ scopeId: GROUP_SPACE }],
        groupSpaces: [{ id: GROUP_SPACE }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(ids).toContain(GROUP_SPACE);
      expect(repo.findGroupSpaces).toHaveBeenCalledWith([GROUP_SPACE]);
    });

    it('grant の GROUP 種別は可視に寄与しない（組織/PJ/チャネルのみ加算・set-0164）', async () => {
      setupMocks({ extraGrantRows: [{ scopeId: 'group-via-grant', scopeType: 'GROUP' }] });

      await service.resolveVisibleSpaceIds(ACC);

      expect(repo.findGroupSpaces).toHaveBeenCalledWith([]);
      expect(repo.findActiveChannelSpacesByIds).toHaveBeenCalledWith([]);
      expect(repo.findActiveProjectsByOrgIds).not.toHaveBeenCalled();
    });

    it('personal スペース（PERSONAL_MEMO / DM）を含む', async () => {
      setupMocks({
        personalSpaces: [{ id: MEMO_SPACE }, { id: DM_SPACE }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(ids).toContain(MEMO_SPACE);
      expect(ids).toContain(DM_SPACE);
    });

    it('重複 id は 1 件に絞られる（union dedup）', async () => {
      // group membership でも personal でも同じ space id が来た場合
      setupMocks({
        groupMemberships: [{ scopeId: GROUP_SPACE }],
        groupSpaces: [{ id: GROUP_SPACE }],
        personalSpaces: [{ id: GROUP_SPACE }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      const count = ids.filter((id) => id === GROUP_SPACE).length;
      expect(count).toBe(1);
    });

    it('全経路の union を返す（順不同）', async () => {
      setupMocks({
        orgMemberships: [{ scopeId: 'org-1' }],
        orgProjects: [{ id: 'proj-1' }],
        channelSpaces: [{ id: ORG_MEM_SPACE }],
        groupMemberships: [{ scopeId: GROUP_SPACE }],
        groupSpaces: [{ id: GROUP_SPACE }],
        personalSpaces: [{ id: MEMO_SPACE }],
      });

      const ids = await service.resolveVisibleSpaceIds(ACC);

      expect(new Set(ids)).toEqual(new Set([ORG_MEM_SPACE, GROUP_SPACE, MEMO_SPACE]));
    });

    it('org membership 空のとき findActiveProjectsByOrgIds は呼ばれない（Service 側で skip）', async () => {
      // orgMemberships が空 → service 側で orgProjects lookup を skip → repo メソッドが呼ばれない
      setupMocks();

      await service.resolveVisibleSpaceIds(ACC);

      expect(repo.findActiveProjectsByOrgIds).not.toHaveBeenCalled(); // skip
      expect(repo.findGroupSpaces).toHaveBeenCalledTimes(1);
      expect(repo.findChannelSpacesByProjectIds).toHaveBeenCalledTimes(1);
      expect(repo.findActiveChannelSpacesByIds).toHaveBeenCalledTimes(1);
    });

    it('membership は 1 回・管理グループ所属 grant は 1 回で取得する（種別ごとに繰り返さない）', async () => {
      setupMocks({
        orgMemberships: [{ scopeId: 'org-1' }],
        projectMemberships: [{ scopeId: 'proj-1' }],
        groupMemberships: [{ scopeId: 'group-1' }],
        channelMemberships: [{ scopeId: 'ch-1' }],
        grantOrgMemberships: [{ scopeId: 'org-grant-1' }],
        grantProjectMemberships: [{ scopeId: 'proj-grant-1' }],
        grantChannelMemberships: [{ scopeId: 'ch-grant-1' }],
      });

      await service.resolveVisibleSpaceIds(ACC);

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(1);
      expect(repo.findMembershipScopes).toHaveBeenCalledWith(ACC);
      expect(repo.findGrantScopes).toHaveBeenCalledTimes(1);
      expect(repo.findGrantScopes).toHaveBeenCalledWith(ACC);
    });
  });

  describe('canAccessSpace', () => {
    it('resolveVisibleSpaceIds に spaceId が含まれれば true', async () => {
      jest.spyOn(service, 'resolveVisibleSpaceIds').mockResolvedValue([MEMO_SPACE, ORG_MEM_SPACE]);

      expect(await service.canAccessSpace(ACC, ORG_MEM_SPACE)).toBe(true);
    });

    it('含まれなければ false', async () => {
      jest.spyOn(service, 'resolveVisibleSpaceIds').mockResolvedValue([MEMO_SPACE]);

      expect(await service.canAccessSpace(ACC, 'other-space')).toBe(false);
    });
  });

  describe('assertVisibleOr404', () => {
    it('accountId が undefined の場合は検証をスキップして 404 を投げない', async () => {
      const canAccessSpy = jest.spyOn(service, 'canAccessSpace').mockResolvedValue(true);

      await expect(service.assertVisibleOr404(undefined, 'space-1')).resolves.toBeUndefined();

      expect(canAccessSpy).not.toHaveBeenCalled();
    });

    it('accountId が null の場合も同様にスキップ', async () => {
      const canAccessSpy = jest.spyOn(service, 'canAccessSpace').mockResolvedValue(true);

      await expect(service.assertVisibleOr404(null, 'space-1')).resolves.toBeUndefined();

      expect(canAccessSpy).not.toHaveBeenCalled();
    });

    it('canAccessSpace が true なら 404 を投げない', async () => {
      jest.spyOn(service, 'canAccessSpace').mockResolvedValue(true);

      await expect(service.assertVisibleOr404(ACC, 'space-1')).resolves.toBeUndefined();
    });

    it('canAccessSpace が false なら NotFoundException を投げる', async () => {
      jest.spyOn(service, 'canAccessSpace').mockResolvedValue(false);

      await expect(service.assertVisibleOr404(ACC, 'space-1')).rejects.toThrow(
        'Resource not found',
      );
    });
  });

  describe('リクエストスコープ memoize（cmn-0051）', () => {
    function setupMocks() {
      // 呼び出し回数の検証が主目的のため、経路によらず常に空配列を返す（mockResolvedValue で永続化）。
      (repo.findMembershipScopes as jest.Mock).mockResolvedValue([]);
      (repo.findGrantScopes as jest.Mock).mockResolvedValue([]);
      (repo.findPersonalSpaces as jest.Mock).mockResolvedValue([]);
      (repo.findActiveProjectsByOrgIds as jest.Mock).mockResolvedValue([]);
      (repo.findGroupSpaces as jest.Mock).mockResolvedValue([]);
      (repo.findChannelSpacesByProjectIds as jest.Mock).mockResolvedValue([]);
      (repo.findActiveChannelSpacesByIds as jest.Mock).mockResolvedValue([]);
    }

    it('同一リクエスト（run()）内の2回目呼び出しは DB クエリを再発行しない', async () => {
      setupMocks();

      await requestCache.run(async () => {
        await service.resolveVisibleSpaceIds(ACC);
        await service.resolveVisibleSpaceIds(ACC);
      });

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(1); // 1回分（全種別まとめ）
      expect(repo.findGrantScopes).toHaveBeenCalledTimes(1);
    });

    it('canAccessSpace 経由でも同一リクエスト内は再解決しない', async () => {
      setupMocks();

      await requestCache.run(async () => {
        await service.resolveVisibleSpaceIds(ACC);
        await service.canAccessSpace(ACC, 'some-space');
      });

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(1);
      expect(repo.findGrantScopes).toHaveBeenCalledTimes(1);
    });

    it('tasks.move 相当（移動元/先の2回 assertVisibleOr404）でも解決は1回に減る', async () => {
      setupMocks();

      await requestCache.run(async () => {
        await service.assertVisibleOr404(ACC, 'space-from').catch(() => undefined);
        await service.assertVisibleOr404(ACC, 'space-to').catch(() => undefined);
      });

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(1);
      expect(repo.findGrantScopes).toHaveBeenCalledTimes(1);
    });

    it('別の run()（別リクエスト相当）では再度解決される（漏れ無し）', async () => {
      setupMocks();
      await requestCache.run(() => service.resolveVisibleSpaceIds(ACC));

      setupMocks();
      await requestCache.run(() => service.resolveVisibleSpaceIds(ACC));

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(2); // 1 + 1
      expect(repo.findGrantScopes).toHaveBeenCalledTimes(2);
    });

    it('run() の外（interceptor 未経由）で呼んだ場合は従来通り毎回解決される', async () => {
      setupMocks();
      await service.resolveVisibleSpaceIds(ACC);

      setupMocks();
      await service.resolveVisibleSpaceIds(ACC);

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(2);
    });

    it('異なる accountId は別々に解決される', async () => {
      setupMocks();

      await requestCache.run(async () => {
        await service.resolveVisibleSpaceIds(ACC);
        await service.resolveVisibleSpaceIds('account-2');
      });

      expect(repo.findMembershipScopes).toHaveBeenCalledTimes(2); // accountId 別
      expect(repo.findMembershipScopes).toHaveBeenNthCalledWith(1, ACC);
      expect(repo.findMembershipScopes).toHaveBeenNthCalledWith(2, 'account-2');
    });
  });
});
