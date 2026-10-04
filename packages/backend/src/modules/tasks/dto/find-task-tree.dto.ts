import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * タスクツリー取得（GET /tasks/tree）のクエリ DTO。
 * 器（Space）絞り込み（CM-2 スライスB / ADR 0037 §7）。任意パラメータ＝未指定は全件（従来どおり）で
 * 安全な中断点を維持する。frontend がチャネル選択時に spaceId を渡し、その器のタスクのみツリー化する。
 */
export class FindTaskTreeDto {
  @ApiPropertyOptional({
    description: '器（Space）ID。指定時はその器のタスクのみツリー化（未指定＝全件）',
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
