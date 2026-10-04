import { IsBoolean } from 'class-validator';

/** テナント契約システムの有効/無効切り替え DTO。 */
export class ToggleSystemDto {
  @IsBoolean()
  enabled!: boolean;
}
