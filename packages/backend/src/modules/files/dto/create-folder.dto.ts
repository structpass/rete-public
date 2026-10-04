import { IsDefined, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * フォルダ作成の入力（POST /files/folders）。
 * parentFolderId は作成先の親フォルダ id。ルート直下に作る場合は明示的に null を指定する
 * （省略＝undefined は許可せず、作成先を必ず明示させる）。null 以外は UUID として検証する。
 * name は 1〜255 文字。実体上の安全側サニタイズ（制御文字除去・前後空白詰め）は service 層で行う。
 */
export class CreateFolderDto {
  @ApiProperty({
    description: '作成先の親フォルダ ID（UUID）。ルート直下に作る場合は null。',
    nullable: true,
    type: String,
  })
  // undefined（フィールド省略）は明示拒否。null は許可し、null 以外のみ UUID として検証する。
  @IsDefined()
  @ValidateIf((o: CreateFolderDto) => o.parentFolderId !== null)
  @IsUUID()
  parentFolderId!: string | null;

  @ApiProperty({ description: 'フォルダ名（1〜255 文字）', type: String })
  @IsString()
  @Length(1, 255)
  name!: string;

  /**
   * 作成先の器（Space id・ADR 0063 §5.1）。ルート直下（parentFolderId=null）に作る時の帰属先。
   * 親ありの場合は親から継承するため指定は不要で、親と異なる値を送ると service 層が 400 で弾く
   * （黙って上書きすると cross-Space 作成のバグが 200 で通って表面化しない）。
   *
   * ルート直下は必須（未指定は service 層が 400・fil-0137 で移行期フォールバックを撤去）。
   * @IsOptional は親あり作成での省略を許すためで、ルート直下の必須検証は service の null チェックが担う。
   */
  @ApiProperty({
    description:
      '作成先の器（Space ID・UUID）。ルート直下作成時に指定する。親ありの場合は親から継承。',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
