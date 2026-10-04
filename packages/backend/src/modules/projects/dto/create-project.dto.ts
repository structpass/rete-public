import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORG_ENTITY_NAME_MAX_LEN } from '@rete/shared';

/** プロジェクト作成 DTO（POST /projects）。 */
export class CreateProjectDto {
  @ApiProperty({ description: '所属組織 ID (UUID)' })
  @IsUUID()
  organizationId: string;

  @ApiProperty({ description: 'プロジェクト名', maxLength: ORG_ENTITY_NAME_MAX_LEN })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ORG_ENTITY_NAME_MAX_LEN)
  name: string;

  @ApiPropertyOptional({
    description: 'プロジェクト ADMIN に任命するアカウント ID 群（省略時は作成者のみ ADMIN）',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  adminAccountIds?: string[];
}
