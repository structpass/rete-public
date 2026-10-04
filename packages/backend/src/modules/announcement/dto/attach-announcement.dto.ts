import { IsUUID } from 'class-validator';

/**
 * 通知への添付 DTO（H0022・ADMIN 限定）。添付は既存ファイルへのリンク（版固定）で、ここではアップロードしない。
 * fileId は添付元ファイル（File.id・UUID）。添付時点の最新版を service が解決して固定する。
 */
export class AttachAnnouncementDto {
  @IsUUID()
  fileId!: string;
}
