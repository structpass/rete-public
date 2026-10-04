import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { DESK_PANE_RATIO_MIN, DESK_PANE_RATIO_MAX } from '@rete/shared';

/**
 * Desk 個人設定（ペイン幅）の更新リクエスト（PUT /accounts/me/desk-preference / rete-desk-0142）。
 * 値域は @rete/shared の SSOT（0.25〜0.75）を frontend clamp と共有し、片ペインが潰れた状態の
 * 永続化を backend でも硬化する。
 */
export class UpdateDeskPreferenceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(DESK_PANE_RATIO_MIN)
  @Max(DESK_PANE_RATIO_MAX)
  leftPaneRatio!: number;
}

/**
 * Desk 個人設定のレスポンス DTO（§1 DTO 境界）。Prisma DeskPreference を直返しせず、
 * UI が使う比率のみ公開する（accountId / created/updatedAt は載せない）。
 */
export interface DeskPreferenceDto {
  leftPaneRatio: number;
}
