import { describe, it, expect } from 'vitest';
import { decideLinkAction } from '../link-action';

describe('decideLinkAction（rete-desk-0064）', () => {
  it('選択あり・表示=選択文字列のまま → 選択範囲にリンク設定（従来挙動）', () => {
    expect(
      decideLinkAction({
        hadSelection: true,
        selectedText: 'Rete 公式',
        displayText: 'Rete 公式',
        url: 'https://example.com',
      }),
    ).toEqual({ kind: 'setOnSelection', href: 'https://example.com' });
  });

  it('選択あり・表示空 → 選択範囲にリンク設定', () => {
    expect(
      decideLinkAction({
        hadSelection: true,
        selectedText: 'Rete',
        displayText: '',
        url: 'https://example.com',
      }),
    ).toEqual({ kind: 'setOnSelection', href: 'https://example.com' });
  });

  it('選択なし・表示を手入力 → リンク付きテキストを挿入', () => {
    expect(
      decideLinkAction({
        hadSelection: false,
        selectedText: '',
        displayText: '公式サイト',
        url: 'https://example.com',
      }),
    ).toEqual({ kind: 'insert', href: 'https://example.com', text: '公式サイト' });
  });

  it('選択あり・表示を別文字へ変更 → 置換挿入（insert）', () => {
    expect(
      decideLinkAction({
        hadSelection: true,
        selectedText: 'もとの語',
        displayText: '新しい表示',
        url: 'https://example.com',
      }),
    ).toEqual({ kind: 'insert', href: 'https://example.com', text: '新しい表示' });
  });

  it('選択なし・表示空・URL あり → URL を表示文字に使って挿入', () => {
    expect(
      decideLinkAction({
        hadSelection: false,
        selectedText: '',
        displayText: '',
        url: 'https://example.com',
      }),
    ).toEqual({ kind: 'insert', href: 'https://example.com', text: 'https://example.com' });
  });

  it('URL 空・選択あり → リンク解除', () => {
    expect(
      decideLinkAction({ hadSelection: true, selectedText: 'x', displayText: 'x', url: '   ' }),
    ).toEqual({ kind: 'unset' });
  });

  it('URL 空・選択なし → no-op', () => {
    expect(
      decideLinkAction({ hadSelection: false, selectedText: '', displayText: '表示のみ', url: '' }),
    ).toEqual({ kind: 'noop' });
  });
});
