import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SpaceKind as PrismaSpaceKind } from '@prisma/client';
import type { DeskGroupMember } from '@prisma/client';
import { DeskGroupsService } from './desk-groups.service';
import { DeskGroupsRepository } from './repositories/desk-groups.repository';
import { SpacesService } from '../spaces/spaces.service';
// 共有ファクトリへ集約（dsk-0368）。ローカル fixture の逐語重複を解消。
import {
  makeDeskGroupClassificationEntity as makeClassification,
  makeDeskGroupEntity as makeGroup,
} from '../../__tests__/factories';

const mockRepo = {
  findClassifications: jest.fn(),
  findClassificationById: jest.fn(),
  maxClassificationSortOrder: jest.fn(),
  createClassification: jest.fn(),
  updateClassification: jest.fn(),
  deleteClassification: jest.fn(),
  reorderClassifications: jest.fn(),
  findGroups: jest.fn(),
  findGroupById: jest.fn(),
  maxGroupSortOrder: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  reorderGroups: jest.fn(),
  findMembers: jest.fn(),
  findMembersByGroup: jest.fn(),
  removeMember: jest.fn(),
  moveMemberAndReorder: jest.fn(),
};

// dsk-0330: moveMember の事前検証で targetRef を Space.id として解決するため SpacesService.findById をモック。
// 既存テストは targetRef='m1' を前提にしているのでデフォルトで「呼び出しアカウントが所有する PERSONAL_MEMO」
// を返し、既存 4 件の挙動を変えない。新規テストはこの mock を差し替えて検証する。
const mockSpacesService = {
  findById: jest.fn(),
};

type TargetRefRow =
  Parameters<SpacesService['findById']> extends []
    ? never
    : {
        id: string;
        kind: PrismaSpaceKind;
        ownerId: string | null;
        peerAccountId: string | null;
      };

function makeTargetRef(
  id: string,
  overrides: Partial<Omit<TargetRefRow, 'id'>> = {},
): TargetRefRow {
  return {
    id,
    kind: 'PERSONAL_MEMO' as PrismaSpaceKind,
    ownerId: ACCOUNT,
    peerAccountId: null,
    ...overrides,
  } as TargetRefRow;
}

const ACCOUNT = 'acc-1';

describe('DeskGroupsService', () => {
  let service: DeskGroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeskGroupsService,
        { provide: DeskGroupsRepository, useValue: mockRepo },
        { provide: SpacesService, useValue: mockSpacesService },
      ],
    }).compile();

    service = module.get<DeskGroupsService>(DeskGroupsService);
    mockRepo.findClassifications.mockResolvedValue([]);
    mockRepo.findGroups.mockResolvedValue([]);
    mockRepo.findMembers.mockResolvedValue([] as DeskGroupMember[]);
    // dsk-0330: 既存テストは targetRef='m1' が PERSONAL_MEMO で本人所有という前提で書かれていた。
    // 追加した事前検証パスでも落ちないよう、デフォルトで本人所有の row を返す。
    mockSpacesService.findById.mockResolvedValue(makeTargetRef('m1'));
  });

  describe('moveMember', () => {
    it('groupId が null なら所属解除のみ行う（repo.moveMemberAndReorder は呼ばない）', async () => {
      mockRepo.removeMember.mockResolvedValue(1);

      await service.moveMember(ACCOUNT, { targetRef: 'm1', groupId: null, orderedRefs: [] });

      expect(mockRepo.removeMember).toHaveBeenCalledWith(ACCOUNT, 'm1');
      expect(mockRepo.moveMemberAndReorder).not.toHaveBeenCalled();
    });

    it('移動先グループが自分の所有でなければ NotFound', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ accountId: 'other-account' }));

      await expect(
        service.moveMember(ACCOUNT, { targetRef: 'm1', groupId: 'g1', orderedRefs: ['m1'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.moveMemberAndReorder).not.toHaveBeenCalled();
    });

    it('repo が ok を返せば移動後のツリーを返す', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup());
      mockRepo.moveMemberAndReorder.mockResolvedValue({ ok: true });

      const result = await service.moveMember(ACCOUNT, {
        targetRef: 'm1',
        groupId: 'g1',
        orderedRefs: ['m1'],
      });

      expect(mockRepo.moveMemberAndReorder).toHaveBeenCalledWith(ACCOUNT, 'g1', 'm1', ['m1']);
      expect(result.success).toBe(true);
    });

    it('repo が set-mismatch を返せば BadRequest（tx 内で検証済み・write は commit されていない前提）', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup());
      mockRepo.moveMemberAndReorder.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      await expect(
        service.moveMember(ACCOUNT, { targetRef: 'm1', groupId: 'g1', orderedRefs: ['stale'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // dsk-0330: targetRef 事前検証のテスト群。共通前提として「DESK groups 操作」とは別に
    // SpacesService.findById だけが DB 代わりに呼ばれる（ここにモックを差し替える）。
    describe('targetRef 事前検証（dsk-0330）', () => {
      it('targetRef の Space が見つからなければ NotFound（repo は呼ばれない）', async () => {
        mockSpacesService.findById.mockResolvedValueOnce(null);

        await expect(
          service.moveMember(ACCOUNT, {
            targetRef: 'ghost',
            groupId: 'g1',
            orderedRefs: ['ghost'],
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockRepo.removeMember).not.toHaveBeenCalled();
        expect(mockRepo.moveMemberAndReorder).not.toHaveBeenCalled();
      });

      it('他人が所有する PERSONAL_MEMO を送ると NotFound（孤児行が作られない）', async () => {
        mockSpacesService.findById.mockResolvedValueOnce(
          makeTargetRef('memo-x', { kind: 'PERSONAL_MEMO', ownerId: 'other-account' }),
        );

        await expect(
          service.moveMember(ACCOUNT, {
            targetRef: 'memo-x',
            groupId: 'g1',
            orderedRefs: ['memo-x'],
          }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockRepo.moveMemberAndReorder).not.toHaveBeenCalled();
      });

      it('CHANNEL を送ると NotFound（DeskGroup 移動対象外）', async () => {
        mockSpacesService.findById.mockResolvedValueOnce(
          makeTargetRef('ch-1', { kind: 'CHANNEL', ownerId: null, peerAccountId: null }),
        );

        await expect(
          service.moveMember(ACCOUNT, { targetRef: 'ch-1', groupId: 'g1', orderedRefs: ['ch-1'] }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockRepo.moveMemberAndReorder).not.toHaveBeenCalled();
      });

      it('PERSONAL_DM で自分が owner 側なら成功（無向なので ownerId=accountId で通過）', async () => {
        mockSpacesService.findById.mockResolvedValueOnce(
          makeTargetRef('dm-1', { kind: 'PERSONAL_DM', ownerId: ACCOUNT, peerAccountId: 'peer-1' }),
        );
        mockRepo.findGroupById.mockResolvedValue(makeGroup());
        mockRepo.moveMemberAndReorder.mockResolvedValue({ ok: true });

        const result = await service.moveMember(ACCOUNT, {
          targetRef: 'dm-1',
          groupId: 'g1',
          orderedRefs: ['dm-1'],
        });
        expect(result.success).toBe(true);
        expect(mockRepo.moveMemberAndReorder).toHaveBeenCalled();
      });

      it('PERSONAL_DM で自分が peer 側でも成功（無向）', async () => {
        mockSpacesService.findById.mockResolvedValueOnce(
          makeTargetRef('dm-2', { kind: 'PERSONAL_DM', ownerId: 'peer-2', peerAccountId: ACCOUNT }),
        );
        mockRepo.findGroupById.mockResolvedValue(makeGroup());
        mockRepo.moveMemberAndReorder.mockResolvedValue({ ok: true });

        await service.moveMember(ACCOUNT, {
          targetRef: 'dm-2',
          groupId: 'g1',
          orderedRefs: ['dm-2'],
        });
        expect(mockRepo.moveMemberAndReorder).toHaveBeenCalled();
      });

      it('groupId=null の所属解除パスでも targetRef 事前検証は走る', async () => {
        mockSpacesService.findById.mockResolvedValueOnce(null);

        await expect(
          service.moveMember(ACCOUNT, { targetRef: 'ghost', groupId: null, orderedRefs: [] }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(mockRepo.removeMember).not.toHaveBeenCalled();
      });
    });
  });

  describe('reorderClassifications', () => {
    it('repo が ok を返せば反映後のツリーを返す', async () => {
      mockRepo.reorderClassifications.mockResolvedValue({ ok: true });

      const result = await service.reorderClassifications(ACCOUNT, { orderedIds: ['c1', 'c2'] });

      expect(mockRepo.reorderClassifications).toHaveBeenCalledWith(ACCOUNT, ['c1', 'c2']);
      expect(result.success).toBe(true);
    });

    it('repo が set-mismatch を返せば BadRequest', async () => {
      mockRepo.reorderClassifications.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      await expect(
        service.reorderClassifications(ACCOUNT, { orderedIds: ['stale'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reorderGroups', () => {
    it('classificationId 指定時、自分の所有でなければ NotFound', async () => {
      mockRepo.findClassificationById.mockResolvedValue(
        makeClassification({ accountId: 'other-account' }),
      );

      await expect(
        service.reorderGroups(ACCOUNT, { classificationId: 'c1', orderedIds: ['g1'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.reorderGroups).not.toHaveBeenCalled();
    });

    it('repo が ok を返せば反映後のツリーを返す', async () => {
      mockRepo.findClassificationById.mockResolvedValue(makeClassification());
      mockRepo.reorderGroups.mockResolvedValue({ ok: true });

      const result = await service.reorderGroups(ACCOUNT, {
        classificationId: 'c1',
        orderedIds: ['g1', 'g2'],
      });

      expect(mockRepo.reorderGroups).toHaveBeenCalledWith(ACCOUNT, 'c1', ['g1', 'g2']);
      expect(result.success).toBe(true);
    });

    it('repo が set-mismatch を返せば BadRequest', async () => {
      mockRepo.reorderGroups.mockResolvedValue({ ok: false, reason: 'set-mismatch' });

      await expect(
        service.reorderGroups(ACCOUNT, { classificationId: null, orderedIds: ['stale'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---- dsk-0331: createClassification/updateClassification/removeClassification/createGroup/
  //      updateGroup/removeGroup の CRUD 網羅追加。IDOR 防御分岐（existing.accountId !== accountId
  //      → NotFoundException）と classificationId の所有検証（createGroup/updateGroup の親分類）を
  //      カバーする。favorites 側は全 CRUD を網羅済みでこれに揃える（dsk-0327 MEDIUM4）。

  describe('createClassification', () => {
    it('名称 trim して渡す、空文字と空白のみは BadRequest', async () => {
      // 空文字 → trim 後 0 → BadRequest
      await expect(service.createClassification(ACCOUNT, { name: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // 空白のみ → trim 後 0 → BadRequest
      await expect(service.createClassification(ACCOUNT, { name: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // 空白付きでも trim 後 > 0 なら正常系
      mockRepo.maxClassificationSortOrder.mockResolvedValue(2);
      mockRepo.createClassification.mockResolvedValue(
        makeClassification({ name: 'グループ分類1' }),
      );
      const result = await service.createClassification(ACCOUNT, {
        name: ' グループ分類1 ',
      });
      expect(mockRepo.createClassification).toHaveBeenCalledWith({
        accountId: ACCOUNT,
        name: 'グループ分類1',
        sortOrder: 3,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('updateClassification', () => {
    it('自分の所有であれば名称更新', async () => {
      mockRepo.findClassificationById.mockResolvedValue(makeClassification({ id: 'c1' }));
      mockRepo.updateClassification.mockResolvedValue(
        makeClassification({ id: 'c1', name: '新名称' }),
      );

      const result = await service.updateClassification(ACCOUNT, 'c1', { name: '  新名称  ' });

      expect(mockRepo.updateClassification).toHaveBeenCalledWith('c1', '新名称');
      expect(result.success).toBe(true);
    });

    it('他人の所有なら NotFound（IDOR 防御・dsk-0331 観点）', async () => {
      mockRepo.findClassificationById.mockResolvedValue(
        makeClassification({ id: 'c1', accountId: 'other-account' }),
      );

      await expect(
        service.updateClassification(ACCOUNT, 'c1', { name: '新名称' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.updateClassification).not.toHaveBeenCalled();
    });

    it('空文字なら BadRequest（trim 失敗）', async () => {
      mockRepo.findClassificationById.mockResolvedValue(makeClassification({ id: 'c1' }));

      await expect(
        service.updateClassification(ACCOUNT, 'c1', { name: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // dsk-0340 #3: !existing(null) 分岐の代表（assertOwnedClassification 経由）。所有権検証は
    // 9b9f67a で assertOwnedClassification/assertOwnedGroup の 2 helper に集約済みのため、
    // 4 経路網羅ではなく helper 単位の代表 2 件（本件＋updateGroup 側）で分岐網羅が成立する。
    it('存在しない id なら NotFound（!existing 分岐）', async () => {
      mockRepo.findClassificationById.mockResolvedValue(null);

      await expect(
        service.updateClassification(ACCOUNT, 'ghost', { name: '新名称' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.updateClassification).not.toHaveBeenCalled();
    });
  });

  describe('removeClassification', () => {
    it('自分の所有であれば削除', async () => {
      mockRepo.findClassificationById.mockResolvedValue(makeClassification({ id: 'c1' }));

      const result = await service.removeClassification(ACCOUNT, 'c1');

      expect(mockRepo.deleteClassification).toHaveBeenCalledWith('c1');
      expect(result.success).toBe(true);
    });

    it('他人の所有なら NotFound（IDOR 防御・dsk-0331 観点）', async () => {
      mockRepo.findClassificationById.mockResolvedValue(
        makeClassification({ id: 'c1', accountId: 'other-account' }),
      );

      await expect(service.removeClassification(ACCOUNT, 'c1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.deleteClassification).not.toHaveBeenCalled();
    });
  });

  describe('createGroup', () => {
    it('classificationId 未指定は分類なしで作成', async () => {
      mockRepo.maxGroupSortOrder.mockResolvedValue(-1);
      mockRepo.createGroup.mockResolvedValue(makeGroup({ id: 'g-new', name: '新グループ' }));

      const result = await service.createGroup(ACCOUNT, { name: '新グループ' });

      expect(mockRepo.createGroup).toHaveBeenCalledWith({
        accountId: ACCOUNT,
        name: '新グループ',
        classificationId: null,
        sortOrder: 0,
      });
      expect(result.success).toBe(true);
    });

    it('classificationId 指定で親分類が他人所有なら NotFound（IDOR 防御・dsk-0331 観点）', async () => {
      mockRepo.findClassificationById.mockResolvedValue(
        makeClassification({ id: 'c1', accountId: 'other-account' }),
      );

      await expect(
        service.createGroup(ACCOUNT, { name: 'g', classificationId: 'c1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.createGroup).not.toHaveBeenCalled();
    });

    // dsk-0340 #1: 本人所有 classificationId の正常系（親所有検証パス→末尾 sortOrder のフル経路）。
    it('classificationId 指定（本人所有）は親分類バケット末尾の sortOrder で作成', async () => {
      mockRepo.findClassificationById.mockResolvedValue(makeClassification({ id: 'c1' }));
      mockRepo.maxGroupSortOrder.mockResolvedValue(2);
      mockRepo.createGroup.mockResolvedValue(makeGroup({ id: 'g-new', name: 'g' }));

      const result = await service.createGroup(ACCOUNT, { name: 'g', classificationId: 'c1' });

      expect(mockRepo.maxGroupSortOrder).toHaveBeenCalledWith(ACCOUNT, 'c1');
      expect(mockRepo.createGroup).toHaveBeenCalledWith({
        accountId: ACCOUNT,
        name: 'g',
        classificationId: 'c1',
        sortOrder: 3,
      });
      expect(result.success).toBe(true);
    });

    // dsk-0340 #4: trim 失敗パス（Classification 側と同一のバリデーション一貫性を回帰検証）。
    it('空白のみ名称は BadRequest（trim 失敗）', async () => {
      await expect(service.createGroup(ACCOUNT, { name: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.createGroup).not.toHaveBeenCalled();
    });
  });

  describe('updateGroup', () => {
    it('自分の所有で名称のみ更新', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1' }));
      mockRepo.updateGroup.mockResolvedValue(makeGroup({ id: 'g1', name: '新名称' }));
      mockRepo.findMembersByGroup.mockResolvedValue([]);

      const result = await service.updateGroup(ACCOUNT, 'g1', { name: '  新名称  ' });

      expect(mockRepo.updateGroup).toHaveBeenCalledWith('g1', { name: '新名称' });
      expect(result.success).toBe(true);
    });

    it('他人の所有なら NotFound（IDOR 防御・dsk-0331 観点）', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1', accountId: 'other-account' }));

      await expect(service.updateGroup(ACCOUNT, 'g1', { name: '新名称' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.updateGroup).not.toHaveBeenCalled();
      // dsk-0340 #5: early-return 後は member 取得にも到達しないことを固定する。
      expect(mockRepo.findMembersByGroup).not.toHaveBeenCalled();
    });

    // dsk-0340 #3: !existing(null) 分岐の代表（assertOwnedGroup 経由・updateClassification 側と対）。
    it('存在しない id なら NotFound（!existing 分岐）', async () => {
      mockRepo.findGroupById.mockResolvedValue(null);

      await expect(
        service.updateGroup(ACCOUNT, 'ghost', { name: '新名称' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.updateGroup).not.toHaveBeenCalled();
    });

    it('classificationId 移動先の親分類が他人所有なら NotFound', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1' }));
      mockRepo.findClassificationById.mockResolvedValue(
        makeClassification({ id: 'c2', accountId: 'other-account' }),
      );

      await expect(
        service.updateGroup(ACCOUNT, 'g1', { classificationId: 'c2' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.updateGroup).not.toHaveBeenCalled();
    });

    // dsk-0340 #2: 本人所有 classificationId への移動正常系（dsk-0305 D&D の最重要パス）。
    it('classificationId 移動（本人所有）は移動先バケット末尾の sortOrder を振り直す', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1' }));
      mockRepo.findClassificationById.mockResolvedValue(makeClassification({ id: 'c2' }));
      mockRepo.maxGroupSortOrder.mockResolvedValue(4);
      mockRepo.updateGroup.mockResolvedValue(makeGroup({ id: 'g1' }));
      mockRepo.findMembersByGroup.mockResolvedValue([]);

      const result = await service.updateGroup(ACCOUNT, 'g1', { classificationId: 'c2' });

      expect(mockRepo.maxGroupSortOrder).toHaveBeenCalledWith(ACCOUNT, 'c2');
      expect(mockRepo.updateGroup).toHaveBeenCalledWith('g1', {
        classificationId: 'c2',
        sortOrder: 5,
      });
      expect(result.success).toBe(true);
    });

    // dsk-0340 #6: classificationId:null（分類なしバケットへの移動＝dsk-0305 D&D の終端操作）。
    // 所有検証は skip され、null バケットの末尾 sortOrder が振られる。
    it('classificationId:null（分類なしバケットへ移動）は所有検証を skip し null バケット末尾へ', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1' }));
      mockRepo.maxGroupSortOrder.mockResolvedValue(1);
      mockRepo.updateGroup.mockResolvedValue(makeGroup({ id: 'g1' }));
      mockRepo.findMembersByGroup.mockResolvedValue([]);

      const result = await service.updateGroup(ACCOUNT, 'g1', { classificationId: null });

      expect(mockRepo.findClassificationById).not.toHaveBeenCalled();
      expect(mockRepo.maxGroupSortOrder).toHaveBeenCalledWith(ACCOUNT, null);
      expect(mockRepo.updateGroup).toHaveBeenCalledWith('g1', {
        classificationId: null,
        sortOrder: 2,
      });
      expect(result.success).toBe(true);
    });

    // dsk-0340 #4: trim 失敗パス（createGroup 側と対）。
    it('空白のみ名称は BadRequest（trim 失敗）', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1' }));

      await expect(service.updateGroup(ACCOUNT, 'g1', { name: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.updateGroup).not.toHaveBeenCalled();
    });
  });

  describe('removeGroup', () => {
    it('自分の所有であれば削除', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1' }));

      const result = await service.removeGroup(ACCOUNT, 'g1');

      expect(mockRepo.deleteGroup).toHaveBeenCalledWith('g1');
      expect(result.success).toBe(true);
    });

    it('他人の所有なら NotFound（IDOR 防御・dsk-0331 観点）', async () => {
      mockRepo.findGroupById.mockResolvedValue(makeGroup({ id: 'g1', accountId: 'other-account' }));

      await expect(service.removeGroup(ACCOUNT, 'g1')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.deleteGroup).not.toHaveBeenCalled();
    });
  });
});
