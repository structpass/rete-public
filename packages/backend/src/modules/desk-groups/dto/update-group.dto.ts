import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * グループの部分更新（PATCH /desk-groups/:id）。名称変更・グループ分類間の移動（D&D・dsk-0305）を
 * 1 endpoint に集約する（Category の update と同方針）。classificationId は3値を区別する:
 *   - 省略（undefined） = 変更しない
 *   - null                = グループ分類から外す（未分類化）
 *   - UUID                 = 指定グループ分類へ移動
 */
export class UpdateDeskGroupDto {
  @ApiPropertyOptional({ description: 'グループ名', example: '重要顧客', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: '移動先グループ分類 ID（null=未分類化。省略時は変更しない）',
    nullable: true,
  })
  @ValidateIf((o) => o.classificationId !== undefined && o.classificationId !== null)
  @IsUUID('4')
  classificationId?: string | null;
}
