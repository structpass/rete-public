import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidCidr } from './cidr';

/**
 * class-validator 制約: 値が有効な CIDR（IPv4 / IPv6）か。`@Validate(IsCidrConstraint)` で DTO に課す。
 * 実体は common/net/cidr の isValidCidr（Node net.isIP ベース・新規依存なし）に委譲する。
 */
@ValidatorConstraint({ name: 'isCidr', async: false })
export class IsCidrConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCidr(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} は有効な CIDR（例: 203.0.113.0/24）ではありません`;
  }
}
