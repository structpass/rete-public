import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ORG_ENTITY_NAME_MAX_LEN } from '@rete/shared';

/** 組織更新 DTO（PATCH /organizations/:id・部分更新）。 */
export class UpdateOrganizationDto {
  @ApiPropertyOptional({ description: '組織名', maxLength: ORG_ENTITY_NAME_MAX_LEN })
  @IsOptional()
  @IsString()
  @MaxLength(ORG_ENTITY_NAME_MAX_LEN)
  name?: string;

  @ApiPropertyOptional({ description: 'アーカイブ（true=アーカイブ / false=復元）' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
