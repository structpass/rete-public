import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService, AuthenticatedUser } from './auth.service';

/**
 * passport-local ストラテジ。ログインフォームの field 名は email / password
 * （passport-local の既定 username / password を上書き）。
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  validate(email: string, password: string): Promise<AuthenticatedUser> {
    return this.authService.validateCredentials(email, password);
  }
}
