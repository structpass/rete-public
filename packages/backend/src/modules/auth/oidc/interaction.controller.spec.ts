import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import type { InteractionHelper } from 'nest-oidc-provider';
import type { Provider } from 'oidc-provider';
import { InteractionController } from './interaction.controller';
import type { AuthService, AuthenticatedUser } from '../auth.service';
import { throttleLimitOf, throttleTtlOf } from '../../../common/testing/throttle-metadata';

describe('InteractionController MFA boundary', () => {
  const RESUME_URL = 'http://localhost:3011/api/v1/oidc/auth/abc';
  const ACCOUNT: AuthenticatedUser = {
    id: 'acc-1',
    email: 'a@b.c',
    name: 'A',
    role: 'MEMBER' as AuthenticatedUser['role'],
  };
  const auth = {
    validateCredentials: jest.fn(),
    findActiveUser: jest.fn(),
    resetLoginAttempts: jest.fn(),
    registerFailedMfaAttempt: jest.fn(),
    assertMfaChallengeAllowed: jest.fn(),
  };
  const mfa = {
    verifyHasEnabledMfa: jest.fn(),
    verifyLoginChallenge: jest.fn(),
    hasConfirmedMfa: jest.fn(),
  };
  const loginSettings = { isMfaEnforced: jest.fn() };

  const buildController = () =>
    new InteractionController(
      auth as unknown as AuthService,
      mfa as never,
      loginSettings as never,
      {} as Provider,
    );

  const makeInteraction = (promptName = 'login') =>
    ({
      details: jest.fn().mockResolvedValue({
        uid: 'oidc-uid',
        prompt: { name: promptName },
        params: { client_id: 'client-1' },
      }),
      result: jest.fn().mockResolvedValue(RESUME_URL),
    }) as unknown as InteractionHelper & {
      details: jest.Mock;
      result: jest.Mock;
    };

  const makeReq = (user?: Partial<AuthenticatedUser>) =>
    ({ user, session: {} }) as unknown as Request;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.validateCredentials.mockResolvedValue(ACCOUNT);
    auth.findActiveUser.mockResolvedValue(ACCOUNT);
    auth.resetLoginAttempts.mockResolvedValue(undefined);
    auth.assertMfaChallengeAllowed.mockResolvedValue(undefined);
    auth.registerFailedMfaAttempt.mockResolvedValue(false);
    mfa.verifyHasEnabledMfa.mockResolvedValue(false);
    mfa.verifyLoginChallenge.mockResolvedValue(true);
    mfa.hasConfirmedMfa.mockResolvedValue(true);
    loginSettings.isMfaEnforced.mockResolvedValue(false);
  });

  it('passwordだけでMFA設定済みaccountのOIDC interactionを確定しない', async () => {
    mfa.verifyHasEnabledMfa.mockResolvedValue(true);
    const controller = buildController();
    const interaction = makeInteraction();
    const req = makeReq();

    const result = await controller.login(
      interaction,
      { email: ACCOUNT.email, password: 'pw' },
      req,
    );

    expect(result).toEqual({ success: true, data: { mfaRequired: true } });
    expect(interaction.result).not.toHaveBeenCalled();
    expect(req.session.pendingMfaAccountId).toBe(ACCOUNT.id);
    expect(req.session.pendingMfaInteractionUid).toBe('oidc-uid');
    expect(auth.resetLoginAttempts).not.toHaveBeenCalled();
  });

  it('MFA無効のpassword loginは従来どおりinteractionを完了する', async () => {
    const controller = buildController();
    const interaction = makeInteraction();

    const result = await controller.login(
      interaction,
      { email: ACCOUNT.email, password: 'pw' },
      makeReq(),
    );

    expect(auth.resetLoginAttempts).toHaveBeenCalledWith(ACCOUNT.id);
    expect(interaction.result).toHaveBeenCalledWith(
      { login: { accountId: ACCOUNT.id, remember: false } },
      { mergeWithLastSubmission: false },
    );
    expect(result).toEqual({ success: true, data: { redirectTo: RESUME_URL } });
  });

  it('全体MFA強制中にMFA未設定ならOIDC assertionを発行しない', async () => {
    loginSettings.isMfaEnforced.mockResolvedValue(true);
    mfa.verifyHasEnabledMfa.mockResolvedValue(false);
    mfa.hasConfirmedMfa.mockResolvedValue(false);
    const interaction = makeInteraction();

    await expect(
      buildController().login(interaction, { email: ACCOUNT.email, password: 'pw' }, makeReq()),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: { code: 'MFA_SETUP_REQUIRED' },
    });
    expect(interaction.result).not.toHaveBeenCalled();
  });

  it('MFAが登録済みでも強制中に暗号鍵不足で検証不能ならfail closedする', async () => {
    loginSettings.isMfaEnforced.mockResolvedValue(true);
    mfa.verifyHasEnabledMfa.mockResolvedValue(false);
    mfa.hasConfirmedMfa.mockResolvedValue(true);
    const interaction = makeInteraction();

    await expect(
      buildController().login(interaction, { email: ACCOUNT.email, password: 'pw' }, makeReq()),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(interaction.result).not.toHaveBeenCalled();
  });

  it('OIDC MFA不一致はAccount単位counterとpending counterに記録する', async () => {
    mfa.verifyHasEnabledMfa.mockResolvedValue(true);
    mfa.verifyLoginChallenge.mockResolvedValue(false);
    const req = makeReq();
    req.session.pendingMfaAccountId = ACCOUNT.id;
    req.session.pendingMfaAttempts = 0;
    req.session.pendingMfaInteractionUid = 'oidc-uid';
    const interaction = makeInteraction();

    await expect(
      buildController().loginMfa(interaction, { code: '000000' }, req),
    ).rejects.toMatchObject({ response: { code: 'MFA_INVALID_CODE' } });
    expect(auth.assertMfaChallengeAllowed).toHaveBeenCalledWith(ACCOUNT.id);
    expect(auth.registerFailedMfaAttempt).toHaveBeenCalledWith(ACCOUNT.id);
    expect(req.session.pendingMfaAttempts).toBe(1);
    expect(interaction.result).not.toHaveBeenCalled();
  });

  it('Account lockoutまたは5回上限でOIDC MFA pendingを破棄する', async () => {
    mfa.verifyLoginChallenge.mockResolvedValue(false);
    auth.registerFailedMfaAttempt.mockResolvedValue(true);
    const req = makeReq();
    req.session.pendingMfaAccountId = ACCOUNT.id;
    req.session.pendingMfaAttempts = 0;
    req.session.pendingMfaInteractionUid = 'oidc-uid';

    await expect(
      buildController().loginMfa(makeInteraction(), { code: '000000' }, req),
    ).rejects.toMatchObject({ response: { code: 'MFA_INVALID_CODE' } });
    expect(req.session.pendingMfaAccountId).toBeUndefined();
    expect(req.session.pendingMfaInteractionUid).toBeUndefined();
  });

  it('正しいMFAを確認した後だけOIDC interactionを確定する', async () => {
    const req = makeReq();
    req.session.pendingMfaAccountId = ACCOUNT.id;
    req.session.pendingMfaAttempts = 2;
    req.session.pendingMfaInteractionUid = 'oidc-uid';
    const interaction = makeInteraction();

    const result = await buildController().loginMfa(interaction, { code: '123456' }, req);

    expect(auth.findActiveUser).toHaveBeenCalledWith(ACCOUNT.id);
    expect(auth.resetLoginAttempts).toHaveBeenCalledWith(ACCOUNT.id);
    expect(interaction.result).toHaveBeenCalledWith(
      { login: { accountId: ACCOUNT.id, remember: false } },
      { mergeWithLastSubmission: false },
    );
    expect(req.session.pendingMfaAccountId).toBeUndefined();
    expect(req.session.pendingMfaInteractionUid).toBeUndefined();
    expect(result).toEqual({ success: true, data: { redirectTo: RESUME_URL } });
  });

  it('同じブラウザでも別interactionのMFA pendingを流用できない', async () => {
    const req = makeReq();
    req.session.pendingMfaAccountId = ACCOUNT.id;
    req.session.pendingMfaInteractionUid = 'another-uid';
    const interaction = makeInteraction();

    await expect(
      buildController().loginMfa(interaction, { code: '123456' }, req),
    ).rejects.toMatchObject({ response: { code: 'MFA_REQUIRED' } });
    expect(mfa.verifyLoginChallenge).not.toHaveBeenCalled();
    expect(interaction.result).not.toHaveBeenCalled();
  });

  it('既存Rete sessionからのSSOも有効MFAの証跡がない場合は拒否する', async () => {
    mfa.verifyHasEnabledMfa.mockResolvedValue(true);
    const interaction = makeInteraction();

    await expect(
      buildController().sessionLogin(interaction, makeReq({ id: ACCOUNT.id })),
    ).rejects.toMatchObject({ response: { code: 'MFA_REQUIRED' } });
    expect(interaction.result).not.toHaveBeenCalled();
  });

  it('MFA確認済みの既存Rete sessionはシームレスSSOを継続する', async () => {
    mfa.verifyHasEnabledMfa.mockResolvedValue(true);
    const interaction = makeInteraction();
    const req = makeReq({ id: ACCOUNT.id });
    req.session.mfaVerifiedAt = Date.now();

    const result = await buildController().sessionLogin(interaction, req);

    expect(interaction.result).toHaveBeenCalledWith(
      { login: { accountId: ACCOUNT.id, remember: false } },
      { mergeWithLastSubmission: false },
    );
    expect(req.session.authMethod).toBe('sso');
    expect(result).toEqual({ success: true, data: { redirectTo: RESUME_URL } });
  });

  it('sessionLoginではlogin以外のpromptを確定しない', async () => {
    const interaction = makeInteraction('consent');

    await expect(
      buildController().sessionLogin(interaction, makeReq({ id: ACCOUNT.id })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(interaction.result).not.toHaveBeenCalled();
  });
});

describe('InteractionController throttles', () => {
  it('credential, MFA, session login, and consent actions are limited to 5 requests per 60 seconds', () => {
    for (const handler of [
      InteractionController.prototype.login,
      InteractionController.prototype.loginMfa,
      InteractionController.prototype.sessionLogin,
      InteractionController.prototype.confirm,
    ]) {
      expect(throttleLimitOf(handler)).toBe(5);
      expect(throttleTtlOf(handler)).toBe(60_000);
    }
  });
});
