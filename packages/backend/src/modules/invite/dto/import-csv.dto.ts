import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * CSV 一括招待の共通パラメータ（multipart/form-data の非ファイルフィールド）。
 * 招待行へ共通適用する GROUP Space を受ける。
 */
export class ImportCsvBodyDto {
  @ApiProperty({ description: '招待先スペース ID (UUID)' })
  @IsUUID()
  spaceId!: string;
}
