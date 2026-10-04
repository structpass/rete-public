'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/features/shell';
import { MODEL_THEMES } from '../content';
import { buildManifest, findTheme } from '../lib/manifest';
import { ModelSidebar } from './model-sidebar';
import { ThemeContent } from './theme-content';

/**
 * モデルタブ本体（① サイドバー差し替え + 本文の2ペイン合成）。
 * 正本配列 MODEL_THEMES をカテゴリ別グルーピングしてサイドバー描画し、選択テーマの本文を出す。
 * 初期選択は URL ハッシュ（#<themeId>）→ 無効なら先頭テーマ。選択時にハッシュを更新して deep-link 可能にする。
 */
export function ModelView() {
  const groups = useMemo(() => buildManifest(MODEL_THEMES), []);
  const firstId = groups[0]?.themes[0]?.id ?? null;
  // 初期値は SSR/初回ペイントと一致させるため先頭テーマ固定（/model は静的プリレンダ）。
  // deep-link（#themeId）は effect でマウント後に反映するため、直接アクセス時は先頭→対象へ一瞬切替わる。
  const [selectedId, setSelectedId] = useState<string | null>(firstId);

  // URL ハッシュ（#themeId）を選択へ反映する。マウント時の取り込みに加え、
  // hashchange（手動ハッシュ変更 / アンカー遷移）にも追従して「戻る」等で選択がズレないようにする。
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (findTheme(MODEL_THEMES, hash)) setSelectedId(hash);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const selected = findTheme(MODEL_THEMES, selectedId) ?? groups[0]?.themes[0] ?? null;

  // mdl-0053: テーマを選び直したら本文を必ず先頭から見せる。
  // モデルタブは本文だけを差し替える2ペイン構成で、スクロール枠（下の div）は残り続けるため
  // ブラウザが前テーマのスクロール位置を保持する。次のテーマが短いと、その位置が既に最下部に
  // あたるので「下端まで送られた状態で開く」ように見える（テーマ固有ではなく切替全般の症状）。
  // 描画前に戻すため useLayoutEffect（useEffect だと途中位置が一瞬見えてから跳ねる）。
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollBodyToTop = () => {
    if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0;
  };
  useLayoutEffect(scrollBodyToTop, [selected?.id]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    window.history.replaceState(null, '', `#${id}`);
    // 同一テーマの再クリックは selected.id が動かず上の layout effect が走らないため、ここでも戻す
    // （「選んだら先頭から」を選択の種類で揺らさない）。
    scrollBodyToTop();
  };

  return (
    <AppShell
      activeTab="model"
      sidebar={
        <ModelSidebar groups={groups} selectedId={selected?.id ?? null} onSelect={handleSelect} />
      }
    >
      {/* 高さ連鎖: app-shell → app-main → sp-page(flex,min-h:0,overflow-hidden) → 内側 div がスクロール
          （desk / files と同じ構成。main 直に overflow を当てると連鎖が崩れるため内側でスクロールする）。 */}
      {/* model-shell: mdl-0053 で追加した viewport 固定の目印（globals.css の
          body:has(.model-shell) .app-shell）。これが無いと下の div がスクローラにならない。 */}
      <main className="model-shell sp-page flex flex-col overflow-hidden">
        <div
          ref={bodyScrollRef}
          data-testid="model-body-scroll"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {selected ? (
            <ThemeContent theme={selected} />
          ) : (
            <p className="text-sm text-[var(--sp-text-warm-mute)]">
              仕様がまだ登録されていません。
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
