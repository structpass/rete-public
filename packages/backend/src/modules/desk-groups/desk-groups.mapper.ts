import type { DeskGroup, DeskGroupClassification, DeskGroupMember } from '@prisma/client';
import type { DeskGroupClassificationDto, DeskGroupDto } from '@rete/shared';

/** DeskGroupClassification Entity → Response DTO（§1 DTO 境界・純粋関数）。 */
export function toClassificationDto(entity: DeskGroupClassification): DeskGroupClassificationDto {
  return {
    id: entity.id,
    name: entity.name,
    sortOrder: entity.sortOrder,
  };
}

/**
 * DeskGroup Entity + 所属メンバー行 → Response DTO。memberRefs は sortOrder 昇順の targetRef 配列
 * （呼び出し側が groupId で絞った members を渡す契約。ここでは並び順の再ソートのみ行う）。
 */
export function toGroupDto(entity: DeskGroup, members: DeskGroupMember[]): DeskGroupDto {
  return {
    id: entity.id,
    name: entity.name,
    classificationId: entity.classificationId,
    sortOrder: entity.sortOrder,
    memberRefs: [...members].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.targetRef),
  };
}
