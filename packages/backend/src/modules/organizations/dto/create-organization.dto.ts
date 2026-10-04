import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ORG_ENTITY_NAME_MAX_LEN } from '@rete/shared';

/** 組織作成 DTO（POST /organizations）。 */
export class CreateOrganizationDto {
  @ApiProperty({ description: '組織名', maxLength: ORG_ENTITY_NAME_MAX_LEN })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ORG_ENTITY_NAME_MAX_LEN)
  name: string;
}
