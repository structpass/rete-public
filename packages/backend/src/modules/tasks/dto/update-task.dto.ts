import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsPositive,
  ValidateIf,
  IsArray,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { CreateTaskDto } from './create-task.dto';
import { MAX_MENTION_IDS } from '../../../common/mentions';

// categoryId は base（CreateTaskDto）では number? だが update では null（未分類化）も許すため、
// OmitType で base から外してから nullable 宣言で再定義する（PartialType の型衝突回避 / rete-desk-0158）。
export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ['categoryId'] as const)) {
  // categoryId は CreateTaskDto では「任意・非 null」だが、update では null で未分類化（disconnect）を
  // 許す（rete-desk-0158）。nullable house pattern: 未指定は @IsOptional が skip、null は素通し、
  // 値があれば @IsInt/@IsPositive で検証。PartialType の継承定義を本宣言で上書きする。
  @ApiPropertyOptional({
    description: '機能領域分類 ID。null で未分類化（disconnect）。指定時は所属 Space の分類のみ可',
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @IsPositive()
  categoryId?: number | null;

  // 顛末（tenmatsu）の宛先（メンション先）アカウント ID 群（任意・複数可 / dsk-0203）。tenmatsu を指定した
  // 保存でのみ、顛末面（field=TENMATSU）の宛先を差し替える。未指定なら据え置き（説明面 DESCRIPTION の宛先は
  // 本キーでは触らない＝面別の独立保存。descriptionMentionAccountIds は CreateTaskDto から継承済み）。
  // 重複排除・存在検証は service が行う。
  @ApiPropertyOptional({
    description: '顛末（tenmatsu）の宛先（メンション先）アカウント ID 群（dsk-0203）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_IDS)
  @IsUUID(undefined, { each: true })
  tenmatsuMentionAccountIds?: string[];
}
