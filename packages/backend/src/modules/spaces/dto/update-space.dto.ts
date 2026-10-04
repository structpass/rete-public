import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ORG_ENTITY_NAME_MAX_LEN } from '@rete/shared';

/** 器（Space）更新 DTO（CHANNEL / GROUP の改名・archive のみ対象）。 */
export class UpdateSpaceDto {
  @ApiPropertyOptional({
    description: '名前（CHANNEL/GROUP のみ）',
    maxLength: ORG_ENTITY_NAME_MAX_LEN,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name は空にできません' })
  @MaxLength(ORG_ENTITY_NAME_MAX_LEN)
  name?: string;

  @ApiPropertyOptional({ description: 'アーカイブ（true=アーカイブ / false=復元）' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
