import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { IpWhitelistEntryInput, IpWhitelistInput } from '@rete/shared';
import { IsCidrConstraint } from '../../../common/net/is-cidr.validator';
import {
  IP_CIDR_MAX_LENGTH,
  IP_NOTE_MAX_LENGTH,
  IP_WHITELIST_MAX_ENTRIES,
} from '../login-settings.constants';

/** IP 許可リスト 1 エントリの入力（CIDR は IsCidrConstraint で IPv4/IPv6 を検証）。 */
export class IpWhitelistEntryInputDto implements IpWhitelistEntryInput {
  @ApiProperty({ description: '許可 CIDR（IPv4 / IPv6・例 203.0.113.0/24）' })
  @IsString()
  @MaxLength(IP_CIDR_MAX_LENGTH)
  @Validate(IsCidrConstraint)
  cidr: string;

  @ApiProperty({ description: '備考（任意・省略時は空文字で保存）', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(IP_NOTE_MAX_LENGTH)
  note?: string;
}

/**
 * IP 許可リスト更新 DTO（PUT /settings/login/ip-whitelist・全置換）。
 * 空配列 = 制限解除。CIDR の妥当性は各エントリの IsCidrConstraint + service の二重防御で担保。
 */
export class UpdateIpWhitelistDto implements IpWhitelistInput {
  @ApiProperty({
    description: '許可エントリ（全置換・空配列で制限解除）',
    type: [IpWhitelistEntryInputDto],
  })
  @IsArray()
  @ArrayMaxSize(IP_WHITELIST_MAX_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => IpWhitelistEntryInputDto)
  entries: IpWhitelistEntryInputDto[];
}
