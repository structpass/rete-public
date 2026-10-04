import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeskGroupDto {
  @ApiProperty({ description: 'グループ名', example: '重要顧客', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: '所属させるグループ分類 ID（省略=どのグループ分類にも属さない）',
  })
  @IsOptional()
  @IsUUID('4')
  classificationId?: string;
}
