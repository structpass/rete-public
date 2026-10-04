import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_ALLOWED_EXTENSIONS,
  MAX_REJECTED_EXTENSIONS,
  UPLOAD_HARD_LIMIT_BYTES,
} from '../files.constants';
import type { FileSettingsResponseDto, UpdateFileSettingsInput } from '@rete/shared';

/**
 * 設定タブの Response DTO（§1 DTO 境界・cmn-0216 で集約）。
 * 契約形（shape）は @rete/shared の `types/files.FileSettingsResponseDto` を単一ソースとする。
 * 本ファイルは同名・同形の別名として再公開する（先例 cmn-0198 / cmn-0211 と同方針）。
 */
export type { FileSettingsResponseDto };

/**
 * 設定タブの更新入力（PATCH /files/settings）。両項目とも任意（部分更新）。
 * maxSizeBytes は hard cap（UPLOAD_HARD_LIMIT_BYTES）以下に制約する（multipart backstop と矛盾しないように）。
 * allowedExtensions は `.pdf` 形式のみ受け付け、正規化（小文字・重複排除）は service 層で行う。
 * 入力 DTO は class-validator / @nestjs/swagger の装飾が必要な backend 固有の責務のため、shared には置かない。
 */
export class UpdateFileSettingsDto implements UpdateFileSettingsInput {
  @ApiPropertyOptional({
    description: '最大アップロードサイズ（bytes）',
    minimum: 1,
    maximum: UPLOAD_HARD_LIMIT_BYTES,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(UPLOAD_HARD_LIMIT_BYTES)
  maxSizeBytes?: number;

  @ApiPropertyOptional({ description: '許可拡張子（".pdf" 形式・空配列で全許可）', type: [String] })
  @IsOptional()
  @IsArray({ message: '拡張子は配列で指定してください' })
  @ArrayMaxSize(MAX_ALLOWED_EXTENSIONS, {
    message: `拡張子は ${MAX_ALLOWED_EXTENSIONS} 件までです`,
  })
  @IsString({ each: true, message: '拡張子は文字列で指定してください' })
  @MaxLength(20, { each: true, message: '拡張子は 20 文字までです' })
  @Matches(/^\.[A-Za-z0-9]+$/, { each: true, message: '拡張子は ".pdf" の形式で指定してください' })
  allowedExtensions?: string[];

  /**
   * 拒否する拡張子（v2-197）。allowedExtensions と同じ形式・上限で受け、正規化は service 層で行う。
   * 未指定（undefined）は据え置き、空配列は拒否なし（全解除）として扱う（部分更新の意味論を保つ）。
   * 検証の文言は allowedExtensions と揃えて日本語で返す（v2-197 レビュー指摘 F3。既定の英語文言は
   * 「どの項目がどう悪いか」を画面へ出せない）。
   */
  @ApiPropertyOptional({
    description: '拒否する拡張子（".pdf" 形式・空配列で拒否なし）',
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: '拡張子は配列で指定してください' })
  @ArrayMaxSize(MAX_REJECTED_EXTENSIONS, {
    message: `拡張子は ${MAX_REJECTED_EXTENSIONS} 件までです`,
  })
  @IsString({ each: true, message: '拡張子は文字列で指定してください' })
  @MaxLength(20, { each: true, message: '拡張子は 20 文字までです' })
  @Matches(/^\.[A-Za-z0-9]+$/, { each: true, message: '拡張子は ".pdf" の形式で指定してください' })
  rejectedExtensions?: string[];
}
