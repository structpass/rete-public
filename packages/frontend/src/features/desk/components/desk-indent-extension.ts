import { Extension, type CommandProps } from '@tiptap/react';
import {
  INDENT_NODE_TYPES,
  LIST_NODE_TYPES,
  clampIndent,
  indentRenderAttrs,
  levelFromClass,
} from '../lib/indent';

/**
 * 段落／見出しのインデント拡張（rete-desk-0063 / A案）。
 *
 * StarterKit の sink/liftListItem は「リスト項目内」専用で、通常段落のインデントは効かない。
 * 本拡張は paragraph / heading に `indent` 属性（0〜MAX）を持たせ、HTML へは
 * `class="desk-indent-N"` で出力する（`style` 直書きを避け既存 sanitize 許可属性 `class` で表現＝
 * `@rete/shared` 不変・XSS posture 不変）。インデント量の CSS は globals.css（.desk-indent-N）。
 *
 * コマンドは Commands interface への module augmentation（`@tiptap/core` 直接依存が必要）を避け、
 * core 標準の `editor.chain().command(createIndentCommand(±1))` 経由で実行する。
 */

/** インデントを delta 段ずらす生コマンド（`.command()` へ渡す）。リスト項目はツールバー側で別処理。 */
export const createIndentCommand =
  (delta: number) =>
  ({ tr, state, dispatch }: CommandProps): boolean => {
    const { from, to } = state.selection;
    let changed = false;
    state.doc.nodesBetween(from, to, (node, pos) => {
      // リスト内の段落はリスト側のインデント（sink/liftListItem）が主役。
      // list 系ノードに入ったら子孫を辿らず、混在選択での二重インデントを避ける。
      if (LIST_NODE_TYPES.includes(node.type.name)) return false;
      if ((INDENT_NODE_TYPES as readonly string[]).includes(node.type.name)) {
        const current = clampIndent(node.attrs.indent);
        const next = clampIndent(current + delta);
        if (next !== current) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          changed = true;
        }
      }
    });
    if (changed && dispatch) dispatch(tr);
    return changed;
  };

export const DeskIndent = Extension.create({
  name: 'deskIndent',

  addGlobalAttributes() {
    return [
      {
        types: [...INDENT_NODE_TYPES],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => levelFromClass(element.getAttribute('class')),
            renderHTML: (attributes) => indentRenderAttrs(attributes.indent),
          },
        },
      },
    ];
  },
});
