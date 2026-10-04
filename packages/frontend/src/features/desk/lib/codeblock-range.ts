import { type CommandProps } from '@tiptap/react';

/**
 * 複数行（複数 textblock）選択へのコードブロック設定を「範囲で 1 ブロック」にするコマンド（rete-desk-0069）。
 *
 * Tiptap 標準の `toggleCodeBlock` は textblock 単位で動くため、複数段落を選択して適用すると
 * 段落ごとに別々の `<pre>` が生成される。本コマンドは選択範囲に含まれる各 textblock のテキストを
 * 改行で連結し、範囲全体を 1 つの codeBlock へ置換する（コードブロック内では改行がそのまま保持される）。
 *
 * 既に codeBlock 内にいる場合（トグル解除）は対象外で、呼び出し側が `toggleCodeBlock` に委ねる。
 * `editor.chain().command(createCodeBlockRangeCommand())` 経由で実行する（indent 拡張と同方針＝
 * Commands interface への module augmentation を避ける）。
 */
export const createCodeBlockRangeCommand =
  () =>
  ({ state, tr, dispatch }: CommandProps): boolean => {
    const codeBlockType = state.schema.nodes.codeBlock;
    if (!codeBlockType) return false;

    const { from, to } = state.selection;
    const lines: string[] = [];
    let rangeStart: number | null = null;
    let rangeEnd = to;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) {
        if (rangeStart === null) rangeStart = pos;
        rangeEnd = pos + node.nodeSize;
        lines.push(node.textContent);
        return false; // textblock の中（インライン）へは降りない
      }
      return true;
    });
    if (rangeStart === null) return false;

    const text = lines.join('\n');
    // schema.text('') は空テキスト不可で throw するため、空のときは内容なしの codeBlock を作る。
    const node =
      text.length > 0
        ? codeBlockType.create(null, state.schema.text(text))
        : codeBlockType.create(null);

    if (dispatch) {
      tr.replaceRangeWith(rangeStart, rangeEnd, node);
      dispatch(tr);
    }
    return true;
  };
