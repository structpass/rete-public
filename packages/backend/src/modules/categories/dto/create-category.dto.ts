import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: '機能領域分類名', example: '入荷', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: '所属する器（Space）ID（rete-desk-0158・Space スコープ）' })
  @IsUUID()
  @IsNotEmpty()
  spaceId: string;

  // @Max は int4 上限超で Prisma が未補足 500 を返すのを防ぐ防衛（UpdateCategoryDto と対称）。
  @ApiPropertyOptional({ description: '表示順', default: 0, minimum: 0, maximum: 1_000_000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  sortOrder?: number;
}
