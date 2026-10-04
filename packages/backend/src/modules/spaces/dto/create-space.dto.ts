import { IsEnum, IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SpaceKind, ORG_ENTITY_NAME_MAX_LEN } from '@rete/shared';

/**
 * 器（Space）作成 DTO。kind により必須フィールドが変わる（判別共用体DTO）:
 * - CHANNEL: projectId + name 必須
 * - GROUP: name 必須
 * - PERSONAL_MEMO: name 任意（省略時は '個人メモ'）
 * - PERSONAL_DM: peerAccountId 必須
 *
 * class-validator の ValidateIf で kind ごとにフィールドを条件付き必須にする。
 */
export class CreateSpaceDto {
  @ApiProperty({ enum: SpaceKind, description: '器の種別' })
  @IsEnum(SpaceKind)
  kind: SpaceKind;

  @ApiPropertyOptional({
    description: '名前（CHANNEL/GROUP 必須・PERSONAL_MEMO 任意）',
    maxLength: ORG_ENTITY_NAME_MAX_LEN,
  })
  @ValidateIf((o) => o.kind === SpaceKind.CHANNEL || o.kind === SpaceKind.GROUP)
  @IsString()
  @IsNotEmpty({ message: 'name は空にできません' })
  @MaxLength(ORG_ENTITY_NAME_MAX_LEN)
  name?: string;

  @ApiPropertyOptional({ description: '所属プロジェクト ID（CHANNEL のみ必須）' })
  @ValidateIf((o) => o.kind === SpaceKind.CHANNEL)
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: '1:1 の相手アカウント ID（PERSONAL_DM のみ必須）' })
  @ValidateIf((o) => o.kind === SpaceKind.PERSONAL_DM)
  @IsUUID()
  peerAccountId?: string;
}
