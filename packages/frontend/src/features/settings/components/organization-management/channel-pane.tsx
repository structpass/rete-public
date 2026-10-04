'use client';
import { ActionButton, TableCard } from '@/features/settings/components/primitives';
import type { SpaceDto } from '@rete/shared';
import { Archive, ArchiveRestore, Hash, Pencil, Trash2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// チャネルペイン（右）
// ─────────────────────────────────────────────────────────────────────────────

export function ChannelPane({
  channels,
  updating,
  searching,
  includeArchived,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: {
  channels: SpaceDto[];
  updating: boolean;
  searching: boolean;
  includeArchived: boolean;
  onRename: (channel: SpaceDto) => void;
  onArchive: (channel: SpaceDto) => void;
  onRestore: (channel: SpaceDto) => void;
  onDelete: (channel: SpaceDto) => void;
}) {
  return (
    <TableCard hoverBand borderless>
      <table className="sp-table sp-table--hoverband sp-table--framed">
        <thead>
          <tr>
            <th>チャネル名</th>
            <th style={{ width: 96, textAlign: 'center' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <tr key={ch.id}>
              <td>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    color: ch.archived ? 'var(--sp-text-warm-mute)' : 'var(--sp-text-warm)',
                  }}
                >
                  <Hash
                    className="h-3.5 w-3.5 text-[var(--sp-text-warm-mute)]"
                    aria-hidden="true"
                  />
                  {ch.name}
                </span>
              </td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
                  {ch.archived ? (
                    <ActionButton
                      icon={<ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />}
                      onClick={() => onRestore(ch)}
                      disabled={updating}
                      ariaLabel={`${ch.name} を復元`}
                      iconOnly
                    >
                      復元
                    </ActionButton>
                  ) : (
                    <>
                      <ActionButton
                        icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() => onRename(ch)}
                        disabled={updating}
                        ariaLabel={`${ch.name} を改名`}
                        iconOnly
                      >
                        改名
                      </ActionButton>
                      <ActionButton
                        icon={<Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() => onArchive(ch)}
                        disabled={updating}
                        ariaLabel={`${ch.name} をアーカイブ`}
                        iconOnly
                      >
                        アーカイブ
                      </ActionButton>
                    </>
                  )}
                  <ActionButton
                    icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => onDelete(ch)}
                    disabled={updating}
                    ariaLabel={`${ch.name} を削除`}
                    iconOnly
                  >
                    削除
                  </ActionButton>
                </span>
              </td>
            </tr>
          ))}
          {/* 空状態は「〜がありません」のラベルで示し、アプリ共通の既定に揃える（v2-168）。 */}
          {channels.length === 0 && (
            <tr>
              <td
                colSpan={2}
                className="text-[var(--sp-text-warm-mute)]"
                style={{ textAlign: 'center', padding: '1.25rem' }}
              >
                {searching ? 'チャネルが見つかりませんでした' : 'チャネルがありません'}
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
