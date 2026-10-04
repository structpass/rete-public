import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { AuthenticatedGuard } from './authenticated.guard';

/**
 * cmn-0185: 認証門番（AuthenticatedGuard）の単体テスト。req.isAuthenticated() の真偽と、
 * passport 未装着（isAuthenticated が関数でない）時の防御分岐を固定する。
 * ExecutionContext は roles.guard.spec.ts と同じ makeContext ヘルパ流儀で偽装する。
 * session/passport の実配線（deserialize・cookie）は E2E 側の責務で、ここでは検証しない。
 */
function makeContext(request: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthenticatedGuard', () => {
  let guard: AuthenticatedGuard;

  beforeEach(() => {
    guard = new AuthenticatedGuard();
  });

  it('isAuthenticated() が true なら通す', () => {
    expect(guard.canActivate(makeContext({ isAuthenticated: () => true }))).toBe(true);
  });

  it('isAuthenticated() が false なら Unauthorized（未ログイン）＝クラスと文言の両方を固定', () => {
    const act = () => guard.canActivate(makeContext({ isAuthenticated: () => false }));

    // jest の toThrow(errorInstance) は message しか比較しない。クラス（=401 ステータス）を
    // 別アサーションで固定しないと、403 や素の Error への退行が緑のまま通る。
    expect(act).toThrow(UnauthorizedException);
    // cmn-0232 LOW4: toThrow(string) は部分一致。message に内部情報が後付けされても緑のまま
    // 通るため、Error インスタンスで完全一致へ固定する（=UnauthorizedException の message が
    // 「認証が必要です」と一字一句同じであることを要求）。
    expect(act).toThrow(new UnauthorizedException('認証が必要です'));
  });

  // 防御分岐（isAuthenticated の typeof チェック）。passport が付いていないリクエストで
  // TypeError→500 にせず、認証必須として 401 に倒すことを固定する。プロパティ不在だけでなく
  // 「値はあるが関数でない」（truthy な非関数）でも通さないことを併せて固定する。
  it.each([
    ['プロパティ不在＝passport 未装着', {}],
    ['値はあるが関数でない: true', { isAuthenticated: true }],
    ['値はあるが関数でない: オブジェクト', { isAuthenticated: { called: false } }],
  ])('isAuthenticated が %s なら Unauthorized＝fail-closed', (_label, request) => {
    expect(() => guard.canActivate(makeContext(request))).toThrow(UnauthorizedException);
  });

  // cmn-0232 MEDIUM1: 関数だが true 以外を返すケース（cmn-0208 で追加した typeof 防御だけでは
  // 通ってしまう）。将来 isAuthenticated が async（Promise を返す）へ書き換わると resolve
  // 値が false でも Promise インスタンスが truthy で常時 fail-open になるため、戻り値の型と
  // 値の両方で fail-closed を固定する。
  it.each([
    ['async: Promise.resolve(false)', () => Promise.resolve(false)],
    ["truthy な非 boolean 文字列 'yes'", () => 'yes'],
    ['truthy な非 boolean オブジェクト', () => ({})],
    ['undefined（明示 false 相当）', () => undefined],
  ])('isAuthenticated() が %s を返すなら Unauthorized＝fail-closed', (_label, isAuthenticated) => {
    expect(() => guard.canActivate(makeContext({ isAuthenticated }))).toThrow(
      new UnauthorizedException('認証が必要です'),
    );
  });
});
