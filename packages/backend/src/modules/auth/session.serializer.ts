import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService, AuthenticatedUser } from './auth.service';

/**
 * express-session には account id とpassword由来の署名付きversionのみ保存する。
 * password変更後、deserializeでversionが合わない既存sessionを無効化する。
 */
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }

  serializeUser(
    user: AuthenticatedUser,
    done: (err: Error | null, payload?: unknown) => void,
  ): void {
    if (!user.sessionCredentialVersion) {
      done(new Error('Authenticated user is missing a session credential version'));
      return;
    }
    done(null, { id: user.id, sessionCredentialVersion: user.sessionCredentialVersion });
  }

  async deserializeUser(
    payload: unknown,
    done: (err: Error | null, user?: AuthenticatedUser | null) => void,
  ): Promise<void> {
    try {
      // Legacy sessions have only an id and cannot be checked against the password in effect.
      // Invalidate them once on deployment instead of leaving them unbound to credential changes.
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('id' in payload) ||
        typeof payload.id !== 'string' ||
        !('sessionCredentialVersion' in payload) ||
        typeof payload.sessionCredentialVersion !== 'string'
      ) {
        done(null, null);
        return;
      }
      const user = await this.authService.findActiveUser(payload.id);
      done(null, user?.sessionCredentialVersion === payload.sessionCredentialVersion ? user : null);
    } catch (err) {
      done(err as Error);
    }
  }
}
