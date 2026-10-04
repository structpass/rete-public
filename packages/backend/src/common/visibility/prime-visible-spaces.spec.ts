import { primeVisibleSpaces, type SpaceVisibilityResolver } from './prime-visible-spaces';

/**
 * 対象取得より先に可視範囲の解決を通す前処理（存在秘匿の応答コスト平準化・v2-259）。
 * 見るのは ① accountId 指定時に resolveVisibleSpaceIds を 1 回呼ぶ ② 内部経路（未指定）は
 * ガード側と同じくスキップする ③ 可視範囲の解決失敗は握り潰さない、の 3 点。
 */
describe('primeVisibleSpaces（存在秘匿の応答コスト平準化・v2-259）', () => {
  const resolverOf = (impl: (accountId: string) => Promise<string[]>): SpaceVisibilityResolver => ({
    resolveVisibleSpaceIds: jest.fn(impl),
  });

  it('accountId 指定時は可視範囲の解決を 1 回通す（対象取得より先に呼ぶための前処理）', async () => {
    const guard = resolverOf(async () => ['space-1']);

    await primeVisibleSpaces(guard, 'acc-1');

    expect(guard.resolveVisibleSpaceIds).toHaveBeenCalledWith('acc-1');
    expect(guard.resolveVisibleSpaceIds).toHaveBeenCalledTimes(1);
  });

  it('accountId 未指定（内部経路）はガード側と同じくスキップする', async () => {
    const guard = resolverOf(async () => ['space-1']);

    await expect(primeVisibleSpaces(guard, undefined)).resolves.toBeUndefined();
    await expect(primeVisibleSpaces(guard, null)).resolves.toBeUndefined();

    expect(guard.resolveVisibleSpaceIds).not.toHaveBeenCalled();
  });

  it('可視範囲の解決失敗は握り潰さずそのまま投げる（可視性以外の失敗を隠さない）', async () => {
    const guard = resolverOf(async () => {
      throw new Error('db down');
    });

    await expect(primeVisibleSpaces(guard, 'acc-1')).rejects.toThrow('db down');
  });
});
