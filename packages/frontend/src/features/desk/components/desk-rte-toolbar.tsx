'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { type Editor } from '@tiptap/react';
import { RICH_TEXT_UNSAFE_URI_RE } from '@rete/shared';
import { decideLinkAction } from '../lib/link-action';
import { createCodeBlockRangeCommand } from '../lib/codeblock-range';
import { createIndentCommand } from './desk-indent-extension';
import {
  Smile,
  List,
  ListOrdered,
  Highlighter,
  Quote,
  Link as LinkIcon,
  Code,
  MoreHorizontal,
  ChevronDown,
  IndentIncrease,
  IndentDecrease,
  Minus,
  RemoveFormatting,
} from 'lucide-react';
import { useOutsideClose } from '@/hooks/use-outside-close';

/**
 * RTE/添付の非機能ボタン共通形。`aria-disabled` + `tabIndex={-1}` で「現状操作不可（見た目のみ）」
 * を a11y ツリーへ明示し、キーボードのタブ順からも外す。チャット側の未配線シェル（テーマ作成欄 /
 * 返信欄 / コメント欄）が引き続き使用する（Phase 2 で配線時に解除）。
 *
 * チャット明細のテーマ作成欄（theme-composer）とチャット詳細の返信欄（reply-composer）の双方で
 * 使うため共有化（architecture-invariants §3 コピペ禁止 / 2 箇所目の法則）。
 */
export function InertBtn({
  label,
  className = 'desk-rte-btn',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      aria-disabled="true"
      tabIndex={-1}
    >
      {children}
    </button>
  );
}

/** dropdown を持つ popper の識別子。一度に 1 つだけ開く。 */
type PopperKey = 'hilite' | 'fore' | 'size' | 'more' | 'link';

/** 色グリッドの 1 セル。 */
interface Swatch {
  color: string;
  title: string;
  clear?: boolean;
}

// 6 列グリッド（globals.css .desk-rte-color-grid）。11 色 + 解除 = 2 行ぴったり（rete-desk-0074）。
const HILITE_SWATCHES: Swatch[] = [
  { color: '#FEF08A', title: '黄' },
  { color: '#D9F99D', title: '黄緑' },
  { color: '#BBF7D0', title: '緑' },
  { color: '#99F6E4', title: '青緑' },
  { color: '#BAE6FD', title: '水' },
  { color: '#BFDBFE', title: '青' },
  { color: '#C7D2FE', title: '藍' },
  { color: '#DDD6FE', title: '紫' },
  { color: '#FBCFE8', title: '桃' },
  { color: '#FECACA', title: '赤' },
  { color: '#FED7AA', title: '橙' },
  { color: 'transparent', title: 'ハイライト解除', clear: true },
];

// 12 色 = 6 列 × 2 行（rete-desk-0074）。
const FORE_SWATCHES: Swatch[] = [
  { color: '#111827', title: '黒' },
  { color: '#6B7280', title: '灰' },
  { color: '#DC2626', title: '赤' },
  { color: '#EA580C', title: '橙' },
  { color: '#CA8A04', title: '黄土' },
  { color: '#16A34A', title: '緑' },
  { color: '#0D9488', title: '青緑' },
  { color: '#2563EB', title: '青' },
  { color: '#4338CA', title: '藍' },
  { color: '#7C3AED', title: '紫' },
  { color: '#DB2777', title: '桃' },
  { color: '#92400E', title: '茶' },
];

const SIZE_ITEMS = [
  { label: '小', value: '2' },
  { label: '標準', value: '3', selected: true },
  { label: '大', value: '5' },
  { label: '特大', value: '6' },
];

/** dropdown 共通: 外側 pointerdown（押した瞬間）/ Escape で閉じる。
 *  共有版（useDropdownPopover）との差＝複数キー（PopperKey）の多重管理。1 メニューだけを
 *  開く局所 state なら共有版へ寄せられるが、ツールバーは開いている dropdown を 1 つに
 *  保つ必要があるため多重キー state を残す（cmn-0354）。 */
function useDropdown() {
  const [open, setOpen] = useState<PopperKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // 外側 pointerdown / Esc クローズは useOutsideClose へ統合（brd-0227）。Esc は hook 内の
  // useEscapeConsume 経由になり、desk-shell のオーバーレイ一括クローズへ伝播しなくなる
  // （ツールバーの dropdown だけが閉じる＝他メニューと同じ挙動へ揃う）。
  useOutsideClose({
    active: open != null,
    refs: [rootRef],
    onClose: () => setOpen(null),
    eventType: 'pointerdown',
  });
  const toggle = (key: PopperKey) => setOpen((cur) => (cur === key ? null : key));
  return { open, setOpen, toggle, rootRef };
}

/** 実書式適用ボタン（editor 制御）。mouseDown preventDefault でエディタ選択範囲を保持する。 */
function LiveBtn({
  label,
  active = false,
  onRun,
  children,
}: {
  label: string;
  active?: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`desk-rte-btn${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="desk-rte-sep" role="separator" aria-orientation="vertical" />;

/**
 * 実書式適用ツールバー（editor 制御 / ADR 0019 Phase 1）。
 * モック .desk-rte-toolbar の見た目・CSS を流用しつつ、各ボタンを Tiptap コマンドへ配線する。
 * 先送り（ADR 0019）: 絵文字 / フォントサイズ / 表 は含めない（「機能の嘘」を出さないため非表示）。
 * インデントはリスト内（sink/lift ListItem）のみ対応。
 */
function RteToolbarLive({ editor }: { editor: Editor }) {
  const { open, setOpen, toggle, rootRef } = useDropdown();

  // 書式ボタンの点灯（is-active）は「エディタにフォーカスがある間だけ」表示する（rete-desk-0062）。
  // Tiptap v3 の useEditor は transaction 毎には再描画しないため focus/blur に加えて transaction を
  // 購読して再描画する（v2 既定の挙動に相当）。selectionUpdate は transaction の部分集合なので不要。
  //   - カーソルを太字範囲の外へ動かす（selection 変化）→ is-active を消す＝0062 の「つきっぱなし」解消
  //   - 書式トグルは selection を変えない transaction なので、これがないと適用直後に点灯が反映されない
  const [, forceRerender] = useState(0);
  useEffect(() => {
    const bump = () => forceRerender((n) => n + 1);
    editor.on('focus', bump);
    editor.on('blur', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('focus', bump);
      editor.off('blur', bump);
      editor.off('transaction', bump);
    };
  }, [editor]);
  const showActive = editor.isFocused;

  const applyHilite = (s: Swatch) => {
    const chain = editor.chain().focus();
    if (s.clear) chain.unsetHighlight().run();
    else chain.toggleHighlight({ color: s.color }).run();
  };
  const applyFore = (color: string) => editor.chain().focus().setColor(color).run();

  // インデント追加/削除はリスト内（sink/liftListItem）と通常段落（deskIndent）で挙動が分かれる。
  const onIndent = () =>
    editor.isActive('listItem')
      ? editor.chain().focus().sinkListItem('listItem').run()
      : editor.chain().focus().command(createIndentCommand(1)).run();
  const onOutdent = () =>
    editor.isActive('listItem')
      ? editor.chain().focus().liftListItem('listItem').run()
      : editor.chain().focus().command(createIndentCommand(-1)).run();

  // リンク挿入（rete-desk-0064）: 「表示」「URL」2 入力。入力欄へフォーカスが移ると本文選択が
  // 失われるため、ボタン押下時点の選択範囲（from/to）と選択文字列をスナップショットして適用時に復元する。
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const linkRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  // dsk-0278（5回目の再設計）: リンクフォームは position:fixed 化し、開いた瞬間のボタン座標から
  // JS で top/left を算出する（CSS-only では祖先 overflow:hidden の外へ「ボタンに追従しつつ」
  // 逃がすことが原理的に不可能なため。詳細はチケット design 参照）。
  const linkButtonRef = useRef<HTMLButtonElement>(null);
  const linkFormRef = useRef<HTMLDivElement>(null);
  const [linkPos, setLinkPos] = useState<{ top: number; left: number } | null>(null);

  const updateLinkPos = () => {
    const btn = linkButtonRef.current;
    const form = linkFormRef.current;
    if (!btn || !form) return;
    const btnRect = btn.getBoundingClientRect();
    const formRect = form.getBoundingClientRect();
    const margin = 8;
    // 下方の高さが不足する時は上開きへ切り替える。
    let top = btnRect.bottom + 2;
    if (top + formRect.height > window.innerHeight - margin) {
      top = btnRect.top - formRect.height - 2;
    }
    // 上開きでも収まらない極端な低ビューポートでは、ビューポート内へクランプする
    // （横方向クリップ防止という本チケットの目的を縦方向でも同様に保証する）。
    const maxTop = Math.max(window.innerHeight - formRect.height - margin, margin);
    top = Math.min(Math.max(top, margin), maxTop);
    // ボタン左端基準・ビューポート内へクランプ（狭ウィンドウ/端寄りでも見切れない）。
    const maxLeft = Math.max(window.innerWidth - formRect.width - margin, margin);
    const left = Math.min(Math.max(btnRect.left, margin), maxLeft);
    setLinkPos({ top, left });
  };

  // 開いた直後（ペイント前）に一度計算。フォームの実測サイズが要るため hidden 解除後の
  // useLayoutEffect で行う（ちらつき防止）。
  useLayoutEffect(() => {
    if (open !== 'link') return;
    updateLinkPos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 開いている間だけボタン追従（スクロール祖先を含む capture）とビューポート変化に追従。
  // rAF で間引き、高頻度スクロール中のレイアウト再計算の連打を避ける。
  useEffect(() => {
    if (open !== 'link') return;
    let rafId: number | null = null;
    const onReposition = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateLinkPos();
      });
    };
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openLink = () => {
    if (open === 'link') {
      setOpen(null);
      return;
    }
    const { from, to } = editor.state.selection;
    linkRangeRef.current = { from, to };
    const selectedText = from !== to ? editor.state.doc.textBetween(from, to, ' ') : '';
    setLinkText(selectedText);
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '');
    setOpen('link');
  };

  const applyLink = () => {
    const { from, to } = linkRangeRef.current;
    const hadSelection = from !== to;
    const selectedText = hadSelection ? editor.state.doc.textBetween(from, to, ' ') : '';
    // 危険スキーム（javascript:/data:/vbscript:）は shared ポリシーで弾き、エディタ state を汚さない
    // （保存/描画 sanitize 前の入口でも遮断＝多層防御の最前段）。
    if (linkUrl.trim() !== '' && RICH_TEXT_UNSAFE_URI_RE.test(linkUrl.trim())) {
      window.alert('このスキームのリンクは挿入できません');
      return;
    }
    const action = decideLinkAction({
      hadSelection,
      selectedText,
      displayText: linkText,
      url: linkUrl,
    });
    switch (action.kind) {
      case 'unset':
        editor
          .chain()
          .focus()
          .setTextSelection({ from, to })
          .extendMarkRange('link')
          .unsetLink()
          .run();
        break;
      case 'setOnSelection':
        editor
          .chain()
          .focus()
          .setTextSelection({ from, to })
          .extendMarkRange('link')
          .setLink({ href: action.href })
          .run();
        break;
      case 'insert': {
        // 選択ありで表示変更時は選択を置換、選択なしはカーソル位置へ挿入。表示テキストは text ノード
        // として挿入するため HTML インジェクション不可（href は上で scheme 検証済み）。
        const chain = editor.chain().focus();
        if (hadSelection) chain.setTextSelection({ from, to }).deleteSelection();
        else chain.setTextSelection(from);
        chain
          .insertContent({
            type: 'text',
            text: action.text,
            marks: [{ type: 'link', attrs: { href: action.href } }],
          })
          .run();
        break;
      }
      case 'noop':
        break;
    }
    setOpen(null);
  };

  return (
    <div className="desk-rte-toolbar" role="toolbar" aria-label="文字書式" ref={rootRef}>
      <LiveBtn
        label="太字"
        active={showActive && editor.isActive('bold')}
        onRun={() => editor.chain().focus().toggleBold().run()}
      >
        <b>B</b>
      </LiveBtn>
      <LiveBtn
        label="イタリック"
        active={showActive && editor.isActive('italic')}
        onRun={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </LiveBtn>
      <LiveBtn
        label="下線"
        active={showActive && editor.isActive('underline')}
        onRun={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </LiveBtn>
      <LiveBtn
        label="取り消し線"
        active={showActive && editor.isActive('strike')}
        onRun={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </LiveBtn>
      <Sep />
      <LiveBtn
        label="箇条書き"
        active={showActive && editor.isActive('bulletList')}
        onRun={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      <LiveBtn
        label="番号付きリスト"
        active={showActive && editor.isActive('orderedList')}
        onRun={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      <LiveBtn label="インデント追加" onRun={onIndent}>
        <IndentIncrease className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      <LiveBtn label="インデント削除" onRun={onOutdent}>
        <IndentDecrease className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      <Sep />

      {/* テキストハイライト（色グリッド dropdown） */}
      <div className="desk-rte-popper" data-rte-popper="hilite">
        <button
          type="button"
          className="desk-rte-btn desk-rte-btn-color"
          title="テキストハイライト"
          aria-label="テキストハイライト"
          aria-haspopup="true"
          aria-expanded={open === 'hilite'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggle('hilite')}
        >
          <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="desk-rte-color-grid" role="menu" hidden={open !== 'hilite'}>
          {HILITE_SWATCHES.map((s) => (
            <button
              key={s.title}
              type="button"
              role="menuitem"
              className={s.clear ? 'desk-rte-color-clear' : undefined}
              style={{ background: s.color }}
              title={s.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyHilite(s)}
            >
              {s.clear ? '×' : null}
            </button>
          ))}
        </div>
      </div>

      {/* フォント色（色グリッド dropdown） */}
      <div className="desk-rte-popper" data-rte-popper="fore">
        <button
          type="button"
          className="desk-rte-btn desk-rte-btn-color"
          title="フォント色"
          aria-label="フォント色"
          aria-haspopup="true"
          aria-expanded={open === 'fore'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggle('fore')}
        >
          <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1 }}>A</span>
        </button>
        <div className="desk-rte-color-grid" role="menu" hidden={open !== 'fore'}>
          {FORE_SWATCHES.map((s) => (
            <button
              key={s.title}
              type="button"
              role="menuitem"
              style={{ background: s.color }}
              title={s.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyFore(s.color)}
            />
          ))}
        </div>
      </div>
      <Sep />

      <LiveBtn
        label="引用"
        active={showActive && editor.isActive('blockquote')}
        onRun={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      {/* リンク（rete-desk-0064）: 「表示」「URL」2 入力のポップオーバー。 */}
      <div className="desk-rte-popper" data-rte-popper="link">
        <button
          ref={linkButtonRef}
          type="button"
          className={`desk-rte-btn${showActive && editor.isActive('link') ? ' is-active' : ''}`}
          title="リンク"
          aria-label="リンク"
          aria-haspopup="dialog"
          aria-expanded={open === 'link'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={openLink}
        >
          <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div
          ref={linkFormRef}
          className="desk-rte-link-form"
          role="dialog"
          aria-label="リンクを挿入"
          hidden={open !== 'link'}
          style={linkPos ? { top: linkPos.top, left: linkPos.left } : undefined}
        >
          <label className="desk-rte-link-row">
            <span className="desk-rte-link-label">表示</span>
            <input
              type="text"
              className="desk-rte-link-input"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="表示テキスト"
              onKeyDown={(e) => {
                // URL 入力欄と対称に、表示欄でも Enter で適用（IME 変換確定中は無視）。
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <label className="desk-rte-link-row">
            <span className="desk-rte-link-label">URL</span>
            <input
              type="url"
              className="desk-rte-link-input"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <div className="desk-rte-link-actions">
            <button
              type="button"
              className="desk-rte-link-apply"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyLink}
            >
              適用
            </button>
          </div>
        </div>
      </div>
      <LiveBtn
        label="コードブロック"
        active={showActive && editor.isActive('codeBlock')}
        onRun={() =>
          // codeBlock 内なら標準トグルで解除。それ以外は範囲を 1 ブロックへ結合（rete-desk-0069）。
          editor.isActive('codeBlock')
            ? editor.chain().focus().toggleCodeBlock().run()
            : editor.chain().focus().command(createCodeBlockRangeCommand()).run()
        }
      >
        <Code className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      <LiveBtn label="水平線" onRun={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
      <LiveBtn
        label="書式をクリア"
        onRun={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="h-3.5 w-3.5" aria-hidden="true" />
      </LiveBtn>
    </div>
  );
}

/**
 * 非機能の見た目シェル（モック .desk-rte-toolbar 移植 / Phase 2 で editor 配線するまでの暫定）。
 * メニュー開閉という UI chrome は動くが、実際の書式適用は持たない（チャット composer / コメント欄が使用）。
 */
function RteToolbarInert() {
  const { open, toggle, rootRef } = useDropdown();
  return (
    <div className="desk-rte-toolbar" role="toolbar" aria-label="文字書式" ref={rootRef}>
      <InertBtn label="絵文字">
        <Smile className="h-3.5 w-3.5" aria-hidden="true" />
      </InertBtn>
      <Sep />
      <InertBtn label="太字">
        <b>B</b>
      </InertBtn>
      <InertBtn label="イタリック">
        <i>I</i>
      </InertBtn>
      <InertBtn label="取り消し線">
        <s>S</s>
      </InertBtn>
      <Sep />
      <InertBtn label="箇条書き">
        <List className="h-3.5 w-3.5" aria-hidden="true" />
      </InertBtn>
      <InertBtn label="番号付きリスト">
        <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      </InertBtn>
      <Sep />

      <div className="desk-rte-popper" data-rte-popper="hilite">
        <button
          type="button"
          className="desk-rte-btn desk-rte-btn-color"
          title="テキストハイライト"
          aria-label="テキストハイライト"
          aria-haspopup="true"
          aria-expanded={open === 'hilite'}
          onClick={() => toggle('hilite')}
        >
          <Highlighter className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="desk-rte-color-bar" style={{ background: '#FEF08A' }} />
        </button>
        <div className="desk-rte-color-grid" role="menu" hidden={open !== 'hilite'}>
          {HILITE_SWATCHES.map((s) => (
            <button
              key={s.title}
              type="button"
              role="menuitem"
              className={s.clear ? 'desk-rte-color-clear' : undefined}
              style={{ background: s.color }}
              title={s.title}
              onClick={() => toggle('hilite')}
            >
              {s.clear ? '×' : null}
            </button>
          ))}
        </div>
      </div>

      <div className="desk-rte-popper" data-rte-popper="fore">
        <button
          type="button"
          className="desk-rte-btn desk-rte-btn-color"
          title="フォント色"
          aria-label="フォント色"
          aria-haspopup="true"
          aria-expanded={open === 'fore'}
          onClick={() => toggle('fore')}
        >
          <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1 }}>A</span>
          <span className="desk-rte-color-bar" style={{ background: '#DC2626' }} />
        </button>
        <div className="desk-rte-color-grid" role="menu" hidden={open !== 'fore'}>
          {FORE_SWATCHES.map((s) => (
            <button
              key={s.title}
              type="button"
              role="menuitem"
              style={{ background: s.color }}
              title={s.title}
              onClick={() => toggle('fore')}
            />
          ))}
        </div>
      </div>

      <div className="desk-rte-popper" data-rte-popper="size">
        <button
          type="button"
          className="desk-rte-btn"
          title="フォントサイズ"
          aria-label="フォントサイズ"
          aria-haspopup="true"
          aria-expanded={open === 'size'}
          onClick={() => toggle('size')}
        >
          <span style={{ fontWeight: 600, fontSize: 12, lineHeight: 1 }}>A</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" style={{ marginLeft: 2 }} />
        </button>
        <ul className="desk-rte-menu" role="menu" hidden={open !== 'size'}>
          {SIZE_ITEMS.map((it) => (
            <li
              key={it.value}
              role="menuitem"
              tabIndex={-1}
              className={it.selected ? 'is-selected' : undefined}
              onClick={() => toggle('size')}
            >
              {it.label}
            </li>
          ))}
        </ul>
      </div>

      <Sep />
      <InertBtn label="引用">
        <Quote className="h-3.5 w-3.5" aria-hidden="true" />
      </InertBtn>
      <InertBtn label="リンク">
        <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </InertBtn>
      <InertBtn label="コードブロック">
        <Code className="h-3.5 w-3.5" aria-hidden="true" />
      </InertBtn>
      <Sep />

      <div className="desk-rte-popper" data-rte-popper="more">
        <button
          type="button"
          className="desk-rte-btn"
          title="その他の書式"
          aria-label="その他の書式"
          aria-haspopup="true"
          aria-expanded={open === 'more'}
          onClick={() => toggle('more')}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <ul className="desk-rte-menu desk-rte-menu-wide" role="menu" hidden={open !== 'more'}>
          <li role="menuitem" tabIndex={-1} onClick={() => toggle('more')}>
            段落
          </li>
          <li role="menuitem" tabIndex={-1} onClick={() => toggle('more')}>
            すべての書式をクリア
          </li>
          <li role="separator" className="desk-rte-menu-sep" />
          <li role="menuitem" tabIndex={-1} onClick={() => toggle('more')}>
            インデント削除
          </li>
          <li role="menuitem" tabIndex={-1} onClick={() => toggle('more')}>
            インデント追加
          </li>
          <li role="separator" className="desk-rte-menu-sep" />
          <li role="menuitem" tabIndex={-1} onClick={() => toggle('more')}>
            水平線
          </li>
          <li role="menuitem" tabIndex={-1} onClick={() => toggle('more')}>
            表を追加
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * RTE 文字書式ツールバー。`editor` を渡すと実書式適用（RteToolbarLive）、未指定なら見た目のみシェル
 * （RteToolbarInert / チャット側 Phase 2 まで）。単一の入口に集約して呼び出し側を単純化する。
 */
export function RteToolbar({ editor }: { editor?: Editor | null }) {
  return editor ? <RteToolbarLive editor={editor} /> : <RteToolbarInert />;
}
