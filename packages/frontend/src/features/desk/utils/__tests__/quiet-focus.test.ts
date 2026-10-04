import { describe, it, expect, afterEach, vi } from 'vitest';
import { applyQuietFocus } from '../quiet-focus';

/**
 * dsk-0398: applyQuietFocus の単体テスト（dsk-0390/0391 で入った teal 枠抑止の目印属性）。
 *
 * 破棄確認ダイアログ往復では目印を落とさない例外（code-reviewer HIGH 指摘で入った分岐）は、
 * これまで desk-shell の統合テスト経由でしか踏まれていなかった。画面側の都合でそのテストが
 * 書き換わると保護が黙って消えるため、部品単体でも固定する（統合側は層が違うので残す）。
 */
describe('applyQuietFocus (dsk-0390/0391)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** 行 + フォーカス移動先を持つ最小 DOM を組む。 */
  function setup() {
    document.body.innerHTML = `
      <div id="row" tabindex="-1"><button id="inner">inner</button></div>
      <div id="outside" tabindex="-1">outside</div>
      <div role="alertdialog"><button id="dialog-btn">破棄する</button></div>
    `;
    return {
      row: document.getElementById('row') as HTMLElement,
      outside: document.getElementById('outside') as HTMLElement,
      dialogBtn: document.getElementById('dialog-btn') as HTMLElement,
    };
  }

  /** focusout（bubbles）を relatedTarget 付きで発火する。 */
  function fireFocusOut(from: HTMLElement, relatedTarget: HTMLElement | null) {
    from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
  }

  it('目印を持つ行への再適用は何もしない（二重適用の早期 return）', () => {
    const { row } = setup();
    applyQuietFocus(row);
    expect(row.hasAttribute('data-quiet-focus')).toBe(true);

    // 2 回目は listener を重ねない。属性の有無だけでは差が出ない（重複 listener はどちらも
    // 属性を消すため）ので、購読そのものが増えないことを見る。
    const addSpy = vi.spyOn(row, 'addEventListener');
    applyQuietFocus(row);
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('row が null なら何も起きない（呼び出し側の存在確認を肩代わりする）', () => {
    expect(() => applyQuietFocus(null)).not.toThrow();
  });

  it('通常の focusout で目印が消え、以後の focusout では再適用されない（listener 除去済み）', () => {
    const { row, outside } = setup();
    applyQuietFocus(row);

    fireFocusOut(row, outside);
    expect(row.hasAttribute('data-quiet-focus')).toBe(false);

    // listener が残っていると、外から目印を戻した後の focusout で再び消える。
    row.setAttribute('data-quiet-focus', '');
    fireFocusOut(row, outside);
    expect(row.hasAttribute('data-quiet-focus')).toBe(true);
  });

  it('relatedTarget が alertdialog 内なら目印を維持する（ダイアログ往復で teal 枠を再発させない）', () => {
    const { row, dialogBtn } = setup();
    applyQuietFocus(row);

    fireFocusOut(row, dialogBtn);
    expect(row.hasAttribute('data-quiet-focus')).toBe(true);
  });

  it('ダイアログ往復の後に実際に行を離れた時は目印を除去する（維持は往復中だけ）', () => {
    const { row, dialogBtn, outside } = setup();
    applyQuietFocus(row);

    fireFocusOut(row, dialogBtn);
    expect(row.hasAttribute('data-quiet-focus')).toBe(true);

    fireFocusOut(row, outside);
    expect(row.hasAttribute('data-quiet-focus')).toBe(false);
  });

  it('行内要素からバブルした focusout も拾う（focusout を使う理由）', () => {
    const { row, outside } = setup();
    const inner = document.getElementById('inner') as HTMLElement;
    applyQuietFocus(row);

    fireFocusOut(inner, outside);
    expect(row.hasAttribute('data-quiet-focus')).toBe(false);
  });
});
