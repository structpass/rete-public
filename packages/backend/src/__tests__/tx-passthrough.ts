/**
 * cmn-0335: $transaction の「中身を通す」通し設定の共通化。
 *
 * repository の spec は resetMocks: true で毎テスト実装が剥がれるため、beforeEach で
 * $transaction のパススルー（コールバックに tx を渡して即実行）を張り直している。
 * これを共通関数へ切り出し、さらに「トランザクションは呼ばれたのに中身のコールバックが
 * 一度も走らなかった」場合にテストを落とす見張りを自前で登録する（criteria 4）。
 *
 * 見張りの動機: 「$transaction を呼ばないこと」だけを主張するテストは、パススルーが
 * 外れて中身が一度も走らない状態でも緑のままになる。$transaction が実際に呼ばれたのに
 * コールバックが走っていなければ、テストの終わりに落とす。
 *
 * 使い方（describe の直下で 1 回呼ぶ・beforeEach 内では呼ばない）:
 *   installTxPassthrough(mockPrisma, txMock);
 * 既存の beforeEach 内にあった mockImplementation 行は削除する（本関数が beforeEach を
 * 自前で登録して張り直すため）。
 */
export function installTxPassthrough(mockPrisma: { $transaction: jest.Mock }, tx: unknown): void {
  let callbackRuns = 0;
  beforeEach(() => {
    callbackRuns = 0;
    mockPrisma.$transaction.mockImplementation(
      (cb: (t: unknown) => unknown, _options?: unknown) => {
        callbackRuns += 1;
        return cb(tx);
      },
    );
  });
  afterEach(() => {
    if (mockPrisma.$transaction.mock.calls.length > 0 && callbackRuns === 0) {
      throw new Error(
        'tx passthrough violated: $transaction was called but its callback never ran (cmn-0335)',
      );
    }
  });
}
