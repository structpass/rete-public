import { IsInt, Max, Min } from 'class-validator';

export class UpsertColumnWidthDto {
  @IsInt()
  @Min(40)
  @Max(2000)
  width!: number;
}
