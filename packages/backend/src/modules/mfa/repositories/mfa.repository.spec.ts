import { MfaRepository } from './mfa.repository';

/**
 * MfaRepository のユニットテスト。Prisma はモックし、upsert 引数の shape を検証する
 * （service 層のモック Repository では届かない repository 実装の責務を担う）。
 */
describe('MfaRepository', () => {
  // cmn-0094 LOW1 是正: 再 setup では lastUsedCounter も null にリセット（旧 secret の step を引きずらない）
  it('既存の lastUsedCounter を持つ状態からの setup でも repository 側で lastUsedCounter: null にリセットされる', async () => {
    const fakePrisma = {
      mfaSetting: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const repo = new MfaRepository(fakePrisma as never);
    await repo.upsertSecret('acc-1', 'encrypted-secret');
    expect(fakePrisma.mfaSetting.upsert).toHaveBeenCalledTimes(1);
    const updateArg = fakePrisma.mfaSetting.upsert.mock.calls[0][0].update;
    expect(updateArg).toEqual({
      totpSecret: 'encrypted-secret',
      enabled: false,
      confirmedAt: null,
      lastUsedCounter: null,
    });
  });
});
