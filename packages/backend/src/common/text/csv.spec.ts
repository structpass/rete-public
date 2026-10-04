import { toCsv, parseCsv } from './csv';

describe('toCsv', () => {
  it('ヘッダ + 行を CRLF 区切りで連結し、末尾にも改行を付ける（RFC4180）', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ],
      { bom: false },
    );
    expect(csv).toBe('a,b\r\n1,2\r\n3,4\r\n');
  });

  it('先頭に UTF-8 BOM を付ける（既定・Excel 文字化け回避）', () => {
    const csv = toCsv(['a'], [['x']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿a\r\nx\r\n');
  });

  it('カンマ・改行・ダブルクォートを含むセルは引用符で囲み、内部の " を "" にエスケープする', () => {
    const csv = toCsv(['col'], [['a,b'], ['c\nd'], ['e"f']], { bom: false });
    expect(csv).toBe('col\r\n"a,b"\r\n"c\nd"\r\n"e""f"\r\n');
  });

  it('エスケープ不要なセルはそのまま出す', () => {
    const csv = toCsv(['x'], [['plain text 日本語']], { bom: false });
    expect(csv).toBe('x\r\nplain text 日本語\r\n');
  });

  it('行が空でもヘッダ行は出力する', () => {
    const csv = toCsv(['a', 'b'], [], { bom: false });
    expect(csv).toBe('a,b\r\n');
  });

  it("数式トリガー文字（= + - @ タブ）で始まるセルは先頭に ' を付けて無害化する（CSV インジェクション対策・既定）", () => {
    const csv = toCsv(['col'], [['=1+1'], ['+x'], ['-y'], ['@z'], ['\tt']], { bom: false });
    expect(csv).toBe("col\r\n'=1+1\r\n'+x\r\n'-y\r\n'@z\r\n'\tt\r\n");
  });

  it('数式トリガー + カンマを含む場合はプレフィックス後に RFC4180 クォートする', () => {
    const csv = toCsv(['col'], [['=a,b']], { bom: false });
    expect(csv).toBe('col\r\n"\'=a,b"\r\n');
  });

  it('formulaGuard:false で数式トリガーをそのまま出す（数値列など明示オプトアウト）', () => {
    const csv = toCsv(['n'], [['-5']], { bom: false, formulaGuard: false });
    expect(csv).toBe('n\r\n-5\r\n');
  });
});

describe('parseCsv', () => {
  it('ヘッダ + データ行を Record 配列として返す（CRLF）', () => {
    const result = parseCsv('name,email\r\nJohn,john@ex.com\r\n');
    expect(result).toEqual([{ name: 'John', email: 'john@ex.com' }]);
  });

  it('LF 区切りも受け付ける', () => {
    const result = parseCsv('name\nJohn\nJane\n');
    expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
  });

  it('BOM（\\uFEFF）を先頭から除去して正常に parse する', () => {
    const bom = '﻿';
    const result = parseCsv(`${bom}name\r\nJohn`);
    expect(result).toEqual([{ name: 'John' }]);
  });

  it('引用符付きセル（カンマ含む）を正しく parse する', () => {
    const result = parseCsv('name\r\n"山田,太郎"');
    expect(result).toEqual([{ name: '山田,太郎' }]);
  });

  it('引用符内の改行を含むセルを正しく parse する', () => {
    const result = parseCsv('name\r\n"山田\n太郎"');
    expect(result).toEqual([{ name: '山田\n太郎' }]);
  });

  it('引用符内の "" を " にエスケープして parse する', () => {
    const result = parseCsv('name\r\n"Say ""hello"""');
    expect(result).toEqual([{ name: 'Say "hello"' }]);
  });

  it('空行をスキップして次の行を返す', () => {
    const result = parseCsv('name\r\nJohn\r\n\r\nJane\r\n');
    expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
  });

  it('データ行がなければ空配列を返す', () => {
    const result = parseCsv('name,email\r\n');
    expect(result).toEqual([]);
  });

  it('列数がヘッダより少ない行は不足列を空文字で補う', () => {
    const result = parseCsv('a,b,c\r\nx,y');
    expect(result).toEqual([{ a: 'x', b: 'y', c: '' }]);
  });

  it('値の前後の空白は trim しない（呼び出し側の責務）', () => {
    const result = parseCsv('email\r\n user@ex.com ');
    expect(result).toEqual([{ email: ' user@ex.com ' }]);
  });
});
