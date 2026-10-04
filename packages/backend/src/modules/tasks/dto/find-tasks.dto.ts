import {
  IsOptional,
  IsString,
  IsInt,
  IsEnum,
  IsIn,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { TaskStatus } from '@rete/shared';
import { PaginationDto } from '../../../common/dto';
import { MAX_MENTION_IDS } from '../../../common/mentions';

/** query の配列パラメータを正規化する（単一値 `?k=a` は [a]、未指定は undefined / chat 側と同型・dsk-0203）。 */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? (value as string[]) : [value as string];
};

/**
 * Task のソート許可フィールド（SSOT）。入力検証（FindTasksDto.sort の @IsIn）と
 * Service の LIST_CONFIG.allowedSortFields が同一ソースを参照し、ドリフトを防ぐ。
 */
export const TASK_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'status',
  'dueDate',
  'startDate',
] as const;

export class FindTasksDto extends PaginationDto {
  @ApiPropertyOptional({ description: '検索キーワード（タイトル）' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'ソートキー',
    enum: TASK_SORT_FIELDS,
    default: 'createdAt',
  })
  @IsString()
  @IsIn(TASK_SORT_FIELDS as readonly string[])
  @IsOptional()
  sort?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'ステータスフィルター', enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({ description: '機能領域分類 ID フィルター' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  // メンション From（発信者）絞り込み（複数 = OR / dsk-0203・チャット側 mentionFrom と同型）。値は Account.id。
  // 上限 + UUID 形式で巨大配列 / 不正値の流入を遮断する（posting の宛先と共通の上限）。
  @ApiPropertyOptional({ description: 'メンション From（発信者）絞り込み（複数指定可・OR）' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  mentionFrom?: string[];

  // メンション To（宛先）絞り込み（複数 = OR / dsk-0203）。From と併用時は同一タスク/コメント AND。
  @ApiPropertyOptional({ description: 'メンション To（宛先）絞り込み（複数指定可・OR）' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  mentionTo?: string[];
}
