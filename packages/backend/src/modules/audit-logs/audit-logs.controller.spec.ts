import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { Role } from '@rete/shared';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { throttleLimitOf, throttleTtlOf } from '../../common/testing/throttle-metadata';

/**
 * 監査ログ REST の認可境界・スロットル境界・CSV レスポンスヘッダを固定する spec（cmn-0195）。
 *
 * 検証するもの:
 * - クラスの認可メタデータ（AuthenticatedGuard + RolesGuard / @Roles(ADMIN)）が付与され続けること。
 *   監査ログは email（PII）と全ユーザーの操作履歴を含むため、デコレータの脱落＝権限の緩みになる。
 * - CSV エクスポートだけに厳しい per-route Throttle が掛かり、一覧検索には掛からない非対称。
 * - CSV レスポンスの Content-Type / Content-Disposition ヘッダ。
 * - query をそのまま（同一参照で）Service へ委譲し、戻り値をそのまま返すこと。
 *
 * E2E / 他 spec へ委譲するもの:
 * - ガードの実行結果（非 ADMIN が実際に 403 になるか）は guard 自身の spec と E2E の担当。
 *   ここではデコレータの静的付与だけを見る（実 DB / 実リクエストを起こさない）。
 * - CSV 本文の中身（列順・BOM・エスケープ）は audit-logs.service.spec.ts / audit-logs.csv.spec.ts の担当。
 */

const mockService = {
  exportCsv: jest.fn(),
  search: jest.fn(),
};

describe('AuditLogsController', () => {
  let controller: AuditLogsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [{ provide: AuditLogsService, useValue: mockService }],
    }).compile();

    controller = module.get<AuditLogsController>(AuditLogsController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('認可メタデータ（ADMIN 限定境界）', () => {
    it('クラスに @Roles(Role.ADMIN) が付与されていること', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AuditLogsController) as Role[] | undefined;
      expect(roles).toEqual([Role.ADMIN]);
    });

    it('クラスガードが [AuthenticatedGuard, RolesGuard] とこの順で一致すること', () => {
      // AuthenticatedGuard が先（req.user を用意してから RolesGuard が role 照合する）。
      const guards = Reflect.getMetadata('__guards__', AuditLogsController) as unknown[];
      expect(guards).toEqual([AuthenticatedGuard, RolesGuard]);
    });
  });

  describe('Throttle 境界（CSV だけ厳しい・一覧には付けない）', () => {
    const limitOf = (method: unknown) => throttleLimitOf(method as object);
    const ttlOf = (method: unknown) => throttleTtlOf(method as object);

    it('exportCsv に limit=5 / ttl=60_000 の per-route Throttle が付いていること', () => {
      expect(limitOf(AuditLogsController.prototype.exportCsv)).toBe(5);
      expect(ttlOf(AuditLogsController.prototype.exportCsv)).toBe(60_000);
    });

    it('search には per-route Throttle が付いていないこと（グローバル制限のみ・非対称の固定）', () => {
      expect(limitOf(AuditLogsController.prototype.search)).toBeUndefined();
      expect(ttlOf(AuditLogsController.prototype.search)).toBeUndefined();
    });
  });

  describe('CSV レスポンスヘッダ', () => {
    it('@Header で Content-Type: text/csv; charset=utf-8 が宣言されていること', () => {
      const headers = Reflect.getMetadata(
        '__headers__',
        AuditLogsController.prototype.exportCsv,
      ) as { name: string; value: string }[] | undefined;
      expect(headers).toEqual(
        expect.arrayContaining([{ name: 'Content-Type', value: 'text/csv; charset=utf-8' }]),
      );
    });

    it('exportCsv 実行時に Content-Disposition を1回だけ設定すること', async () => {
      const setHeader = jest.fn();
      const res = { setHeader } as unknown as Response;
      mockService.exportCsv.mockResolvedValue('csv-body');

      await controller.exportCsv(new QueryAuditLogsDto(), res);

      expect(setHeader).toHaveBeenCalledTimes(1);
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="audit-logs.csv"',
      );
    });
  });

  describe('Service への委譲', () => {
    it('exportCsv は query だけを同一参照で委譲し、戻り値をそのまま返すこと', async () => {
      const query = Object.assign(new QueryAuditLogsDto(), {
        from: '2026-01-01',
        to: '2026-01-31',
      });
      const expected = 'id,createdAt\n';
      mockService.exportCsv.mockResolvedValue(expected);

      const result = await controller.exportCsv(query, {
        setHeader: jest.fn(),
      } as unknown as Response);

      expect(result).toBe(expected);
      // 引数は query 1つだけ（Response を Service 層へ漏らさない）。
      expect(mockService.exportCsv.mock.calls).toHaveLength(1);
      expect(mockService.exportCsv.mock.calls[0]).toHaveLength(1);
      // 同一参照であること（コントローラで query を作り変えていない）。
      expect(mockService.exportCsv.mock.calls[0][0]).toBe(query);
    });

    it('search は query だけを同一参照で委譲し、戻り値をそのまま返すこと', () => {
      const query = Object.assign(new QueryAuditLogsDto(), { page: 2 });
      const expected = { success: true, data: [] };
      mockService.search.mockReturnValue(expected);

      const result = controller.search(query);

      expect(result).toBe(expected);
      expect(mockService.search.mock.calls).toHaveLength(1);
      expect(mockService.search.mock.calls[0]).toHaveLength(1);
      expect(mockService.search.mock.calls[0][0]).toBe(query);
    });
  });

  describe('引数バインドのメタデータ（query が @Query 由来であることの固定）', () => {
    // Nest は `${paramtype}:${index}` をキーに引数バインドを保存する（QUERY=4 / RESPONSE=1）。
    // メソッドを直接呼ぶ unit テストではデコレータが働かないため、束縛元はここで静的に固定する。
    const argsOf = (method: string) =>
      Reflect.getMetadata('__routeArguments__', AuditLogsController, method) as Record<
        string,
        unknown
      >;

    it('search の第1引数が @Query 由来であること', () => {
      expect(Object.keys(argsOf('search')).sort()).toEqual(['4:0']);
    });

    it('exportCsv が @Query（index 0）と @Res（index 1）で束縛されていること', () => {
      expect(Object.keys(argsOf('exportCsv')).sort()).toEqual(['1:1', '4:0']);
    });
  });
});
