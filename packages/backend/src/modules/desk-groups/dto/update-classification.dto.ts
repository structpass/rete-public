import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** グループ分類の名称変更（PATCH /desk-groups/classifications/:id）。名称変更のみ扱う単機能 DTO。 */
export class UpdateDeskGroupClassificationDto {
  @ApiProperty({ description: 'グループ分類名', example: '取引先', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
