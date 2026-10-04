import { PATH_METADATA } from '@nestjs/common/constants';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import type { MfaCodeDto } from './dto/mfa-code.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { throttleLimitOf, throttleTtlOf } from '../../common/testing/throttle-metadata';

/**
 * MFA/TOTP REST の「本人限定」境界とスロットル境界を固定する spec（cmn-0195）。
 *
 * 検証するもの:
 * - クラスガードが AuthenticatedGuard 1個であること（ログイン必須・role 制限は掛けない）。
 * - コード検証を伴う 4 つの POST に limit=10 / ttl=60_000 の Throttle が付き、状態取得の GET には付かないこと。
 * - ルーティング（クラス settings/mfa ＋ 各ハンドラ path / POST メソッド）と 200 応答（@HttpCode）。
 * - IDOR 防止: リクエスト body に accountId 等を混ぜても、Service へ渡るのは @CurrentUser('id') 由来の
 *   accountId と dto.code だけであること（5 メソッド全件）。
 *
 * E2E / 他 spec へ委譲するもの:
 * - AuthenticatedGuard の実行結果（未ログインが 401 になるか）は guard spec / E2E の担当。
 * - secret 生成・TOTP 検証・バックアップコード発行のロジックは mfa.service.spec.ts の担当。
 * - レスポンス shape の秘匿列非漏洩は mfa.mapper.spec.ts の担当。
 */

const mockService = {
  getStatus: jest.fn(),
  setup: jest.fn(),
  confirm: jest.fn(),
  disable: jest.fn(),
  regenerateBackupCodes: jest.fn(),
};

/** コード（TOTP / バックアップ）を body で受ける POST 3本。 */
const CODE_POSTS = ['confirm', 'disable', 'regenerateBackupCodes'] as const;
/** setup を含む POST 4本（Throttle / HttpCode の検証で共通に回す）。 */
const ALL_POSTS = ['setup', ...CODE_POSTS] as const;

describe('MfaController', () => {
  let controller: MfaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MfaController],
      providers: [{ provide: MfaService, useValue: mockService }],
    }).compile();

    controller = module.get<MfaController>(MfaController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('ガード / ルーティングのメタデータ', () => {
    it('クラスガードが [AuthenticatedGuard] の1個だけであること（role 制限は掛けない）', () => {
      const guards = Reflect.getMetadata('__guards__', MfaController) as unknown[];
      expect(guards).toEqual([AuthenticatedGuard]);
    });

    it('クラスパスが settings/mfa であること', () => {
      expect(Reflect.getMetadata(PATH_METADATA, MfaController)).toBe('settings/mfa');
    });

    it('各ハンドラの path / HTTP メソッドが宣言どおりであること', () => {
      // RequestMethod.GET = 0 / POST = 1（@nestjs/common の enum 値）。
      const expected: Record<string, { path: string; method: number }> = {
        getStatus: { path: '/', method: 0 },
        setup: { path: 'setup', method: 1 },
        confirm: { path: 'confirm', method: 1 },
        disable: { path: 'disable', method: 1 },
        regenerateBackupCodes: { path: 'backup-codes/regenerate', method: 1 },
      };
      for (const [name, want] of Object.entries(expected)) {
        const handler = MfaController.prototype[name as keyof MfaController];
        expect(Reflect.getMetadata('path', handler)).toBe(want.path);
        expect(Reflect.getMetadata('method', handler)).toBe(want.method);
      }
    });

    it('4つの POST が 200 OK を返すこと（@HttpCode(HttpStatus.OK)）', () => {
      for (const name of ALL_POSTS) {
        expect(Reflect.getMetadata('__httpCode__', MfaController.prototype[name])).toBe(200);
      }
    });
  });

  describe('Throttle 境界（総当たり抑制）', () => {
    const limitOf = (method: unknown) => throttleLimitOf(method as object);
    const ttlOf = (method: unknown) => throttleTtlOf(method as object);

    it('4つの POST すべてに limit=10 / ttl=60_000 が付いていること', () => {
      for (const name of ALL_POSTS) {
        expect(limitOf(MfaController.prototype[name])).toBe(10);
        expect(ttlOf(MfaController.prototype[name])).toBe(60_000);
      }
    });

    it('getStatus には per-route Throttle が付いていないこと（negative）', () => {
      expect(limitOf(MfaController.prototype.getStatus)).toBeUndefined();
      expect(ttlOf(MfaController.prototype.getStatus)).toBeUndefined();
    });
  });

  describe('IDOR 防止: Service へ渡るのはセッション由来の accountId と code だけ', () => {
    // クライアントが body に紛れ込ませうる攻撃的キー（本人以外を指す id など）。
    const hostileDto = {
      code: '123456',
      accountId: 'victim-id',
      id: 'victim-id',
      enabled: true,
    } as unknown as MfaCodeDto;

    it('getStatus は accountId のみを委譲すること', () => {
      const expected = { enabled: false, confirmedAt: null };
      mockService.getStatus.mockReturnValue(expected);

      expect(controller.getStatus('acc-1')).toBe(expected);
      expect(mockService.getStatus).toHaveBeenCalledWith('acc-1');
    });

    it('setup は accountId と email（どちらも @CurrentUser 由来）のみを委譲すること', () => {
      const expected = { otpauthUri: 'otpauth://totp/...' };
      mockService.setup.mockReturnValue(expected);

      expect(controller.setup('acc-1', 'me@example.com')).toBe(expected);
      expect(mockService.setup).toHaveBeenCalledWith('acc-1', 'me@example.com');
    });

    it.each(CODE_POSTS)(
      '%s は body の余計なキーを無視し (accountId, dto.code) だけを委譲すること',
      (name) => {
        const expected = { success: true };
        mockService[name].mockReturnValue(expected);

        expect(controller[name]('acc-1', hostileDto)).toBe(expected);
        // victim-id が引数のどこにも混入していないこと（arity 込みで固定）。
        expect(mockService[name].mock.calls).toHaveLength(1);
        expect(mockService[name].mock.calls[0]).toEqual(['acc-1', '123456']);
      },
    );
  });

  describe('引数バインドのメタデータ（accountId がセッション由来であることの固定）', () => {
    // メソッドを直接呼ぶ unit テストでは param デコレータが働かないため、accountId の束縛元は
    // ここで静的に固定する（@CurrentUser('id') → @Body('accountId') への差し替えを赤にする）。
    // Nest は組み込みデコレータを `${paramtype}:${index}`（BODY=3）、createParamDecorator 製を
    // `<hash>__customRouteArgs__:${index}` というキーで保存する。
    type RouteArg = { index: number; data?: unknown };
    const argsOf = (method: string) =>
      Reflect.getMetadata('__routeArguments__', MfaController, method) as Record<string, RouteArg>;
    const customArgs = (method: string) =>
      Object.entries(argsOf(method))
        .filter(([key]) => key.includes('__customRouteArgs__'))
        .map(([, value]) => value)
        .sort((a, b) => a.index - b.index);
    const bodyArgs = (method: string) =>
      Object.entries(argsOf(method))
        .filter(([key]) => key.startsWith('3:'))
        .map(([, value]) => value);

    it.each(['getStatus', ...CODE_POSTS])(
      "%s の第1引数は @CurrentUser('id') 由来であること（@Body 由来にしない）",
      (name) => {
        expect(customArgs(name)).toEqual([expect.objectContaining({ index: 0, data: 'id' })]);
      },
    );

    it.each(CODE_POSTS)('%s の @Body は第2引数（index 1）だけであること', (name) => {
      expect(bodyArgs(name)).toEqual([expect.objectContaining({ index: 1 })]);
      // @Body('code') のような部分抽出でなく dto 全体を受ける（data 未指定）。
      expect(bodyArgs(name)[0].data).toBeUndefined();
    });

    it('getStatus は body を一切受け取らないこと', () => {
      expect(bodyArgs('getStatus')).toEqual([]);
    });

    it('setup は accountId / email とも @CurrentUser 由来で body を受け取らないこと', () => {
      expect(customArgs('setup')).toEqual([
        expect.objectContaining({ index: 0, data: 'id' }),
        expect.objectContaining({ index: 1, data: 'email' }),
      ]);
      expect(bodyArgs('setup')).toEqual([]);
    });
  });
});
