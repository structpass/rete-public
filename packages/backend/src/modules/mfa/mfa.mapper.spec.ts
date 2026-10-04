import type { MfaSetting } from '@prisma/client';
import { toMfaStatusResponse } from './mfa.mapper';

/**
 * MFA 状態レスポンスの秘匿列非漏洩と shape を固定する spec（cmn-0195）。
 *
 * 検証するもの:
 * - 行不在（未設定）が enabled=false / confirmedAt=null で表現されること。
 * - 返却キーが enabled / confirmedAt の 2 つだけであること（列追加が自動でレスポンスへ漏れない）。
 * - 暗号化 secret（totpSecret）や内部 id / 監査列がレスポンスに載らないこと。
 * - confirmedAt の ISO 文字列化と null 維持。
 *
 * E2E / 他 spec へ委譲するもの:
 * - この mapper を呼ぶ経路（getStatus）の認可は mfa.controller.spec.ts / E2E の担当。
 * - secret の暗号化・復号そのものは mfa.service.spec.ts の担当。
 */

/** MfaSetting の全列を埋めた入力行（列漏れがあれば型エラーで気づける）。 */
const baseRow: MfaSetting = {
  id: 'mfa-1',
  accountId: 'acc-1',
  totpSecret: 'iv:authTag:ciphertext',
  enabled: true,
  confirmedAt: new Date('2026-07-01T12:34:56.000Z'),
  lastUsedCounter: 58_000_000,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T12:34:56.000Z'),
};

describe('toMfaStatusResponse', () => {
  it('行不在（未設定）は enabled=false / confirmedAt=null で表現すること', () => {
    expect(toMfaStatusResponse(null)).toEqual({ enabled: false, confirmedAt: null });
  });

  it('返却キーが enabled / confirmedAt の2つだけであること', () => {
    const result = toMfaStatusResponse(baseRow);
    expect(Object.keys(result).sort()).toEqual(['confirmedAt', 'enabled']);
  });

  it('秘匿列 / 内部列がレスポンスに載らないこと', () => {
    const result = toMfaStatusResponse(baseRow);
    expect(result).not.toHaveProperty('totpSecret');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('accountId');
    expect(result).not.toHaveProperty('lastUsedCounter');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
  });

  it('confirmedAt を ISO 文字列へ変換すること', () => {
    expect(toMfaStatusResponse(baseRow)).toEqual({
      enabled: true,
      confirmedAt: '2026-07-01T12:34:56.000Z',
    });
  });

  it('confirmedAt が null の行（setup 直後）は null のまま返すこと', () => {
    const result = toMfaStatusResponse({ ...baseRow, enabled: false, confirmedAt: null });
    expect(result).toEqual({ enabled: false, confirmedAt: null });
  });
});
