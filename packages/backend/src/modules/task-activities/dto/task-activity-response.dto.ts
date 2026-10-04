// 応答 DTO の方針（API 仕様書に出さない／装飾は入力側だけ）はモデルタブ dto-boundary を参照。形の SSOT は @rete/shared（cmn-0211）。
export type {
  TaskActivityField,
  TaskActivityActorDto,
  TaskActivityDto as TaskActivityResponseDto,
  TaskActivityListDto as TaskActivityListResponseDto,
} from '@rete/shared';
