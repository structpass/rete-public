import { describe, it, expect } from 'vitest';
import * as format from '../format';

const { fileExt, kindLabel, formatBytes } = format;

describe('fileExt', () => {
  it('拡張子を小文字で返す', () => {
    expect(fileExt('メモ.MD')).toBe('md');
    expect(fileExt('資料.xlsx')).toBe('xlsx');
  });
  it('複数ドットは最後の拡張子', () => {
    expect(fileExt('会議録_2026-04-23.md')).toBe('md');
  });
  it('ドット無しは空文字', () => {
    expect(fileExt('旧資料')).toBe('');
  });
});

describe('kindLabel', () => {
  it('フォルダは「フォルダ」', () => {
    expect(kindLabel({ kind: 'folder', name: '議事録' })).toBe('フォルダ');
  });
  it('ファイルは「拡張子大文字 + ファイル」', () => {
    expect(kindLabel({ kind: 'file', name: 'メモ.md' })).toBe('MDファイル');
    expect(kindLabel({ kind: 'file', name: '表.xlsx' })).toBe('XLSXファイル');
  });
  it('拡張子無しファイルは「ファイル」', () => {
    expect(kindLabel({ kind: 'file', name: 'README' })).toBe('ファイル');
  });
});

describe('formatBytes', () => {
  it('1024 未満はバイト表記', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });
  it('KB / MB / GB に丸める（末尾 .0 は出さない）', () => {
    expect(formatBytes(8 * 1024)).toBe('8 KB');
    expect(formatBytes(Math.round(1.4 * 1024 * 1024))).toBe('1.4 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('日時整形の置き場（cmn-0253）', () => {
  it('本モジュールは formatDateTime を再定義しない（lib/utils.ts の 1 箇所へ寄せる）', () => {
    // 同名で時間軸だけ違う関数が 2 つ並ぶ状態を禁止する。JST 固定が要るなら
    // lib/utils.ts へ formatDateTimeJst のような明示名で置く（ここへ戻さない）。
    expect(format).not.toHaveProperty('formatDateTime');
  });
});
