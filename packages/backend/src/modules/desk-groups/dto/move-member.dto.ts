import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 宛先のグループ移動＋並び替え（PATCH /desk-groups/members/move / dsk-0304）。
 * D&D の1操作（別グループへ移動・グループ内で並べ替え・グループから外す）を1 endpoint に集約する:
 *   - groupId が UUID: targetRef を当該グループへ移動（未所属なら新規登録）し、
 *     orderedRefs で移動先グループの表示順を確定する（移動対象自身を含む全件必須）。
 *   - groupId が null: targetRef のグループ所属を解除する（未分類に戻す）。orderedRefs は無視。
 */
export class MoveDeskGroupMemberDto {
  @ApiProperty({ description: '対象宛先の参照キー（Space.id）', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  targetRef!: string;

  @ApiProperty({ description: '移動先グループ ID（null=グループ所属を解除）', nullable: true })
  @ValidateIf((o) => o.groupId !== null)
  @IsUUID('4')
  groupId!: string | null;

  @ApiProperty({
    description: '移動先グループの表示順（groupId が null の場合は無視される）',
    type: [String],
    required: false,
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  orderedRefs: string[] = [];
}
