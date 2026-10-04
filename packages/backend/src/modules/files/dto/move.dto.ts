import { IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * フォルダ移動の入力（PATCH /files/folders/:id/move）。
 * parentFolderId は移動先の親フォルダ id。ルート直下へ移す場合は明示的に null を指定する
 * （省略＝undefined は許可せず、移動先を必ず明示させる）。null 以外は UUID として検証する。
 */
export class MoveFolderDto {
  @ApiProperty({
    description: '移動先の親フォルダ ID（UUID）。ルート直下へ移す場合は null。',
    nullable: true,
    type: String,
  })
  @ValidateIf((o: MoveFolderDto) => o.parentFolderId !== null)
  @IsUUID()
  parentFolderId!: string | null;
}

/**
 * ファイル移動の入力（PATCH /files/files/:id/move）。
 * folderId は移動先フォルダ id（ファイルは必ずフォルダに属するため null 不可）。
 */
export class MoveFileDto {
  @ApiProperty({ description: '移動先フォルダ ID（UUID）', type: String })
  @IsUUID()
  folderId!: string;
}
