import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { createCodeBlockRangeCommand } from '../codeblock-range';

/**
 * rete-desk-0069: 複数段落を選択してコードブロックを設定した時、段落ごとに別ブロックが出来ず、
 * 改行で結合した 1 つの <pre> になることを検証する（範囲指定で 1 ブロック）。
 */
function makeEditor(html: string): Editor {
  return new Editor({ extensions: [StarterKit], content: html });
}

function selectAll(editor: Editor): void {
  editor.commands.selectAll();
}

describe('createCodeBlockRangeCommand', () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('複数段落の選択を改行で結合した単一の codeBlock にする', () => {
    editor = makeEditor('<p>line1</p><p>line2</p><p>line3</p>');
    selectAll(editor);
    editor.chain().command(createCodeBlockRangeCommand()).run();

    const html = editor.getHTML();
    expect((html.match(/<pre>/g) ?? []).length).toBe(1);
    expect(editor.state.doc.textContent).toBe('line1\nline2\nline3');
  });

  it('単一段落の選択でも 1 つの codeBlock になる', () => {
    editor = makeEditor('<p>only</p>');
    selectAll(editor);
    editor.chain().command(createCodeBlockRangeCommand()).run();

    const html = editor.getHTML();
    expect((html.match(/<pre>/g) ?? []).length).toBe(1);
    expect(editor.state.doc.textContent).toBe('only');
  });

  it('空段落でも throw せず空の codeBlock を作る（schema.text("") 回避分岐）', () => {
    editor = makeEditor('<p></p>');
    selectAll(editor);
    expect(() => editor!.chain().command(createCodeBlockRangeCommand()).run()).not.toThrow();

    const html = editor.getHTML();
    expect((html.match(/<pre>/g) ?? []).length).toBe(1);
    expect(editor.state.doc.textContent).toBe('');
  });
});
