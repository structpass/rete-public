/**
 * dsk-0390/0391: オーバーレイをキーボード操作で閉じた直後の明細行 teal 枠残留の抑止。
 *
 * クリックで開いた行にはフォーカスが残っており、その後のキーボード操作（Esc / Space / Enter）が
 * 行を :focus-visible に昇格させ、閉じた後の行に teal 枠が残留表示される（hom-0128 と同型）。
 * ブラー方式は「閉じた直後に ↑↓ が一打効かない」副作用があるため、フォーカスは行に残したまま
 * 一回性の目印属性 data-quiet-focus で teal 枠だけ CSS 抑止する（hom-0126 の目印属性方式と同系・
 * globals.css `[data-quiet-focus]:focus-visible`）。
 *
 * 目印は行がフォーカスを失った時点で除去（focusout＝行内要素からのバブルも拾う）し、以後の
 * Tab 到達時は通常どおり枠が出る（アクセシビリティ維持）。
 * ただし ↑↓ 行移動（use-desk-keyboard-nav moveAndFollow）は目印を移動先へ引き継ぐ（dsk-0392）＝
 * 閉じ操作を起点とする一連の矢印移動では枠を出し続けない仕様。連鎖はネイティブ Tab・クリック・
 * 明細外への離脱で終了し、そこから先は通常の枠表示に戻る。
 * 例外: 破棄確認ダイアログへの focus 移動では除去しない（code-reviewer HIGH 指摘）。ダイアログは
 * クローズ時に Radix の既定 onCloseAutoFocus で行へフォーカスを戻すため、そこで目印を落とすと
 * 復帰した行に teal 枠が再発する。relatedTarget が alertdialog 内の focusout はダイアログ往復と
 * みなし目印を維持し、実際に行を離れた時だけ除去する。
 */
export function applyQuietFocus(row: HTMLElement | null): void {
  if (!row || row.hasAttribute('data-quiet-focus')) return;
  row.setAttribute('data-quiet-focus', '');
  const onFocusOut = (ev: FocusEvent) => {
    const rt = ev.relatedTarget as HTMLElement | null;
    if (rt?.closest('[role="alertdialog"]')) return; // ダイアログ往復中は維持
    row.removeAttribute('data-quiet-focus');
    row.removeEventListener('focusout', onFocusOut);
  };
  row.addEventListener('focusout', onFocusOut);
}
