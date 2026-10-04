import { toIpWhitelistEntryResponse, toPasswordPolicyResponse } from './login-settings.mapper';

describe('login-settings.mapper', () => {
  describe('toPasswordPolicyResponse', () => {
    it('行が無ければ既定ポリシー（大小数字必須・記号任意・8 桁）を返す', () => {
      const dto = toPasswordPolicyResponse(null);
      expect(dto).toEqual({
        requireLowercase: true,
        requireUppercase: true,
        requireNumber: true,
        requireSymbol: false,
        minLength: 8,
        mfaEnforced: false,
      });
    });

    it('行があれば各フィールドをそのまま写像する（updatedAt 等は落とす）', () => {
      const dto = toPasswordPolicyResponse({
        id: 'x',
        requireLowercase: false,
        requireUppercase: true,
        requireNumber: false,
        requireSymbol: true,
        minLength: 12,
        mfaEnforced: true,
        updatedAt: new Date(),
      } as never);
      expect(dto).toEqual({
        requireLowercase: false,
        requireUppercase: true,
        requireNumber: false,
        requireSymbol: true,
        minLength: 12,
        mfaEnforced: true,
      });
    });
  });

  describe('toIpWhitelistEntryResponse', () => {
    it('id / cidr / note のみを写像する（sortOrder / createdAt は落とす）', () => {
      const dto = toIpWhitelistEntryResponse({
        id: 'e1',
        cidr: '203.0.113.0/24',
        note: '本社',
        sortOrder: 0,
        createdAt: new Date(),
      } as never);
      expect(dto).toEqual({ id: 'e1', cidr: '203.0.113.0/24', note: '本社' });
    });
  });
});
