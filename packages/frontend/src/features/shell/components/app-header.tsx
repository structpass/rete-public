'use client';

import { LogOut, User } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BADGE_PALETTE } from '@/features/settings/lib/sample/tenant-settings';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { useTenantInfoContext } from '../hooks/tenant-info-context';
import type { ResolvedTab } from '../lib/nav-config';

interface AppHeaderProps {
  tabs: ResolvedTab[];
  userName: string;
  onSelectTab: (tab: ResolvedTab) => void;
  onLogout: () => void;
}

/**
 * 共通シェルの上部ヘッダ。
 * 左: テナント名バッジ（set-0105 / ST-1-4。set-0118 で「開発環境」バッジは撤去）/ 中央: タブナビ / 右: ユーザー + ログアウト。
 * 未実装タブは灰色 + クリック不可（disabled）。
 *
 * タブナビは「マグネティック・ピル」（brd-0190）: 白ピル（.nav-pill）は選択中タブに被せたまま、
 * ホバーには別要素の薄グレー帯（.nav-hoverband）をスライドさせる（開発統括指示 2026-07-18・
 * 掲示板 hover 帯の逆輸入。旧: 単一ピルが hover 先へも追従）。per-tab の個別背景/枠線は持たない。
 * 位置は各タブ button（.tab-link・data-idx）の offsetLeft/offsetWidth を測って inline style へ
 * 反映する（transform ではなく layout box を測るため、後述のホバー拡大と干渉しない）。
 *
 * 位置は left/top ではなく transform: translate3d(x, y, 0) で駆動する。縦は CSS の
 * top:50%+translateY(-50%) に頼らず、対象タブの offsetTop を測って y に載せる
 * （帯内で上下余白が非対称になる実測ズレを構造的に防ぐ）。水平アンカーは left:0。
 *
 * 「動きが滑らかでない」の真因は描画コスト（jank）でもモーション設計でもなく、OS の
 * 「アニメーション効果=オフ」で prefers-reduced-motion が立ち、CSS 側が transition を
 * none にしてピルを瞬間移動させていたことだった（hom-0114 で確定）。イージング/duration の
 * 正本は globals.css の --sp-nav-motion-* トークンで、ピルとラベル拡大が同じ値を共有する。
 * ここ（JS）は目標値の計測だけを担い、動きの質には関与しない。
 *
 * ホバー拡大（レンズ効果）は button 自身ではなく内側の .tab-link-label にだけ transform を
 * 掛ける。button 自身（data-tab 属性を持つ実体）を非拡大のまま安定させることで、
 * desk-filter-toolbar の `.tab-link[data-tab="home"]` + getBoundingClientRect による
 * キーワード欄位置合わせ（rete-desk-0043）が拡大時の見た目サイズに引きずられて
 * ズレる回帰を避けている。
 *
 * ピル追従はマウスホバーだけでなくキーボードフォーカスでも起きる（rete-top-0002）。
 * onBlur は relatedTarget が nav 内なら hoverIdx を落とさない（タブ間の focus 移動中に
 * 選択中タブへピルが跳ねるのを防ぐ）。
 *
 * レイアウト変化への追従（cmn-0103）: テナント名バッジの async 後着などでヘッダ内の
 * タブ列がシフトすると、ピルはシフト前の計測値のまま残ってずれる。ResizeObserver で
 * nav と各タブを監視し、レイアウトが変わったら即再計測する。この種の「位置補正」は
 * アニメさせず瞬時に適用する（snap）— 補正が横からスライドして見える誤アニメを防ぐ。
 * hover / タブ切替由来のピル移動は従来どおり --sp-nav-motion-* でアニメする。
 */
export function AppHeader({ tabs, userName, onSelectTab, onLogout }: AppHeaderProps) {
  // dsk-0386: hover 帯（.nav-hoverband）の測位は共通 hook（useRowHoverBand・axis='horizontal'）へ
  // 集約。listRef を navRef としてそのまま流用（measurePill / ResizeObserver など既存の
  // navRef.current 参照は無改修で動く）。
  const {
    listRef: navRef,
    onMouseLeave: clearHoverBand,
    bandStyle: hoverBandStyle,
    measureRow: measureHoverBand,
  } = useRowHoverBand<HTMLElement>('.tab-link', 'horizontal');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0 });
  // 初回の位置決めが済むまでピルの transition を殺す。AppShell は各 page が持つため
  // タブ遷移のたび AppHeader ごと再マウントされ、ピルは left:0/width:0 で一度描かれる。
  // そのまま計測値へ更新すると transition が発火し「左からスライドしてくる」ように見える。
  const [settled, setSettled] = useState(false);
  // レイアウト変化起因の位置補正中は transition を殺す（cmn-0103）。補正をアニメさせると
  // 「クリック直後に横からスライドしてくる」誤アニメに見える。
  const [snapping, setSnapping] = useState(false);
  // setPill と同値の最新計測値ミラー。snap 判定（変化があった時だけ再レンダー）に使う。
  const pillRef = useRef(pill);

  const activeIdx = tabs.findIndex((tab) => tab.active);
  // 開発統括指示 2026-07-18: 白ピルはアクティブタブへ被せたまま動かさない（旧: hover 先へも追従）。
  // hover の表現は別要素の薄グレー帯（.nav-hoverband・下記 band）が担う。
  const targetIdx = activeIdx >= 0 ? activeIdx : 0;

  // hover 帯（.nav-hoverband）の測位。Home 明細の hover 帯（.home-row-hoverband）と同型＝
  // hover 中のタブを測って単一要素をスライドさせる。nav の外から入った最初の 1 回は
  // その場に即時表示し（transition none）、以降のタブ間移動でスライドする。
  // dsk-0386: 測位そのものは hook（measureHoverBand/clearHoverBand）に委譲。ここでは
  // hoverIdx（フォーカス/マウス両対応の選択インデックス）から対象 button を引いて渡すだけ。
  useLayoutEffect(() => {
    if (hoverIdx === null) {
      clearHoverBand();
      return;
    }
    const el = navRef.current?.querySelector<HTMLElement>(`[data-idx="${hoverIdx}"]`);
    if (!el) return;
    measureHoverBand(el);
  }, [hoverIdx, clearHoverBand, measureHoverBand, navRef]);

  const measurePill = useCallback(
    (opts?: { snap?: boolean }) => {
      const nav = navRef.current;
      const el = nav?.querySelector<HTMLElement>(`[data-idx="${targetIdx}"]`);
      if (!el) return;
      const left = el.offsetLeft;
      const top = el.offsetTop;
      const width = el.offsetWidth;
      if (
        pillRef.current.left === left &&
        pillRef.current.top === top &&
        pillRef.current.width === width
      ) {
        return;
      }
      pillRef.current = { left, top, width };
      if (opts?.snap) setSnapping(true);
      setPill({ left, top, width });
    },
    [targetIdx, navRef],
  );

  const measurePillRef = useRef(measurePill);
  useLayoutEffect(() => {
    measurePillRef.current = measurePill;
  });

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill]);

  // 計測後の最初のフレームで transition を復帰させる。rAF はペイント前に走るので、
  // 「正しい位置で 1 度描いてから」アニメーションを有効化できる。
  // width が 0 のまま（タブが 1 つも measurable でない）なら settled は立たないままでよい。
  // アニメーションが出ないだけで壊れないので、リトライは要らない。
  useEffect(() => {
    if (settled || pill.width === 0) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [settled, pill.width]);

  // snap 適用後、正しい位置で 1 度描いた次のフレームで transition を復帰させる
  // （nav-pill-init と同型・cmn-0103）。
  useEffect(() => {
    if (!snapping) return;
    const id = requestAnimationFrame(() => setSnapping(false));
    return () => cancelAnimationFrame(id);
  }, [snapping]);

  // 静的購読はマウント時 1 回だけ張る。最新の measurePill は ref 経由で呼ぶ。
  // レイアウト変化起因の再計測は snap（transition 抑止）で適用する（cmn-0103）。
  useLayoutEffect(() => {
    const remeasure = () => measurePillRef.current({ snap: true });
    window.addEventListener('resize', remeasure);
    document.fonts?.ready?.then(remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);

  // cmn-0103: テナントバッジ後着などヘッダ内レイアウトシフトへの追従。nav と各タブを
  // ResizeObserver で監視し、サイズが変わったら即座に snap 再計測する。発生源を問わず
  // 効く（バッジ後着・スクロールバー出現/消滅・フォント差し替え等）。tabs 変化時は
  // タブ DOM が入れ替わりうるため張り直す。jsdom には ResizeObserver が無いので guard。
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => measurePillRef.current({ snap: true }));
    observer.observe(nav);
    nav.querySelectorAll<HTMLElement>('.tab-link').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tabs, navRef]);

  // フォーカス移動が nav 内の別タブへ抜ける時は、その onFocus が次の対象を立てるので
  // ここで null に戻さない（戻すと選択中タブへ一瞬ピルが跳ねる）。
  const handleTabBlur = useCallback(
    (event: FocusEvent<HTMLButtonElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && navRef.current?.contains(next)) return;
      setHoverIdx(null);
    },
    [navRef],
  );

  const { tenantInfo } = useTenantInfoContext();
  const tenantPalette = tenantInfo ? BADGE_PALETTE[tenantInfo.badgeColor] : null;

  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        borderBottomColor: 'hsl(var(--border))',
        // cmn-0114: メニュー行全体を薄いグレー帯にする（1行構成は不変・行の背景だけ帯化）。
        // set-0138: --sp-nav-band-bg は linear-gradient。background-color では効かないため image 側へ。
        // 微アルファを残し、sticky 下をスクロールする内容の透け（backdrop blur）は従来どおり。
        backgroundColor: 'transparent',
        backgroundImage: 'var(--sp-nav-band-bg)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* 高さは --header-h を消費しトークンと実装を一致させる（hom-0119）。値の変遷は globals.css の
          --header-h コメント参照（hom-0114 で 44px → cmn-0114 追補 2026-07-13 で 3割減の 30px）。
          横方向の padding は desk-filter-toolbar の home タブ左端実測（rete-desk-0043）に効くため変えない。
          cmn-0119: 行を grid（1fr auto 1fr）にしてタブ列を左右ブロック幅に依存しない真中央固定へ。
          flex-1 + justify-center だとテナントバッジ / ユーザー名の幅でタブ位置が動き、reference との
          システム跨ぎ遷移で「メニューがズレて見える・着地後にピルが横滑りする」原因になっていた。 */}
      {/* items-stretch + min-h-0: 行高(--header-h=30px) にセルを拘束する。
          既定の min-height:auto だと右の sp-compact ボタン(32px)が行を押し広げ、
          ナビが 32px 化してタブ/ピルが帯内で上3px/下1px の非対称になる。 */}
      <div className="grid h-[var(--header-h)] min-h-0 grid-cols-[1fr_auto_1fr] items-stretch gap-4 px-3 md:px-6">
        <div className="flex min-h-0 items-center gap-2 shrink-0 justify-self-start">
          {/* set-0105: テナント名バッジ。badgeColor=none は色帯なしの簡素表示。
              set-0118: 「開発環境」バッジは撤去（テナント名で環境が分かるため重複表示を解消） */}
          {tenantInfo?.name ? (
            <div
              className="text-[0.6875rem] font-semibold rounded-full px-2 py-0.5 max-w-[12rem] truncate"
              aria-label={`テナント ${tenantInfo.name}`}
              style={
                tenantInfo.badgeColor === 'none'
                  ? {
                      color: 'var(--sp-text-warm-mute)',
                      border: '1px solid var(--sp-line-warm-2)',
                      background: 'transparent',
                    }
                  : {
                      color: tenantPalette?.fg,
                      background: tenantPalette?.bg,
                      border: `1px solid ${tenantPalette?.border}`,
                    }
              }
            >
              {tenantInfo.name}
            </div>
          ) : null}
        </div>

        {/* hom-0064: viewport の 50% に幅を制限する絶対中央配置(left-1/2)は8タブが収まらず折り返す
            原因だったため廃止。cmn-0119: 行 grid（1fr auto 1fr）の中央セルとして真中央固定
            （幅制限なし・折り返しなし＝hom-0064 の轍は踏まない）。
            cmn-0114: 全タブ等間隔。gap は globals.css の .nav-tabs（--sp-nav-tab-gap）が単一ソース
            （Tailwind gap-* を書くとセパレータ ::before の left と手動同期になるため書かない）。
            タブ間の縦線セパレータは `.tab-link + .tab-link::before`（絶対配置疑似要素）が gap 中央に
            描く＝レイアウト・offsetLeft/offsetWidth 計測（ピル追従・rete-desk-0043）へは一切影響しない。 */}
        <nav
          ref={navRef}
          className="nav-tabs flex h-full min-h-0 items-center justify-center"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* hover 帯はピルの直前（＝下層）に描く。アクティブタブ上では白ピルに覆われて見えない。 */}
          {hoverBandStyle ? (
            <div aria-hidden="true" className="nav-hoverband" style={hoverBandStyle} />
          ) : null}
          <div
            className={cn('nav-pill', (!settled || snapping) && 'nav-pill-init')}
            aria-hidden="true"
            style={{
              transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
              width: pill.width,
            }}
          />
          {tabs.map((tab, idx) => {
            const lensed = hoverIdx === null ? tab.active : hoverIdx === idx;
            return (
              <button
                key={tab.key}
                type="button"
                data-tab={tab.key}
                data-idx={idx}
                className={cn(
                  'tab-link',
                  tab.active && 'tab-active',
                  lensed && 'tab-lensed',
                  tab.disabled && 'disabled',
                )}
                disabled={tab.disabled}
                aria-disabled={tab.disabled}
                aria-current={tab.active ? 'page' : undefined}
                title={tab.disabled ? '準備中' : undefined}
                onMouseEnter={() => !tab.disabled && setHoverIdx(idx)}
                onFocus={() => !tab.disabled && setHoverIdx(idx)}
                onBlur={handleTabBlur}
                onClick={() => !tab.disabled && onSelectTab(tab)}
              >
                {/* ゴースト（高さ0・不可視・太字）が太字時の幅を常時予約する。アクティブ化の
                    font-weight 500→700 でラベル幅が変わりタブ列が微シフトするのを防ぐ（mdl-0038）。 */}
                <span className="tab-link-label">
                  {tab.label}
                  <span className="tab-link-bold-ghost" aria-hidden="true">
                    {tab.label}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 shrink-0 items-center gap-2 justify-self-end">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground/80">
            <User className="h-3.5 w-3.5" />
            <span>{userName}</span>
          </span>
          {/* sp-action は通常 neutral・hover ink へ統一済（hom-0058）。常時赤を打ち消す色上書きハックは不要化して除去。
              高さは帯(--header-h=30px)に収める。sp-compact(32px)のままだと min-height:auto 経由で
              行を押し広げピル縦位置が帯中央からずれる。 */}
          <Button
            variant="sp-action"
            size="sp-compact"
            className="!h-[1.625rem] !min-h-0"
            onClick={onLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>ログアウト</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
