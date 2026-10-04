import { toClassificationDto, toGroupDto } from './desk-groups.mapper';
// 共有ファクトリへ集約（dsk-0368）。ローカル fixture の逐語重複を解消。
import {
  makeDeskGroupClassificationEntity as makeClassification,
  makeDeskGroupEntity as makeGroup,
  makeDeskGroupMemberEntity as makeMember,
} from '../../__tests__/factories';

describe('toClassificationDto', () => {
  it('表示用の最小集合だけを返し、内部列は落とす', () => {
    const dto = toClassificationDto(makeClassification());
    expect(dto).toEqual({ id: 'c1', name: 'グループ分類1', sortOrder: 0 });
    expect(dto).not.toHaveProperty('accountId');
    expect(dto).not.toHaveProperty('createdAt');
    expect(dto).not.toHaveProperty('updatedAt');
  });
});

describe('toGroupDto', () => {
  it('memberRefs 無しなら空配列を返す', () => {
    const dto = toGroupDto(makeGroup(), []);
    expect(dto).toEqual({
      id: 'g1',
      name: 'グループ1',
      classificationId: null,
      sortOrder: 0,
      memberRefs: [],
    });
  });

  it('members を sortOrder 昇順に並べ替えて targetRef のみ抽出する', () => {
    const members = [
      makeMember({ id: 'm2', targetRef: 'space-2', sortOrder: 2 }),
      makeMember({ id: 'm1', targetRef: 'space-1', sortOrder: 0 }),
      makeMember({ id: 'm3', targetRef: 'space-3', sortOrder: 1 }),
    ];

    const dto = toGroupDto(makeGroup(), members);

    expect(dto.memberRefs).toEqual(['space-1', 'space-3', 'space-2']);
  });

  it('classificationId をそのまま透過する', () => {
    const dto = toGroupDto(makeGroup({ classificationId: 'c1' }), []);
    expect(dto.classificationId).toBe('c1');
  });

  it('渡された members 配列を破壊的に変更しない', () => {
    const members = [
      makeMember({ id: 'm2', sortOrder: 1 }),
      makeMember({ id: 'm1', sortOrder: 0 }),
    ];
    const original = [...members];

    toGroupDto(makeGroup(), members);

    expect(members).toEqual(original);
  });
});
