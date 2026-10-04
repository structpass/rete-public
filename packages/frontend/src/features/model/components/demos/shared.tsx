import type { ReactNode } from 'react';

/**
 * 見本内の1サンプルへ小さな説明ラベルを添える共通枠（mdl-0011）。
 * 各 demo ファイルで同じ「サンプル+ラベル」構造を都度書かないための helper。
 */
export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {children}
      <span className="text-[0.6875rem] text-[var(--sp-text-warm-mute)]">{label}</span>
    </div>
  );
}

/** 複数サンプルを横並び（折返しあり）に敷く共通レイアウト。 */
export function DemoRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-x-6 gap-y-4">{children}</div>;
}
