import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { API_GLOBAL_PREFIX, CROSS_SERVICE_ROUTES } from '../../common/config/api-routes';
import { throttleLimitOf, throttleTtlOf } from '../../common/testing/throttle-metadata';

const mockService = {
  findAll: jest.fn(),
  findBySpace: jest.fn(),
  getDeskPreference: jest.fn(),
  updateDeskPreference: jest.fn(),
  getDisplayPreference: jest.fn(),
  updateDisplayPreference: jest.fn(),
};

describe('AccountsController', () => {
  let controller: AccountsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [{ provide: AccountsService, useValue: mockService }],
    }).compile();

    controller = module.get<AccountsController>(AccountsController);
  });

  it('findAll は caller id を添えて service.findAll へ委譲する（dsk-0408 org 境界化）', async () => {
    const expected = { success: true, data: [{ id: 'acc-1', name: '田中 太郎' }] };
    mockService.findAll.mockResolvedValue(expected);

    expect(await controller.findAll('acc-1')).toBe(expected);
    expect(mockService.findAll).toHaveBeenCalledWith('acc-1');
  });

  describe('findAll の列挙抑止 Throttle（dsk-0414 criteria ②・by-space と同値）', () => {
    const limitOf = (methodName: keyof AccountsController) =>
      throttleLimitOf(AccountsController.prototype[methodName]);
    const ttlOf = (methodName: keyof AccountsController) =>
      throttleTtlOf(AccountsController.prototype[methodName]);

    it('findAll に by-space と同値の per-route Throttle が付与されている', () => {
      expect(limitOf('findAll')).toBe(30);
      expect(ttlOf('findAll')).toBe(60_000);
    });

    it('by-space と同じ Throttle 値であることを保証する（片側だけ書き換える回帰検知）', () => {
      expect(limitOf('findAll')).toBe(limitOf('findBySpace'));
      expect(ttlOf('findAll')).toBe(ttlOf('findBySpace'));
    });
  });

  it('findBySpace は caller id + spaceId クエリを service.findBySpace へ委譲する（dsk-0211 / dsk-0408）', async () => {
    const expected = { success: true, data: [{ id: 'acc-2', name: '佐藤' }] };
    mockService.findBySpace.mockResolvedValue(expected);

    expect(await controller.findBySpace('acc-1', 'space-1')).toBe(expected);
    expect(mockService.findBySpace).toHaveBeenCalledWith('acc-1', 'space-1');
  });

  it('findBySpace は spaceId 未指定（undefined）でも service へ委譲する（境界化フォールバックは service 側）', async () => {
    const expected = { success: true, data: [{ id: 'acc-1', name: '田中' }] };
    mockService.findBySpace.mockResolvedValue(expected);

    expect(await controller.findBySpace('acc-1', undefined)).toBe(expected);
    expect(mockService.findBySpace).toHaveBeenCalledWith('acc-1', undefined);
  });

  describe('by-space の spaceId 入力検証パイプ契約（dsk-0211）', () => {
    // findBySpace が @Query に付与する Nest 標準パイプ（optional）。HTTP 層と同一インスタンスで契約を確認する。
    const uuidPipe = new ParseUUIDPipe({ optional: true });
    const meta = { type: 'query' as const, data: 'spaceId' };

    it('非 UUID の spaceId は 400 に正規化される（malformed が黙って全員フォールバックに落ちない）', async () => {
      await expect(uuidPipe.transform('not-a-uuid', meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('妥当な UUID の spaceId はそのまま透過する', async () => {
      await expect(uuidPipe.transform('11111111-1111-1111-1111-111111111111', meta)).resolves.toBe(
        '11111111-1111-1111-1111-111111111111',
      );
    });

    it('未指定（undefined）は optional のため透過する（全員フォールバック経路を維持）', async () => {
      // HTTP 層では未指定クエリは undefined で渡る。transform の入力型は string 想定のため実態に合わせる。
      await expect(
        uuidPipe.transform(undefined as unknown as string, meta),
      ).resolves.toBeUndefined();
    });
  });

  it('getDeskPreference はセッション本人の accountId で service へ委譲する（rete-desk-0142）', async () => {
    const expected = { success: true, data: { leftPaneRatio: 0.6 } };
    mockService.getDeskPreference.mockResolvedValue(expected);

    expect(await controller.getDeskPreference('acc-1')).toBe(expected);
    expect(mockService.getDeskPreference).toHaveBeenCalledWith('acc-1');
  });

  it('updateDeskPreference は accountId と dto を service へ委譲する（rete-desk-0142）', async () => {
    const dto = { leftPaneRatio: 0.3 };
    const expected = { success: true, data: dto };
    mockService.updateDeskPreference.mockResolvedValue(expected);

    expect(await controller.updateDeskPreference('acc-1', dto)).toBe(expected);
    expect(mockService.updateDeskPreference).toHaveBeenCalledWith('acc-1', dto);
  });

  it('getDisplayPreference はセッション本人の accountId で service へ委譲する（mdl-0022）', async () => {
    const expected = { success: true, data: { stripeEnabled: true, stripeColor: '#FAFCFF' } };
    mockService.getDisplayPreference.mockResolvedValue(expected);

    expect(await controller.getDisplayPreference('acc-1')).toBe(expected);
    expect(mockService.getDisplayPreference).toHaveBeenCalledWith('acc-1');
  });

  it('updateDisplayPreference は accountId と dto を service へ委譲する（mdl-0022）', async () => {
    const dto = { stripeEnabled: false, stripeColor: '#FDF1F4' };
    const expected = { success: true, data: dto };
    mockService.updateDisplayPreference.mockResolvedValue(expected);

    expect(await controller.updateDisplayPreference('acc-1', dto)).toBe(expected);
    expect(mockService.updateDisplayPreference).toHaveBeenCalledWith('acc-1', dto);
  });
});

/**
 * cmn-0132: route-scoped CORS の対象ルート（CROSS_SERVICE_ROUTES）が、実際に AccountsController の
 * デコレータへ付いているパスと一致していることを、Nest のルートメタデータ経由で固定する。
 *
 * 定数を共有しただけでは「定数を使い忘れて片側だけリテラルへ戻す」余地が残るため、
 * 宣言ではなく実物（デコレータのメタデータ）を突き合わせる。コントローラ側のパスだけを
 * 改名すると、このテストが落ちて CORS 対象ルートとのズレに気づける。
 */
describe('AccountsController のルートと CORS 対象ルートの一致（cmn-0132）', () => {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, AccountsController) as string;

  const routePathOf = (methodName: keyof AccountsController): string => {
    const methodPath = Reflect.getMetadata(
      PATH_METADATA,
      AccountsController.prototype[methodName],
    ) as string;
    return `/${[API_GLOBAL_PREFIX, controllerPath, methodPath].join('/')}`;
  };

  it('CROSS_SERVICE_ROUTES はコントローラの実パスと文字列として一致する', () => {
    expect(routePathOf('getDisplayPreference')).toBe(CROSS_SERVICE_ROUTES[0]);
    expect(routePathOf('updateDisplayPreference')).toBe(CROSS_SERVICE_ROUTES[0]);
  });

  it('CROSS_SERVICE_ROUTES は表示個人設定の 1 ルートのみを外部オリジンへ開く', () => {
    expect(CROSS_SERVICE_ROUTES).toEqual(['/api/v1/accounts/me/display-preference']);
  });

  it('外部へ開いていないルート（desk-preference 等）は CROSS_SERVICE_ROUTES に含まれない', () => {
    expect(CROSS_SERVICE_ROUTES).not.toContain(routePathOf('getDeskPreference'));
    expect(CROSS_SERVICE_ROUTES).not.toContain(routePathOf('findAll'));
  });
});
