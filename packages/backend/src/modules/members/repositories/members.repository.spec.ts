import { MembersRepository } from './members.repository';

/**
 * email 重複チェック（set-0097）は自分自身の id を除外し、サービスで trim+小文字正規化済みの
 * email を where にそのまま渡す（DB 側も小文字のみ格納する規約）。select は id のみで十分。
 * ここで where 句を固定しておくことで「NOT: { id: excludeId }」が脱落する回帰（=自分自身の
 * email で常に hit して ConflictException になる）を防ぐ。
 */
describe('MembersRepository.findOtherAccountByEmail', () => {
  it('email=normalized と NOT: { id: excludeId } を where に含めて findFirst する', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'other' });
    const repo = new MembersRepository({ account: { findFirst } } as never);

    await repo.findOtherAccountByEmail('self-id', 'new@rete.local');

    expect(findFirst).toHaveBeenCalledWith({
      where: { email: 'new@rete.local', NOT: { id: 'self-id' } },
      select: { id: true },
    });
  });

  it('重複なし（findFirst が null）なら null を返す', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new MembersRepository({ account: { findFirst } } as never);

    expect(await repo.findOtherAccountByEmail('self-id', 'free@rete.local')).toBeNull();
  });
});

/**
 * 管理者による手動ロック解除（clearLockout・set-0030）の payload 形を repository 層で固定する
 * 回帰テスト（cmn-0232 MEDIUM2）。service spec は repository をモックして呼び出し有無しか
 * 検証しておらず、payload の { failedLoginAttempts: 0, lockedUntil: null } から lockedUntil を
 * undefined へ退行させても全テスト緑のまま通過してしまう（実測済＝11 suites / 144 tests）。
 * その退行が入ると Prisma は lockedUntil 列を更新しないため、解除 API を叩いてもロックが
 * 永久に解けず画面上は「解除しました」と出るのに状態は変わらない。memberSelect をそのまま使い、
 * 解除後の Account を MemberWithRelations で返すこと（呼び出し側がロック状態を再確認できる）も
 * 併せて固定する。
 */
describe('MembersRepository.clearLockout', () => {
  it('failedLoginAttempts: 0 と lockedUntil: null を完全一致で単一 update に渡す', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'acc-1' });
    const repo = new MembersRepository({ account: { update } } as never);

    await repo.clearLockout('acc-1');

    // toHaveBeenCalledWith は引数を完全一致（toEqual）で比較する。lockedUntil が undefined に
    // 退行すると Prisma は「列を更新しない」と解釈しロックが解けなくなるため、両キーとも明示必須。
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: expect.any(Object),
    });
  });

  it('data には failedLoginAttempts と lockedUntil の 2 キーしか含まない（混入検出）', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'acc-1' });
    const repo = new MembersRepository({ account: { update } } as never);

    await repo.clearLockout('acc-1');

    const callArg = update.mock.calls[0][0];
    // 余計なキー（例: mustChangePassword: false の混入 / lockedUntil を null ではなく
    // 別フィールドで表現）が混ざっていないことを確認する。AccountRepository.resetLoginState と
    // 「全く同じ payload」と呼ぶにはキー集合まで一致している必要があるため。
    expect(Object.keys(callArg.data).sort()).toEqual(['failedLoginAttempts', 'lockedUntil']);
  });
});
