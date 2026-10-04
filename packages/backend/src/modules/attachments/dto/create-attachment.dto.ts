import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 添付先の種別。Task（タスク）／ChatMessage（チャット発話）／ChatTheme（チャットテーマ）／
 * TaskComment（タスクコメント＝スレッド投稿物・dsk-0249）。
 */
export const ATTACHMENT_TARGET_TYPES = ['task', 'chatMessage', 'theme', 'taskComment'] as const;
export type AttachmentTargetType = (typeof ATTACHMENT_TARGET_TYPES)[number];

/**
 * 添付作成の入力（POST /attachments）。
 * targetId は種別により形式が異なる（task=整数文字列・chatMessage/theme/taskComment=UUID）ため文字列で受け、
 * service 層が targetType に応じて整数/UUID を検証する（混在 PK を単一フィールドで扱う）。
 * fileId のファイルは「添付時点の最新版」が固定される（案A の版固定要件）。
 */
export class CreateAttachmentDto {
  @ApiProperty({
    enum: ATTACHMENT_TARGET_TYPES,
    description: '添付先の種別（task / chatMessage / theme / taskComment）',
  })
  @IsIn(ATTACHMENT_TARGET_TYPES)
  targetType!: AttachmentTargetType;

  @ApiProperty({
    description: '添付先 ID（task は整数文字列・chatMessage / theme / taskComment は UUID）',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;

  @ApiProperty({ description: '添付するファイル ID（UUID）。添付時点の最新版に固定される。' })
  @IsUUID()
  fileId!: string;
}

/**
 * 添付一覧の入力（GET /attachments?targetType=&targetId=）。
 * 対象（タスク/メッセージ/テーマ/タスクコメント）に紐づく添付を取得する。targetId 形式の検証は service 層。
 */
export class ListAttachmentsQueryDto {
  @ApiProperty({
    enum: ATTACHMENT_TARGET_TYPES,
    description: '添付先の種別（task / chatMessage / theme / taskComment）',
  })
  @IsIn(ATTACHMENT_TARGET_TYPES)
  targetType!: AttachmentTargetType;

  @ApiProperty({
    description: '添付先 ID（task は整数文字列・chatMessage / theme / taskComment は UUID）',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  targetId!: string;
}
