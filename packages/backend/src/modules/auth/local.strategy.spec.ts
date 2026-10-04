import { LocalStrategy } from './local.strategy';
import type { AuthService } from './auth.service';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: { validateCredentials: jest.Mock };

  beforeEach(() => {
    authService = { validateCredentials: jest.fn() };
    strategy = new LocalStrategy(authService as unknown as AuthService);
  });

  describe('validate', () => {
    it('email/password を AuthService.validateCredentials へ委譲し結果を返すこと', async () => {
      const user = { id: 'acc-1', email: 'user@example.com', name: '山田太郎' };
      authService.validateCredentials.mockResolvedValue(user);

      const result = await strategy.validate('user@example.com', 'pw-secret');

      expect(authService.validateCredentials).toHaveBeenCalledWith('user@example.com', 'pw-secret');
      expect(result).toBe(user);
    });

    it('資格情報が不正なら AuthService の例外をそのまま伝播すること', async () => {
      authService.validateCredentials.mockRejectedValue(new Error('Invalid credentials'));

      await expect(strategy.validate('user@example.com', 'wrong')).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });
});
