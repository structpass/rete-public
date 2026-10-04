import { parseInviteCsv, buildInviteTemplateCsv } from './invite.csv';

describe('parseInviteCsv', () => {
  it('「メールアドレス」列を抽出して { email, row } 配列を返す', () => {
    const csv = 'メールアドレス\r\nalice@ex.com\r\nbob@ex.com\r\n';
    expect(parseInviteCsv(csv)).toEqual([
      { email: 'alice@ex.com', row: 2 },
      { email: 'bob@ex.com', row: 3 },
    ]);
  });

  it('BOM 付き CSV でも正しく parse する', () => {
    const csv = '﻿メールアドレス\r\nalice@ex.com';
    expect(parseInviteCsv(csv)).toEqual([{ email: 'alice@ex.com', row: 2 }]);
  });

  it('前後スペースを trim して返す', () => {
    const csv = 'メールアドレス\r\n  alice@ex.com  ';
    expect(parseInviteCsv(csv)).toEqual([{ email: 'alice@ex.com', row: 2 }]);
  });

  it('空セルをスキップして返す（スキップ後の行番号は連続しない）', () => {
    // ヘッダ=row1, 空行=row2(スキップ), alice=row3
    const csv = 'メールアドレス\r\n\r\nalice@ex.com';
    expect(parseInviteCsv(csv)).toEqual([{ email: 'alice@ex.com', row: 3 }]);
  });

  it('「メールアドレス」列が存在しない CSV は空配列を返す', () => {
    const csv = 'email\r\nalice@ex.com';
    expect(parseInviteCsv(csv)).toEqual([]);
  });

  it('データ行なしなら空配列を返す', () => {
    const csv = 'メールアドレス\r\n';
    expect(parseInviteCsv(csv)).toEqual([]);
  });

  it('行番号は 1-based（ヘッダ=1、最初のデータ行=2）', () => {
    const csv = 'メールアドレス\r\nfirst@ex.com\r\nsecond@ex.com';
    const result = parseInviteCsv(csv);
    expect(result[0].row).toBe(2);
    expect(result[1].row).toBe(3);
  });

  it('email を小文字化して返す（大小混在の二重 PENDING 防止・cmn-0074）', () => {
    const csv = 'メールアドレス\r\nNewUser@Example.com\r\nBob@EX.com';
    expect(parseInviteCsv(csv)).toEqual([
      { email: 'newuser@example.com', row: 2 },
      { email: 'bob@ex.com', row: 3 },
    ]);
  });
});

describe('buildInviteTemplateCsv', () => {
  it('BOM + ヘッダ「メールアドレス」+ 例行を含む CSV を返す', () => {
    const csv = buildInviteTemplateCsv();
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain('メールアドレス');
    const lines = csv.replace('﻿', '').trim().split(/\r?\n/);
    expect(lines).toHaveLength(2); // ヘッダ + 例1行
  });
});
