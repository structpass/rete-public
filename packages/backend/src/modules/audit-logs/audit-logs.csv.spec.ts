import type { AuditLogDto } from '@rete/shared';
import { buildAuditLogsCsv } from './audit-logs.csv';

const dto = (over: Partial<AuditLogDto> = {}): AuditLogDto => ({
  id: 'a1',
  actorName: '田中 太郎',
  actorEmail: 'tanaka@struct-pass.io',
  systemName: 'system-A 商品管理',
  actionType: 'update',
  feature: '在庫管理',
  summary: 'SKU-1024 在庫数 120 → 170',
  ipAddress: '203.0.113.42',
  createdAt: '2026-05-08T00:42:08.000Z',
  ...over,
});

describe('buildAuditLogsCsv', () => {
  it('UTF-8 BOM 付きでヘッダ + 行を出力し、操作種別を日本語ラベルへ写す', () => {
    const csv = buildAuditLogsCsv([dto()]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'ユーザー名,メールアドレス,システム名,操作,機能名,内容,実行元IP,実行日時',
    );
    // actionType 'update' → '更新'。
    expect(lines[1]).toContain('更新');
    expect(lines[1]).toContain('田中 太郎');
    expect(lines[1]).toContain('203.0.113.42');
  });

  it('実行日時を JST（Asia/Tokyo）の YYYY/MM/DD HH:mm:ss で整形する', () => {
    // 2026-05-08T00:42:08Z = JST 09:42:08。
    const csv = buildAuditLogsCsv([dto()]);
    expect(csv).toContain('2026/05/08 09:42:08');
  });

  it('数式トリガーで始まる内容を formula injection 対策で無害化する', () => {
    const csv = buildAuditLogsCsv([dto({ summary: '=cmd|calc' })]);
    // 先頭 ' で無害化され、カンマ/特殊文字が無ければ引用は付かない。
    expect(csv).toContain("'=cmd|calc");
  });

  it('ipAddress 不明（null）は空セルにする', () => {
    const csv = buildAuditLogsCsv([dto({ ipAddress: null })]);
    const dataLine = csv.replace('﻿', '').trimEnd().split('\r\n')[1];
    // 実行元IP 列（7 列目）が空。
    expect(dataLine.split(',')[6]).toBe('');
  });
});
