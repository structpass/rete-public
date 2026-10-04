import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';

afterEach(() => cleanup());

describe('Select portal z-index（dsk-0344 / set-0142）', () => {
  function renderAndOpen() {
    render(
      <Select defaultValue="">
        <SelectTrigger aria-label="担当者">
          <SelectValue placeholder="選択" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alice</SelectItem>
          <SelectItem value="b">Bob</SelectItem>
        </SelectContent>
      </Select>,
    );
    fireEvent.click(screen.getByRole('button', { name: '担当者' }));
    return screen.getByRole('listbox');
  }

  it('開いた listbox が z-[10070] を持ちオーバーレイ(10000)より手前になる', () => {
    const listbox = renderAndOpen();
    expect(listbox.className).toMatch(/z-\[10070\]/);
    expect(listbox.className).not.toMatch(/z-\[9999\]/);
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
  });

  it('OverlayDialog/AlertDialog(z-10050) より手前になる（set-0142: OverlayDialog 内フォームで使うため）', () => {
    const listbox = renderAndOpen();
    const z = Number(listbox.className.match(/z-\[(\d+)\]/)?.[1]);
    expect(z).toBeGreaterThan(10050);
  });

  it('reaction-bar 絵文字ピッカー(inline zIndex:10060) より手前になる（set-0142: 既知最大値超え）', () => {
    const listbox = renderAndOpen();
    const z = Number(listbox.className.match(/z-\[(\d+)\]/)?.[1]);
    expect(z).toBeGreaterThan(10060);
  });
});
