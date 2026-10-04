import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

// 件数の実体は seed の TENANT_SYSTEM_DEFS（prisma/seed.ts・cmn-0347）＝現状 4 件。このコメントを
// 直す時は TENANT_SYSTEM_DEFS の実件数と突き合わせる（増減は seed 側が正）。DoS 防止の緩めの上限。
const MAX_ORDERED_IDS = 100;

/**
 * テナント契約システムの並び替え DTO。orderedIds は **全システムの id を新しい順序で重複なく** 含める想定。
 * 件数が現存システムと完全一致するかは service 層で検証する（部分集合による sortOrder 不整合を防ぐ）。
 * repository は受け取った id 群の sortOrder を配列位置（index）で更新する。
 */
export class ReorderSystemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ORDERED_IDS)
  @ArrayUnique()
  @IsString({ each: true })
  orderedIds!: string[];
}
