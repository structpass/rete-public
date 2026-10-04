import { IsDefined, IsInt, IsOptional, IsPositive, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * タスク移動（PATCH /tasks/:id/move）の入力 DTO。
 * 1 リクエストで「親変更 + カテゴリ変更 + 同階層内の並び順」を反映する。
 *
 * - parentTaskId: 移動先の親。トップレベルへ移す場合は null。
 * - categoryId: 移動先カテゴリ。未分類へ移す場合は null（rete-desk-0158）。サブツリー全体に波及する。
 *   クロス Space 移動時は Service が categoryId を強制 null（未分類）へリセットする（移動先 Space に同分類が無いため）。
 * - afterTaskId: 差し込み先の直前兄弟。兄弟グループ先頭へ入れる場合は null。
 *
 * null 許容フィールドは「フィールド必須・null 許容・undefined 拒否」を保証する:
 *   @IsDefined() で undefined を拒否し、@ValidateIf(value !== null) で「null は素通し、
 *   値があれば @IsInt/@IsPositive で検証」する。これにより move payload の片側欠落
 *   （null と undefined の取り違え）を 400 で弾く。shared には足さず backend DTO + frontend 手動同期。
 */
export class MoveTaskDto {
  @ApiProperty({
    description: '移動先の親タスク ID。トップレベルへ移す場合は null',
    nullable: true,
    type: Number,
  })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @IsPositive()
  parentTaskId: number | null;

  @ApiProperty({
    description:
      '移動先カテゴリ ID。未分類へ移す場合は null（rete-desk-0158。サブツリー全体に波及）',
    nullable: true,
    type: Number,
  })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @IsPositive()
  categoryId: number | null;

  @ApiProperty({
    description: '差し込み先の直前兄弟タスク ID。兄弟グループ先頭へ入れる場合は null',
    nullable: true,
    type: Number,
  })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @IsPositive()
  afterTaskId: number | null;

  @ApiProperty({
    description:
      '移動先の器（Space）ID。チャネル間移動時に指定（同一プロジェクト内のみ許可・CM-2 ADR 0037 §6）。省略時は器を変えない',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
