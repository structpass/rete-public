// ─────────────────────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────────────────────

export type DialogMode =
  | { kind: 'create-org' }
  | { kind: 'rename-org'; id: string; currentName: string }
  | { kind: 'create-project'; orgId: string }
  | { kind: 'rename-project'; id: string; currentName: string }
  | { kind: 'create-channel'; projectId: string }
  | { kind: 'rename-channel'; id: string; currentName: string };

/** 削除・アーカイブ対象（3 種のペインを 1 つの確認ダイアログで扱う・set-0162）。 */
export type DeleteTarget =
  | { action: 'archive' | 'delete'; kind: 'org'; id: string; name: string }
  | { action: 'archive' | 'delete'; kind: 'project'; id: string; name: string }
  | { action: 'archive' | 'delete'; kind: 'channel'; id: string; name: string };
