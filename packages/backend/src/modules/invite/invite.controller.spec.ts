import { BadRequestException } from '@nestjs/common';
import { InviteController } from './invite.controller';
import type { InviteService } from './invite.service';

/**
 * InviteController 最小ユニットテスト。
 * NestJS DI/HTTP を使わず controller インスタンスを直接呼ぶ（ガード/デコレーターはスキップ）。
 * 対象: コントローラー固有の早期バリデーション（file null チェック）のみ。
 * ルーティング/ガード/throttle の結合テストは E2E に委譲。
 */

const mockService = {
  issue: jest.fn(),
  findAll: jest.fn(),
  resend: jest.fn(),
  remove: jest.fn(),
  getTemplateCsv: jest.fn(),
  importCsv: jest.fn(),
  accept: jest.fn(),
  getMailStatus: jest.fn(),
} as unknown as InviteService;

describe('InviteController', () => {
  let controller: InviteController;

  beforeEach(() => {
    controller = new InviteController(mockService);
  });

  // -----------------------------------------------------------------------
  // importCsv — file null チェック
  // -----------------------------------------------------------------------
  describe('importCsv', () => {
    const defaultBody = { spaceId: 'space-1' };

    it('file が undefined のとき BadRequestException を投げる', () => {
      expect(() =>
        controller.importCsv(undefined as unknown as Express.Multer.File, defaultBody, 'admin-1'),
      ).toThrow(BadRequestException);
    });

    it('file が undefined のとき「CSV ファイルを選択してください」メッセージで投げる', () => {
      expect(() =>
        controller.importCsv(undefined as unknown as Express.Multer.File, defaultBody, 'admin-1'),
      ).toThrow('CSV ファイルを選択してください');
    });

    it('file が undefined のときサービスを呼ばない', () => {
      try {
        controller.importCsv(undefined as unknown as Express.Multer.File, defaultBody, 'admin-1');
      } catch {
        // expected
      }
      expect(mockService.importCsv).not.toHaveBeenCalled();
    });

    it('file が存在するときサービスへ Space を渡す', () => {
      const fakeFile = { buffer: Buffer.from('test') } as Express.Multer.File;
      mockService.importCsv = jest.fn().mockResolvedValue({ success: true, data: {} });

      controller.importCsv(fakeFile, defaultBody, 'admin-1');

      expect(mockService.importCsv).toHaveBeenCalledWith(fakeFile.buffer, 'space-1', 'admin-1');
    });
  });

  it('issue は Space をサービスへ渡す', () => {
    mockService.issue = jest.fn().mockResolvedValue({ success: true, data: {} });

    controller.issue({ email: 'new@example.com', spaceId: 'space-1' } as never, 'admin-1');

    expect(mockService.issue).toHaveBeenCalledWith('new@example.com', 'space-1', 'admin-1');
  });
});
