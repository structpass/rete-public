import {
  encryptSecret,
  decryptSecret,
  isSecretCryptoConfigured,
  SecretCryptoNotConfiguredError,
} from './secret-crypto';

/** AES-256-GCM 対称暗号ユーティリティのユニットテスト（MFA secret の at-rest 暗号化）。 */
describe('secret-crypto', () => {
  const KEY = 'a'.repeat(64); // 32byte を hex 64 文字で表現
  const ORIGINAL = process.env.MFA_TOTP_ENC_KEY;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.MFA_TOTP_ENC_KEY;
    else process.env.MFA_TOTP_ENC_KEY = ORIGINAL;
  });

  describe('鍵未設定（graceful degradation）', () => {
    beforeEach(() => {
      delete process.env.MFA_TOTP_ENC_KEY;
    });

    it('isSecretCryptoConfigured() が false', () => {
      expect(isSecretCryptoConfigured()).toBe(false);
    });

    it('encryptSecret は SecretCryptoNotConfiguredError を投げる', () => {
      expect(() => encryptSecret('x')).toThrow(SecretCryptoNotConfiguredError);
    });
  });

  describe('鍵設定済み', () => {
    beforeEach(() => {
      process.env.MFA_TOTP_ENC_KEY = KEY;
    });

    it('isSecretCryptoConfigured() が true', () => {
      expect(isSecretCryptoConfigured()).toBe(true);
    });

    it('encrypt → decrypt で平文に戻る（往復）', () => {
      const plain = 'JBSWY3DPEHPK3PXP';
      expect(decryptSecret(encryptSecret(plain))).toBe(plain);
    });

    it('出力は iv:authTag:ciphertext の 3 パート（hex）', () => {
      const parts = encryptSecret('hello').split(':');
      expect(parts).toHaveLength(3);
      parts.forEach((p) => expect(p).toMatch(/^[0-9a-f]+$/));
    });

    it('同一平文でも IV により毎回異なる暗号文になる', () => {
      expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
    });

    it('authTag を改竄すると復号で例外（GCM 改竄検知）', () => {
      const [iv, , cipher] = encryptSecret('tamper-me').split(':');
      const forgedTag = 'f'.repeat(32);
      // cmn-0335: 例外の種類まで固定（どんな例外でも緑になる書き方を残さない）。
      expect(() => decryptSecret([iv, forgedTag, cipher].join(':'))).toThrow(
        'Unsupported state or unable to authenticate data',
      );
    });

    it('不正フォーマット（パート数不足）は例外', () => {
      // cmn-0335: 例外の種類まで固定（どんな例外でも緑になる書き方を残さない）。
      expect(() => decryptSecret('only-one-part')).toThrow('暗号化フォーマットが不正です');
    });
  });
});
