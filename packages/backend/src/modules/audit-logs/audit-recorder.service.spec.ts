import { Logger } from '@nestjs/common';
import { AUDIT_ACTION_TYPES } from '@rete/shared';
import { AuditRecorderService, type AuditRecordInput } from './audit-recorder.service';

const mockRepo = { create: jest.fn() };

function makeInput(over: Partial<AuditRecordInput> = {}): AuditRecordInput {
  return {
    actorAccountId: 'acc-1',
    actorName: '山田太郎',
    actorEmail: 'yamada@example.com',
    systemId: null,
    systemName: '共通操作',
    actionType: 'create',
    feature: 'chat',
    summary: 'chat を作成',
    ...over,
  };
}

describe('AuditRecorderService', () => {
  let service: AuditRecorderService;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new AuditRecorderService(mockRepo as never);
    // Logger はプロトタイプにアタッチされているため spy で観察する。
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('record', () => {
    it('有効な actionType の場合 repo.create を呼ぶこと', async () => {
      mockRepo.create.mockResolvedValue(undefined);
      await service.record(makeInput());
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'create',
          actorName: '山田太郎',
          actorEmail: 'yamada@example.com',
          systemName: '共通操作',
        }),
      );
    });

    it('無効な actionType は repo を呼ばずに logger.error のみ（例外なし）', async () => {
      await expect(service.record(makeInput({ actionType: 'INVALID' }))).resolves.toBeUndefined();
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid actionType'));
    });

    it('repo.create が throw しても record は例外を投げない（best-effort）', async () => {
      mockRepo.create.mockRejectedValue(new Error('DB connection failed'));
      await expect(service.record(makeInput())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledWith(expect.stringContaining('DB connection failed'));
    });

    it('details が null / undefined の場合 CreateAuditLogInput に details を付与しない', async () => {
      mockRepo.create.mockResolvedValue(undefined);
      await service.record(makeInput({ details: null }));
      const call = mockRepo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(call, 'details')).toBe(false);
    });

    it('details が object の場合 CreateAuditLogInput に付与して渡す', async () => {
      mockRepo.create.mockResolvedValue(undefined);
      const details = { before: 1, after: 2 };
      await service.record(makeInput({ details }));
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ details }));
    });

    it('AUDIT_ACTION_TYPES に含まれるすべての種別で repo.create を呼ぶこと', async () => {
      mockRepo.create.mockResolvedValue(undefined);
      for (const actionType of AUDIT_ACTION_TYPES) {
        // cmn-0335 据え置き: テスト内の繰り返しで各周回をリセットしており、jest の自動リセット
        // （テスト間のみ）では代替できない。消すと 2 周目以降の toHaveBeenCalledTimes(1) が落ちる。
        jest.clearAllMocks();
        await service.record(makeInput({ actionType }));
        expect(mockRepo.create).toHaveBeenCalledTimes(1);
      }
    });

    it('userAgent は 512 字で切り詰め、空文字 ipAddress は null に正規化する', async () => {
      mockRepo.create.mockResolvedValue(undefined);
      const longUa = 'x'.repeat(1000);
      await service.record(makeInput({ userAgent: longUa, ipAddress: '' }));
      const call = mockRepo.create.mock.calls[0][0] as Record<string, unknown>;
      expect((call.userAgent as string).length).toBe(512);
      expect(call.ipAddress).toBeNull();
    });

    it('userAgent / ipAddress が undefined のときは null として渡す', async () => {
      mockRepo.create.mockResolvedValue(undefined);
      await service.record(makeInput({ userAgent: undefined, ipAddress: undefined }));
      const call = mockRepo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(call.userAgent).toBeNull();
      expect(call.ipAddress).toBeNull();
    });
  });
});
