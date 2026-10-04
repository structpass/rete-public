'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ペイン共通ヘッダ（タイトルのみ・左寄せ単独行）
// ─────────────────────────────────────────────────────────────────────────────

export function PaneHeader({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <span className="text-[0.9375rem] font-semibold text-[var(--sp-text-warm)]">{title}</span>
    </div>
  );
}
