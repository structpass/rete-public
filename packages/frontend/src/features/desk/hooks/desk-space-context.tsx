'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

/**
 * Desk の「現在開いている器（Space）」を保持する Context（CM-2 / ADR 0037・スライスB）。
 *
 * app/desk/page.tsx は server component で <DeskSidebar/>（書き手）と <DeskShell/>（読み手）が兄弟のため
 * 共通 state 親が無い。selectedSpaceId をこの Context に集約し、両者を Provider 配下に入れる（論点1）。
 * selectedSpaceId は use-desk-view-state の A1 状態機械（左右ペインのビュー差し替え）と完全に直交した別状態。
 *
 * 初期値は null（未選択 = 全件 = 安全な中断点）。?spaceId= deep-link（desk★）があればそれを優先初期値にする。
 * localStorage 永続化はするが SSR 安全のため初回描画は initial のまま（復元はマウント後）＝hydration mismatch 回避。
 *
 * Provider 不在でも throw せず { null, no-op } を返す（DeskShell を単体テストで描画できるようにする＝
 * 未選択＝全件＝安全な中断点と一致するため、配線漏れがあっても致命的に壊れない）。
 */
interface DeskSpaceContextValue {
  /** 現在開いている器の id（null = 未選択 = 全件）。 */
  selectedSpaceId: string | null;
  /** 器を選択 / 解除する（null で全件に戻す）。 */
  setSelectedSpaceId: (spaceId: string | null) => void;
  /**
   * localStorage / deep-link からの復元が解決済みか（rete-desk-0174・ちらつき対策）。
   * false の間は既定スコープ（全件）でチャット明細 / タスク明細を描かないよう呼び出し側がゲートし、
   * 「全件 → 最後に開いていた器」の 2 段描画フラッシュを防ぐ。Provider 不在時は true（ゲートしない）。
   */
  hydrated: boolean;
}

const FALLBACK: DeskSpaceContextValue = {
  selectedSpaceId: null,
  setSelectedSpaceId: () => {},
  hydrated: true,
};

const DeskSpaceContext = createContext<DeskSpaceContextValue | null>(null);

export const DESK_SPACE_STORAGE_KEY = 'desk-selected-space-v1';

// spaceId は UUID 形式に限定する。?spaceId= deep-link / localStorage 復元は外部入力（改ざん・誤誘導）
// を受け得るため、不正値は null（全件）にフォールバックして API/URL へ生で流さない。HTML 描画はされない
// ので XSS ではないが、不正値が永続化されると以後の一覧 API が 400/403 を返し続ける UX 破壊を防ぐ。
const SPACE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function asValidSpaceId(value: unknown): string | null {
  return typeof value === 'string' && SPACE_ID_RE.test(value) ? value : null;
}

export function DeskSpaceProvider({
  children,
  initialSpaceId = null,
}: {
  children: ReactNode;
  /** ?spaceId= deep-link 由来の初期選択（desk★ から復帰時。localStorage より優先）。 */
  initialSpaceId?: string | null;
}) {
  // 初期値も UUID 検証する（deep-link の不正値で描画開始しない）。
  const [selectedSpaceId, setSelected] = useState<string | null>(() =>
    asValidSpaceId(initialSpaceId),
  );
  const [hydrated, setHydrated] = useState(false);

  // マウント後に復元（初回描画は initial のまま → サーバ/クライアント一致）。
  // deep-link（initialSpaceId）が正しい UUID の時は localStorage 復元より優先する（明示遷移を尊重）。
  // hom-0116: 有効 deep-link が「後から」届いた場合も必ず setSelected する。
  // （以前は early return だけで、先に localStorage 復元済みの選択が残る抜けがあった。）
  useEffect(() => {
    const deep = asValidSpaceId(initialSpaceId);
    if (deep) {
      setSelected(deep);
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(DESK_SPACE_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const valid = asValidSpaceId(parsed);
        if (valid) setSelected(valid);
      }
    } catch {
      // プライベートモード / JSON 破損は無視し未選択（全件）のまま。
    }
    setHydrated(true);
  }, [initialSpaceId]);

  // 復元完了後の変更のみ永続化（マウント直後の初期値 write で保存値を潰さない）。
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (selectedSpaceId) {
        window.localStorage.setItem(DESK_SPACE_STORAGE_KEY, JSON.stringify(selectedSpaceId));
      } else {
        window.localStorage.removeItem(DESK_SPACE_STORAGE_KEY);
      }
    } catch {
      // 容量超過 / 書込み不可は無視（永続化はベストエフォート）。
    }
  }, [selectedSpaceId, hydrated]);

  const setSelectedSpaceId = useCallback((spaceId: string | null) => setSelected(spaceId), []);

  return (
    <DeskSpaceContext.Provider value={{ selectedSpaceId, setSelectedSpaceId, hydrated }}>
      {children}
    </DeskSpaceContext.Provider>
  );
}

/** 現在の器スコープを読む / 変更する。Provider 不在時は { null, no-op }（全件・安全な中断点）。 */
export function useDeskSpace(): DeskSpaceContextValue {
  return useContext(DeskSpaceContext) ?? FALLBACK;
}
