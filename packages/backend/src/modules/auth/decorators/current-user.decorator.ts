import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth.service';

/**
 * 認証済みリクエストの現在ユーザー（req.user = AuthenticatedUser）を取り出すパラメータデコレータ。
 * AuthenticatedGuard 配下でのみ使う前提。引数なしで全体、キー指定でそのプロパティだけを返す。
 *
 * 例: `@CurrentUser('id') authorId: string` / `@CurrentUser() user: AuthenticatedUser`
 *
 * controller 各所に `req.user as AuthenticatedUser` のキャストを撒かないための共通化（§3）。
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    return data ? user?.[data] : user;
  },
);
