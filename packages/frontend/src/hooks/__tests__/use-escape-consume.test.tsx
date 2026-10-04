import { describe, it, expect, vi, afterEach } from 'vitest';
import { StrictMode, useState } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { useEscapeConsume } from '../use-escape-consume';

function Probe({
  enabled = true,
  capture = false,
  guardSelector,
  onEscape,
}: {
  enabled?: boolean;
  capture?: boolean;
  guardSelector?: string;
  onEscape: () => void;
}) {
  useEscapeConsume(onEscape, { enabled, capture, guardSelector });
  return <div>probe</div>;
}

/** stopPropagation を検証できる素のイベントを dispatch する（fireEvent は合成のため spy を仕込む）。 */
function dispatchEscape(init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
    ...init,
  });
  const stopSpy = vi.spyOn(e, 'stopPropagation');
  document.dispatchEvent(e);
  return { e, stopSpy };
}

describe('useEscapeConsume (cmn-0106)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    // cmn-0113: guardSelector テストで挿入した alertdialog を片付ける
    document.querySelectorAll('[role="alertdialog"]').forEach((el) => el.remove());
  });

  it('Escape で stopPropagation → onEscape の順で消費される', () => {
    const order: string[] = [];
    const onEscape = vi.fn(() => order.push('onEscape'));
    render(<Probe onEscape={onEscape} />);
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    vi.spyOn(e, 'stopPropagation').mockImplementation(() => order.push('stop'));
    document.dispatchEvent(e);
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['stop', 'onEscape']);
  });

  it('window 段のリスナーへ届かない（desk-shell 一括クローズの遮断）', () => {
    const windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);
    const onEscape = vi.fn();
    render(<Probe onEscape={onEscape} />);
    // document.body から bubble させる（document 段の消費で window へ到達しないことを見る）
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(windowListener).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowListener);
  });

  it('capture=true で capture 段でも消費される（document target 直 dispatch でも bubble 段リスナーへ届かない）', () => {
    const bubbleListener = vi.fn();
    document.addEventListener('keydown', bubbleListener); // bubble 段
    const onEscape = vi.fn();
    render(<Probe capture onEscape={onEscape} />);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(bubbleListener).not.toHaveBeenCalled();
    document.removeEventListener('keydown', bubbleListener);
  });

  it('IME 変換確定の Esc（isComposing）は無視する', () => {
    const onEscape = vi.fn();
    render(<Probe onEscape={onEscape} />);
    const { stopSpy } = dispatchEscape({ isComposing: true });
    expect(onEscape).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('Escape 以外のキーは消費しない', () => {
    const onEscape = vi.fn();
    render(<Probe onEscape={onEscape} />);
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    const stopSpy = vi.spyOn(e, 'stopPropagation');
    document.dispatchEvent(e);
    expect(onEscape).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('enabled=false の間はリスナー未登録（発火も遮断もしない）', () => {
    const onEscape = vi.fn();
    render(<Probe enabled={false} onEscape={onEscape} />);
    const { stopSpy } = dispatchEscape();
    expect(onEscape).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('unmount でリスナーが解除される', () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Probe onEscape={onEscape} />);
    unmount();
    dispatchEscape();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('latest-ref: 親 state を変えても最後にレンダーされた callback が keydown で呼ばれ、remove→add churn はゼロ (cmn-0113)', () => {
    // 親が onEscape を毎レンダー差し替える典型（インライン arrow）でも、リスナーが remove→add
    // されずに最新 closure が keydown で呼ばれることを検証する。closure は毎レンダー別の tick を捕捉
    // するように設計し、5 回親 click 後の Escape で記録される tick が「最新 tick=5 のみ」となることで、
    // onEscapeRef が古い closure (tick=0..4) ではなく最新 closure (tick=5) を保持していることを保証する。
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const calls: number[] = [];
    function Host() {
      const [tick, setTick] = useState(0);
      // tick を closure に閉じ込める: 親再レンダーごとに別 closure（参照は毎回違う）になるが、
      // latest-ref パターンでは ref 経由で「最後にレンダーされた tick=5」が keydown で呼ばれる。
      return (
        <>
          <Probe onEscape={() => calls.push(tick)} />
          <button data-testid="bump" onClick={() => setTick((t) => t + 1)} />
        </>
      );
    }
    render(<Host />);
    // 親再レンダーを 5 回起こす（tick: 0 → 5）。act() でラップして state 更新を同期反映させる
    // （ラップしないと tick=0 のまま dispatch され、テストが誤検知する）。
    const btn = document.querySelector('[data-testid="bump"]') as HTMLButtonElement;
    act(() => {
      for (let i = 0; i < 5; i++) btn.click();
    });
    // keydown を 1 回発火 → 最新 closure (tick=5) のみ記録され、古い closure は一度も発火しない
    dispatchEscape();
    expect(calls).toEqual([5]);
    // 親再レンダーで keydown リスナーが remove→add されていない（churn ゼロ）
    const keydownRemoves = removeSpy.mock.calls.filter((c) => c[0] === 'keydown');
    expect(keydownRemoves).toHaveLength(0);
  });

  it('guardSelector マッチ時: onEscape も stopPropagation も呼ばれない (cmn-0113)', () => {
    const onEscape = vi.fn();
    render(
      <>
        <Probe onEscape={onEscape} guardSelector={'[role="alertdialog"]'} />
        <div role="alertdialog" data-testid="guard" />
      </>,
    );
    const { stopSpy } = dispatchEscape();
    expect(onEscape).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('guardSelector マッチしない時: 従来どおり onEscape が呼ばれる (cmn-0113)', () => {
    const onEscape = vi.fn();
    render(<Probe onEscape={onEscape} guardSelector={'[role="alertdialog"]'} />);
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('guardSelector 未指定時: マッチ判定はスキップされ従来どおり (cmn-0113)', () => {
    // 互換性: guardSelector を渡さない既存利用箇所（tag-master-overlay などの旧呼び出し）は
    // マッチ判定なしの従来挙動を維持する。alertdialog が DOM に存在しても onEscape は呼ばれる。
    const onEscape = vi.fn();
    render(
      <>
        <Probe onEscape={onEscape} />
        <div role="alertdialog" data-testid="legacy-guard" />
      </>,
    );
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

describe('useEscapeConsume スタック意味論 (cmn-0280)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.querySelectorAll('[role="alertdialog"]').forEach((el) => el.remove());
  });

  it('bubble×bubble: 後から enabled になった層だけが Escape を消費し、先の層は黙って return する', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = render(<Probe onEscape={a} />);
    // 後から B を有効化（B がスタック末尾になる）
    rerender(
      <>
        <Probe onEscape={a} />
        <Probe onEscape={b} />
      </>,
    );
    dispatchEscape();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('capture×bubble: スタック末尾が capture か bubble かに関わらず「最後に enabled になった層」だけが消費する', () => {
    // A は capture 段・B は bubble 段。B がスタック末尾なので B だけが消費する。
    // A は capture 段で先に走るが「自分が末尾でない」と判定して stopPropagation せず return する。
    const a = vi.fn();
    const b = vi.fn();
    const bubbleListener = vi.fn();
    const { rerender } = render(<Probe capture onEscape={a} />);
    document.addEventListener('keydown', bubbleListener); // bubble 段＝A が stop しないと到達する想定の確認用
    rerender(
      <>
        <Probe capture onEscape={a} />
        <Probe onEscape={b} />
      </>,
    );
    dispatchEscape();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    // A が stopPropagation していないので bubble 段の検証用リスナーに到達している（=A が黙って return した証拠）
    expect(bubbleListener).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', bubbleListener);
  });

  it('末尾の層が enabled=false になり離脱すると、次の Escape は残った層が消費する', () => {
    const a = vi.fn();
    const b = vi.fn();
    function Host() {
      const [bOpen, setBOpen] = useState(true);
      return (
        <>
          <Probe onEscape={a} />
          {bOpen && <Probe onEscape={b} />}
          <button data-testid="close-b" onClick={() => setBOpen(false)} />
        </>
      );
    }
    render(<Host />);
    // 1 回目: B が末尾なので B が消費
    dispatchEscape();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    // B を閉じる
    act(() => {
      (document.querySelector('[data-testid="close-b"]') as HTMLButtonElement).click();
    });
    // 2 回目: スタック末尾が A になるので A が消費
    dispatchEscape();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1); // 増えていない
  });

  it('スタック中段的離脱（後発層が先の中段層を押し出して残る形）でも splice が壊れない', () => {
    // 末尾 A / 中段 B / 末尾 C を作り、C を離脱 → A・B のみが残る（splice が中段を正しく拾えるか）
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    function Host() {
      const [cOpen, setCOpen] = useState(true);
      return (
        <>
          <Probe onEscape={a} />
          <Probe onEscape={b} />
          {cOpen && <Probe onEscape={c} />}
          <button data-testid="close-c" onClick={() => setCOpen(false)} />
        </>
      );
    }
    render(<Host />);
    dispatchEscape();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledTimes(1);
    // C を離脱
    act(() => {
      (document.querySelector('[data-testid="close-c"]') as HTMLButtonElement).click();
    });
    dispatchEscape();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('最上層の guardSelector がマッチした時、下層インスタンスは代行消費しない（現行意味論の維持）', () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <>
        <Probe onEscape={a} />
        {/* B がスタック末尾・guardSelector で alertdialog を指す。B はマッチして消費しない。 */}
        <Probe onEscape={b} guardSelector={'[role="alertdialog"]'} />
        <div role="alertdialog" data-testid="guard" />
      </>,
    );
    dispatchEscape();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('StrictMode の二重 mount/cleanup でもスタックに残骸が残らない（Escape が 1 回だけ消費される）', () => {
    // StrictMode では mount→cleanup→mount の順で effect が走る。最後の mount が正として残り、
    // 古いトークンは cleanup で splice される。Escape が onEscape を 1 回だけ呼ぶことで残骸なしを保証する。
    const onEscape = vi.fn();
    render(
      <StrictMode>
        <Probe onEscape={onEscape} />
      </StrictMode>,
    );
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
    // unmount 後の Escape は呼ばれない＝スタック空＋リスナー解除済み
    cleanup();
    dispatchEscape();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
