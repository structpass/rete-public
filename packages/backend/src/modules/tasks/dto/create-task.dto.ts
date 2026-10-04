import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsPositive,
  IsEnum,
  IsDateString,
  IsUUID,
  MaxLength,
  ValidateIf,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@rete/shared';
// メンション宛先の上限は SSOT をチャット側に置く（rete-desk-0049・dsk-0203 でタスク側へミラー）。
import { MAX_MENTION_IDS } from '../../../common/mentions';

export class CreateTaskDto {
  @ApiProperty({ description: 'タスクタイトル', example: '入荷データ取込', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ description: '説明', maxLength: 5000 })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  // 説明（description）の宛先（メンション先）アカウント ID 群（任意・複数可 / dsk-0203）。
  // 本文中の @ メンションノードから frontend が抽出する。チャット側 ChatThemeMention と同じ上限 + UUID
  // 形式で巨大配列 / 不正値の流入を入力境界で遮断する。重複排除・存在検証は service が行う。
  @ApiPropertyOptional({
    description: '説明（description）の宛先（メンション先）アカウント ID 群（dsk-0203）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  descriptionMentionAccountIds?: string[];

  @ApiPropertyOptional({
    description: '顛末（結論・決定事項）。status=DONE では必須（完了ゲート、Service が検証）',
    maxLength: 5000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  tenmatsu?: string;

  // 顛末（tenmatsu）の宛先（メンション先）アカウント ID 群（dsk-0284・UpdateTaskDto と同型）。
  @ApiPropertyOptional({
    description: '顛末（tenmatsu）の宛先（メンション先）アカウント ID 群（dsk-0284）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  tenmatsuMentionAccountIds?: string[];

  @ApiPropertyOptional({ description: 'ステータス', enum: TaskStatus, default: TaskStatus.TODO })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({
    description:
      '機能領域分類 ID（rete-desk-0158 で任意化＝未指定は未分類）。指定時は所属 Space の分類のみ可（Service が検証）',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  categoryId?: number;

  @ApiPropertyOptional({ description: '親タスク ID（自己参照）' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  parentTaskId?: number;

  @ApiPropertyOptional({
    description: '昇格元 ChatTheme ID（チャット→タスク昇格時に指定。存在検証あり）',
  })
  @IsUUID()
  @IsOptional()
  sourceThemeId?: string;

  @ApiPropertyOptional({
    description:
      '兄弟挿入の基準タスク ID。このタスクの直後に挿入する。省略時は兄弟グループ末尾に追加',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  afterTaskId?: number;

  @ApiPropertyOptional({
    description:
      '担当 Account ID（UUID）。指定で割当、null で割当解除。存在検証あり（Service）。' +
      '旧 assigneeName は移行期データ温存のため残すが、新規割当は本フィールドを使う',
  })
  // null は「割当解除」の有効値として通す（@IsUUID は null を弾くため @ValidateIf で skip）。
  // undefined（未指定）は @IsOptional が skip、string は @IsUUID が検証。MoveTaskDto と同型の nullable house pattern。
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  @IsOptional()
  assigneeId?: string | null;

  @ApiPropertyOptional({ description: '担当者名（旧フリーテキスト・移行期温存）', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  assigneeName?: string;

  @ApiPropertyOptional({ description: '開始日 (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '期日 (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({
    description:
      '所属する器（Space）ID（CM-2 / ADR 0037 §7）。未指定時は Service が親タスクの器を継承、' +
      'トップレベルなら DEFAULT_CHANNEL_ID を刻印（孤児化防止）',
  })
  @IsUUID()
  @IsOptional()
  spaceId?: string;
}
