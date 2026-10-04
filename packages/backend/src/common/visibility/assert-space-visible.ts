import { NotFoundException } from '@nestjs/common';

/**
 * 共有の可視性ガード（ScopeVisibilityService.assertVisibleOr404）が投げる 404 を、呼び出し元の
 * 「対象不在」文言へ写し替えて投げ直す（存在秘匿の応答平準化・ADR 0038 / operational-policy §8）。
 *
 * ガードは対象種別を知らないため共通の 'Resource not found' を投げるが、同じ経路の対象不在は
 * service ごとの文言（例: tasks の 'Task not found'）を投げる。両者が割れていると、応答本文から
 * 「存在しない」と「存在するが見えない」を読み分けられ、存在秘匿（ADR 0038）が成立しない。
 * 可視性の判定主体・判定結果はガードのまま（誰が見えるかは不変）で、返す文言だけを呼び出し元の
 * 対象へ揃える。accountId 未指定（内部経路）のスキップ契約もガード側のまま。
 *
 * ガードの呼び出し形は 2 引数のまま保つ: 既存 spec が assertVisibleOr404 を accountId と spaceId で
 * 呼ばれたと assert しているため、引数を足すと既存テストの期待値を書き換えることになる（受入条件は
 * 「既存テストが無改変で緑」）。文言は各 service が持ち、本ヘルパは写し替えだけを担う。
 * 不在と非可視は同じ文言で返す——という不変条件を崩さないこと（片側だけ変えると oracle が戻る）。
 */
export interface SpaceVisibilityGuard {
  assertVisibleOr404(accountId: string | undefined | null, spaceId: string): Promise<void>;
}

export async function assertSpaceVisibleOr404(
  guard: SpaceVisibilityGuard,
  accountId: string | undefined | null,
  spaceId: string,
  notFoundMessage: string,
): Promise<void> {
  try {
    await guard.assertVisibleOr404(accountId, spaceId);
  } catch (e) {
    // ガードの 404 は可視性拒否のみを意味する（対象の不在判定は呼び出し元 service が担う）。
    if (e instanceof NotFoundException) {
      throw new NotFoundException(notFoundMessage);
    }
    throw e;
  }
}
