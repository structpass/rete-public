'use client';
import { ActionButton, TableCard } from '@/features/settings/components/primitives';
import type { ProjectDto } from '@rete/shared';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// プロジェクトペイン（中央）
// ─────────────────────────────────────────────────────────────────────────────

export function ProjectPane({
  projects,
  selectedProjectId,
  updating,
  searching,
  includeArchived,
  onSelect,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: {
  projects: ProjectDto[];
  selectedProjectId: string | null;
  updating: boolean;
  searching: boolean;
  includeArchived: boolean;
  onSelect: (project: ProjectDto) => void;
  onRename: (project: ProjectDto) => void;
  onArchive: (project: ProjectDto) => void;
  onRestore: (project: ProjectDto) => void;
  onDelete: (project: ProjectDto) => void;
}) {
  return (
    <TableCard hoverBand borderless>
      <table className="sp-table sp-table--hoverband sp-table--framed">
        <thead>
          <tr>
            <th>プロジェクト名</th>
            <th style={{ width: 96, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((proj) => {
            const selected = proj.id === selectedProjectId;
            return (
              <tr
                key={proj.id}
                className={`sp-row-pillable${selected ? ' sp-row-ring' : ''}`}
                onClick={() => onSelect(proj)}
                data-selected={selected || undefined}
              >
                <td
                  style={{
                    color: proj.archived ? 'var(--sp-text-warm-mute)' : 'var(--sp-text-warm)',
                  }}
                >
                  {proj.name}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
                    <ActionButton
                      icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRename(proj);
                      }}
                      disabled={updating}
                      ariaLabel={`${proj.name} を改名`}
                      iconOnly
                    >
                      改名
                    </ActionButton>
                    {proj.archived ? (
                      <ActionButton
                        icon={<ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestore(proj);
                        }}
                        disabled={updating}
                        ariaLabel={`${proj.name} を復元`}
                        iconOnly
                      >
                        復元
                      </ActionButton>
                    ) : (
                      <ActionButton
                        icon={<Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(proj);
                        }}
                        disabled={updating}
                        ariaLabel={`${proj.name} をアーカイブ`}
                        iconOnly
                      >
                        アーカイブ
                      </ActionButton>
                    )}
                    <ActionButton
                      icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(proj);
                      }}
                      disabled={updating}
                      ariaLabel={`${proj.name} を削除`}
                      iconOnly
                    >
                      削除
                    </ActionButton>
                  </span>
                </td>
              </tr>
            );
          })}
          {/* 空状態は「〜がありません」のラベルで示し、アプリ共通の既定に揃える（v2-168）。 */}
          {projects.length === 0 && (
            <tr>
              <td
                colSpan={2}
                className="text-[var(--sp-text-warm-mute)]"
                style={{ textAlign: 'center', padding: '1.25rem' }}
              >
                {searching ? 'プロジェクトが見つかりませんでした' : 'プロジェクトがありません'}
                {searching && !includeArchived && (
                  <span style={{ display: 'block', marginTop: '0.25rem' }}>
                    アーカイブ済みは表示していません
                  </span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableCard>
  );
}
