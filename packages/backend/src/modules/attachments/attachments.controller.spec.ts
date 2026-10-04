import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Role } from '@rete/shared';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

/** テスト用最小 AuthenticatedUser。 */
const makeUser = (role: Role = Role.MEMBER) => ({
  id: 'acc-1',
  email: 'test@example.com',
  name: 'テスト',
  role,
  businessRoleId: null,
  featurePermissions: {
    chat: { canRead: false, canCreate: false, canUpdate: false, canDelete: false },
    task: { canRead: false, canCreate: false, canUpdate: false, canDelete: false },
    file: { canRead: true, canCreate: true, canUpdate: true, canDelete: true },
  },
});

const mockService = {
  createAttachment: jest.fn(),
  listAttachments: jest.fn(),
  removeAttachment: jest.fn(),
};

describe('AttachmentsController', () => {
  let controller: AttachmentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [{ provide: AttachmentsService, useValue: mockService }],
    }).compile();

    controller = module.get<AttachmentsController>(AttachmentsController);
  });

  it('create は dto / 現在ユーザー（フルオブジェクト）を service.createAttachment へ委譲する', async () => {
    const dto = { targetType: 'task' as const, targetId: '1', fileId: 'file-1' };
    const expected = { success: true, data: { id: 'att-1' } };
    mockService.createAttachment.mockResolvedValue(expected);
    const user = makeUser();

    expect(await controller.create(dto, user as never)).toBe(expected);
    expect(mockService.createAttachment).toHaveBeenCalledWith(dto, user);
  });

  it('list は query と accountId を service.listAttachments へ委譲する（存在秘匿 ADR 0038）', async () => {
    const query = { targetType: 'task' as const, targetId: '1' };
    const expected = { success: true, data: [] };
    mockService.listAttachments.mockResolvedValue(expected);

    expect(await controller.list(query, 'acc-1')).toBe(expected);
    expect(mockService.listAttachments).toHaveBeenCalledWith(query, 'acc-1');
  });

  it('remove は id と user オブジェクトを service.removeAttachment へ委譲する（H4: 所有者チェック）', async () => {
    const expected = { success: true, data: { id: 'att-1' } };
    const user = makeUser();
    mockService.removeAttachment.mockResolvedValue(expected);

    expect(await controller.remove('att-1', user as never)).toBe(expected);
    expect(mockService.removeAttachment).toHaveBeenCalledWith('att-1', user);
  });
});
