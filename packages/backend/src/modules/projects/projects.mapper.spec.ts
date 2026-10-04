import { toProjectDto } from './projects.mapper';
import { makeProjectRow } from '../../__tests__/factories';

describe('toProjectDto', () => {
  it('ProjectRow の全フィールドを ProjectDto に変換する（id/organizationId/name/sortOrder）', () => {
    const row = makeProjectRow({
      id: 'proj-1',
      organizationId: 'org-1',
      name: 'テストプロジェクト',
      sortOrder: 3,
      archivedAt: null,
    });

    const dto = toProjectDto(row);

    expect(dto.id).toBe('proj-1');
    expect(dto.organizationId).toBe('org-1');
    expect(dto.name).toBe('テストプロジェクト');
    expect(dto.sortOrder).toBe(3);
  });

  it('archivedAt=null のとき archived=false を返す', () => {
    const row = makeProjectRow({ archivedAt: null });

    const dto = toProjectDto(row);

    expect(dto.archived).toBe(false);
  });

  it('archivedAt が Date 値のとき archived=true を返す（archivedAt→archived 変換の核心）', () => {
    const row = makeProjectRow({ archivedAt: new Date('2026-05-01T00:00:00.000Z') });

    const dto = toProjectDto(row);

    expect(dto.archived).toBe(true);
  });

  it('createdAt/updatedAt を ISO 文字列に変換する（Date→string 変換・フロント型整合）', () => {
    const row = makeProjectRow();

    const dto = toProjectDto(row);

    expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
    expect(dto.updatedAt).toBe('2026-05-29T01:23:45.000Z');
    // DTO には Date オブジェクトをそのまま出さない（フロント型 string 要求）
    expect(typeof dto.createdAt).toBe('string');
    expect(typeof dto.updatedAt).toBe('string');
  });

  it('canManageChannels は省略時 false・明示 true 時に true を返す', () => {
    const row = makeProjectRow();

    expect(toProjectDto(row).canManageChannels).toBe(false);
    expect(toProjectDto(row, true).canManageChannels).toBe(true);
    expect(toProjectDto(row, false).canManageChannels).toBe(false);
  });

  it('DTO には archivedAt フィールドを含まない（Entity 機密列の隠蔽）', () => {
    const row = makeProjectRow({ archivedAt: new Date() });

    const dto = toProjectDto(row);

    expect(dto).not.toHaveProperty('archivedAt');
  });
});
