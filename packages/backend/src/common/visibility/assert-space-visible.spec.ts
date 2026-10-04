import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertSpaceVisibleOr404, type SpaceVisibilityGuard } from './assert-space-visible';

/**
 * 共有の可視性ガードの 404 を呼び出し元の「対象不在」文言へ写し替えるヘルパ（v2-254）。
 * 見るのは ① 可視なら通す ② ガードの 404 だけ文言を差し替える ③ 404 以外は握り潰さない
 * ④ 内部経路（accountId 未指定）のスキップ契約はガード側のまま、の 4 点。
 */
describe('assertSpaceVisibleOr404（存在秘匿の応答平準化・v2-254）', () => {
  const guardOf = (
    impl: (accountId: string | undefined | null, spaceId: string) => Promise<void>,
  ): SpaceVisibilityGuard => ({ assertVisibleOr404: jest.fn(impl) });

  it('可視ならそのまま通し、ガードへ accountId と spaceId の 2 引数だけを渡す（呼び出し形を変えない）', async () => {
    const guard = guardOf(async () => undefined);

    await expect(
      assertSpaceVisibleOr404(guard, 'acc-1', 'space-1', 'Task not found'),
    ).resolves.toBeUndefined();

    // 既存 spec が assertVisibleOr404 を 2 引数で呼ばれたと assert しているため、引数は増やさない。
    expect(guard.assertVisibleOr404).toHaveBeenCalledWith('acc-1', 'space-1');
  });

  it('ガードの 404 を対象不在の文言へ写し替えて投げ直す', async () => {
    const guard = guardOf(async () => {
      throw new NotFoundException('Resource not found');
    });

    await expect(
      assertSpaceVisibleOr404(guard, 'acc-1', 'space-1', 'Task not found'),
    ).rejects.toThrow('Task not found');
  });

  it('404 以外の例外は文言を変えずそのまま投げる（可視性以外の失敗を対象不在に偽装しない）', async () => {
    const guard = guardOf(async () => {
      throw new ForbiddenException('nope');
    });

    await expect(
      assertSpaceVisibleOr404(guard, 'acc-1', 'space-1', 'Task not found'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accountId 未指定（内部経路）のスキップ契約はガード側のまま（本ヘルパは素通しするだけ）', async () => {
    const guard = guardOf(async () => undefined);

    await expect(
      assertSpaceVisibleOr404(guard, undefined, 'space-1', 'Task not found'),
    ).resolves.toBeUndefined();

    expect(guard.assertVisibleOr404).toHaveBeenCalledWith(undefined, 'space-1');
  });
});
