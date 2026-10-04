import { Role } from '@rete/shared';
import { SessionSerializer } from './session.serializer';
import type { AuthService, AuthenticatedUser } from './auth.service';

const user: AuthenticatedUser = {
  id: 'acc-1',
  email: 'user@example.com',
  name: '山田太郎',
  role: Role.MEMBER,
  sessionCredentialVersion: 'credential-version-1',
};

describe('SessionSerializer', () => {
  let serializer: SessionSerializer;
  let authService: { findActiveUser: jest.Mock };

  beforeEach(() => {
    authService = { findActiveUser: jest.fn() };
    serializer = new SessionSerializer(authService as unknown as AuthService);
  });

  describe('serializeUser', () => {
    it('session にはaccount IDとcredential versionのみ保存すること', () => {
      const done = jest.fn();
      serializer.serializeUser(user, done);
      expect(done).toHaveBeenCalledWith(null, {
        id: 'acc-1',
        sessionCredentialVersion: 'credential-version-1',
      });
    });
  });

  describe('deserializeUser', () => {
    it('credential versionが一致する有効ユーザーをDBから引き直して返すこと', async () => {
      authService.findActiveUser.mockResolvedValue(user);
      const done = jest.fn();

      await serializer.deserializeUser(
        { id: 'acc-1', sessionCredentialVersion: 'credential-version-1' },
        done,
      );

      expect(authService.findActiveUser).toHaveBeenCalledWith('acc-1');
      expect(done).toHaveBeenCalledWith(null, user);
    });

    it('ユーザーが無効化済（null）なら null を渡すこと（無効化の即時反映）', async () => {
      authService.findActiveUser.mockResolvedValue(null);
      const done = jest.fn();

      await serializer.deserializeUser(
        { id: 'acc-1', sessionCredentialVersion: 'credential-version-1' },
        done,
      );

      expect(done).toHaveBeenCalledWith(null, null);
    });

    it('credential version不一致なら既存sessionを無効化する', async () => {
      authService.findActiveUser.mockResolvedValue(user);
      const done = jest.fn();

      await serializer.deserializeUser(
        { id: 'acc-1', sessionCredentialVersion: 'old-version' },
        done,
      );

      expect(done).toHaveBeenCalledWith(null, null);
    });

    it('versionのない従来のaccount IDだけのsessionを無効化する', async () => {
      const done = jest.fn();

      await serializer.deserializeUser('acc-1', done);

      expect(authService.findActiveUser).not.toHaveBeenCalled();
      expect(done).toHaveBeenCalledWith(null, null);
    });

    it('DB 引き直しが失敗したらエラーを done へ伝播すること（session を握りつぶさない）', async () => {
      const err = new Error('db down');
      authService.findActiveUser.mockRejectedValue(err);
      const done = jest.fn();

      await serializer.deserializeUser(
        { id: 'acc-1', sessionCredentialVersion: 'credential-version-1' },
        done,
      );

      expect(done).toHaveBeenCalledWith(err);
    });
  });
});
