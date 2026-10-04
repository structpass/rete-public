import type { AuthenticatedUser } from './auth.service';
import type { AccountResponseDto } from './dto/account-response.dto';

/** AuthenticatedUser → 公開 DTO。session/strategy が扱う内部表現と API 表現を分離する。 */
export function toAccountResponse(user: AuthenticatedUser): AccountResponseDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    // 省略設計の根拠は AccountResponseDto.mustChangePassword の JSDoc 参照（set-0041）。
    ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
  };
}
