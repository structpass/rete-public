import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DeskGroupsController } from './desk-groups.controller';
import { DeskGroupsService } from './desk-groups.service';

const mockService = {
  findTree: jest.fn(),
  createClassification: jest.fn(),
  reorderClassifications: jest.fn(),
  updateClassification: jest.fn(),
  removeClassification: jest.fn(),
  createGroup: jest.fn(),
  reorderGroups: jest.fn(),
  moveMember: jest.fn(),
  updateGroup: jest.fn(),
  removeGroup: jest.fn(),
};

describe('DeskGroupsController', () => {
  let controller: DeskGroupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeskGroupsController],
      providers: [{ provide: DeskGroupsService, useValue: mockService }],
    }).compile();

    controller = module.get<DeskGroupsController>(DeskGroupsController);
  });

  it('findTree は session の accountId を service.findTree へ委譲する', async () => {
    const expected = { success: true, data: { classifications: [], groups: [] } };
    mockService.findTree.mockResolvedValue(expected);

    expect(await controller.findTree('acc-1')).toBe(expected);
    expect(mockService.findTree).toHaveBeenCalledWith('acc-1');
  });

  it('createClassification は accountId と dto を service へ委譲する', async () => {
    const dto = { name: 'グループ分類1' };
    const expected = { success: true, data: { id: 'c1' } };
    mockService.createClassification.mockResolvedValue(expected);

    expect(await controller.createClassification('acc-1', dto)).toBe(expected);
    expect(mockService.createClassification).toHaveBeenCalledWith('acc-1', dto);
  });

  it('reorderClassifications は accountId と dto を service へ委譲する', async () => {
    const dto = { orderedIds: ['c2', 'c1'] };
    const expected = { success: true, data: { classifications: [], groups: [] } };
    mockService.reorderClassifications.mockResolvedValue(expected);

    expect(await controller.reorderClassifications('acc-1', dto)).toBe(expected);
    expect(mockService.reorderClassifications).toHaveBeenCalledWith('acc-1', dto);
  });

  it('updateClassification は accountId・id・dto を service へ委譲する', async () => {
    const dto = { name: '新名称' };
    const expected = { success: true, data: { id: 'c1' } };
    mockService.updateClassification.mockResolvedValue(expected);

    expect(await controller.updateClassification('acc-1', 'c1', dto)).toBe(expected);
    expect(mockService.updateClassification).toHaveBeenCalledWith('acc-1', 'c1', dto);
  });

  it('removeClassification は accountId・id を service へ委譲する', async () => {
    const expected = { success: true, data: { message: 'グループ分類を削除しました' } };
    mockService.removeClassification.mockResolvedValue(expected);

    expect(await controller.removeClassification('acc-1', 'c1')).toBe(expected);
    expect(mockService.removeClassification).toHaveBeenCalledWith('acc-1', 'c1');
  });

  it('createGroup は accountId と dto を service へ委譲する', async () => {
    const dto = { name: 'グループ1' };
    const expected = { success: true, data: { id: 'g1' } };
    mockService.createGroup.mockResolvedValue(expected);

    expect(await controller.createGroup('acc-1', dto)).toBe(expected);
    expect(mockService.createGroup).toHaveBeenCalledWith('acc-1', dto);
  });

  it('reorderGroups は accountId と dto を service へ委譲する', async () => {
    const dto = { classificationId: null, orderedIds: ['g2', 'g1'] };
    const expected = { success: true, data: { classifications: [], groups: [] } };
    mockService.reorderGroups.mockResolvedValue(expected);

    expect(await controller.reorderGroups('acc-1', dto)).toBe(expected);
    expect(mockService.reorderGroups).toHaveBeenCalledWith('acc-1', dto);
  });

  it('moveMember は accountId と dto を service へ委譲する', async () => {
    const dto = { targetRef: 'm1', groupId: 'g1', orderedRefs: ['m1'] };
    const expected = { success: true, data: { classifications: [], groups: [] } };
    mockService.moveMember.mockResolvedValue(expected);

    expect(await controller.moveMember('acc-1', dto)).toBe(expected);
    expect(mockService.moveMember).toHaveBeenCalledWith('acc-1', dto);
  });

  it('updateGroup は accountId・id・dto を service へ委譲する', async () => {
    const dto = { name: '新名称', classificationId: 'c1' };
    const expected = { success: true, data: { id: 'g1' } };
    mockService.updateGroup.mockResolvedValue(expected);

    expect(await controller.updateGroup('acc-1', 'g1', dto)).toBe(expected);
    expect(mockService.updateGroup).toHaveBeenCalledWith('acc-1', 'g1', dto);
  });

  it('removeGroup は accountId・id を service へ委譲する', async () => {
    const expected = { success: true, data: { message: 'グループを削除しました' } };
    mockService.removeGroup.mockResolvedValue(expected);

    expect(await controller.removeGroup('acc-1', 'g1')).toBe(expected);
    expect(mockService.removeGroup).toHaveBeenCalledWith('acc-1', 'g1');
  });
});
