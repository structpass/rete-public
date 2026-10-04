'use client';

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Mention } from '@tiptap/extension-mention';
import { DeskIndent } from './desk-indent-extension';
import { RteToolbar } from './desk-rte-toolbar';
import { createMentionSuggestion, type MentionItem } from './mention-suggestion';
import { getClientCspNonce } from '@/lib/csp-nonce';

interface RichTextEditorProps {
  /** 現在値（HTML 文字列）。plain text も可（Tiptap が段落へラップ）。 */
  value: string;
  /** 変更時に HTML 文字列を返す（getHTML）。RHF Controller の field.onChange に接続する。 */
  onChange: (html: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  /** 本文領域の最小行数相当（CSS 変数 --desk-rte-min-rows）。既定 6。 */
  minRows?: number;
  /** Ctrl/Cmd+Enter 押下時に呼ぶ（返信欄の送信ショートカット。未指定なら既定改行挙動）。 */
  onSubmitShortcut?: () => void;
  /** true で編集不可（保存処理中・未ロード時など）。Tiptap の editable をトグルする。既定 false。 */
  disabled?: boolean;
  /**
   * @ メンション候補を有効化する（返信欄のみ true / rete-desk-0080）。未指定は無効。
   * useEditor 初期化時のみ評価されるため、マウント後の true⇔false 変更は反映されない（呼び出し側は静的に渡す）。
   */
  enableMention?: boolean;
  /** メンション候補（id=accountId / label=表示名）。enableMention 時に参照。最新値は ref 経由で読む。 */
  mentionItems?: MentionItem[];
}

/**
 * 共有リッチテキストエディタ（Tiptap v3 / ADR 0019）。
 * モックの書式ツールバー（desk-rte-toolbar）を実書式適用へ配線したエディタ本体。本文は HTML として
 * 保持し、保存形式も HTML（描画は RichTextView が sanitize）。全 surface（タスク説明 → Phase 2 チャット）
 * がこの 1 コンポーネントを共有する（architecture-invariants §3 / §6）。
 *
 * Next.js App Router 対応のため `immediatelyRender: false`（SSR ハイドレーション不整合の回避）。
 */
export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  minRows = 6,
  onSubmitShortcut,
  disabled = false,
  enableMention = false,
  mentionItems,
}: RichTextEditorProps) {
  // onUpdate / handleKeyDown は useEditor 初回のクロージャに固定されるため、最新のコールバックを
  // ref 経由で参照する（親が再生成しても stale にならない）。
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSubmitRef = useRef(onSubmitShortcut);
  onSubmitRef.current = onSubmitShortcut;
  // メンション候補も suggestion クロージャに固定されるため ref で最新値を参照する。
  const mentionItemsRef = useRef(mentionItems);
  mentionItemsRef.current = mentionItems;

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    // cmn-0351: Tiptap が注入する base CSS の <style> へ CSP nonce を付ける（window.__nonce__ 経由）。
    injectNonce: getClientCspNonce(),
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      DeskIndent,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      // 返信欄のみ @ メンションを有効化（rete-desk-0080）。ノードは青ラベル（.desk-mention）で描く。
      ...(enableMention
        ? [
            Mention.configure({
              HTMLAttributes: { class: 'desk-mention' },
              suggestion: createMentionSuggestion(() => mentionItemsRef.current ?? []),
            }),
          ]
        : []),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'desk-rte-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel ?? '本文',
      },
      // Ctrl/Cmd+Enter を送信ショートカットへ。IME 変換確定中（isComposing）は無視し、改行を挿入させない。
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing) {
          if (onSubmitRef.current) {
            event.preventDefault();
            onSubmitRef.current();
            return true;
          }
        }
        return false;
      },
    },
    // 空エディタは `<p></p>` ではなく空文字を返す（説明未入力を null/undefined として扱えるよう正規化）。
    onUpdate: ({ editor }) => onChangeRef.current(editor.isEmpty ? '' : editor.getHTML()),
  });

  // 外部 value 変更（タスク切替・昇格プリフィル）をエディタへ反映。
  // 循環防止に現在 HTML と比較し、emitUpdate=false で onUpdate を発火させない。
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // disabled の変化を Tiptap の editable へ反映（保存処理中・未ロード時の入力抑止）。
  // 第2引数 emitUpdate=false 必須: v3 の setEditable は既定で update イベントを発火するため、
  // マウント直後にこの effect が走ると onChange へ「Tiptap が再シリアライズした HTML」が流れ、
  // 保存値が plain text やサニタイズ済 HTML のテーマで未編集なのに dirty 判定される（rete-desk-0134 の真因）。
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  return (
    <div className="desk-rte" style={{ ['--desk-rte-min-rows' as string]: String(minRows) }}>
      <RteToolbar editor={editor} />
      <div className="desk-rte-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
