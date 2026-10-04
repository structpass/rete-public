import type { MemberDto } from '@rete/shared';
import { buildMembersCsv } from './members.csv';

const member = (over: Partial<MemberDto>): MemberDto => ({
  id: 'm1',
  name: '山田 太郎',
  familyName: '山田',
  givenName: '太郎',
  email: 'taro@rete.local',
  isActive: true,
  lockedUntil: null,
  mfaEnabled: false,
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-05T09:00:00.000Z',
  ...over,
});

describe('buildMembersCsv', () => {
  it('ヘッダ行を業務カラムで出す', () => {
    const csv = buildMembersCsv([]);
    const header = csv.replace('﻿', '').split('\r\n')[0];
    expect(header).toBe('表示名,メールアドレス,状態,作成日時,最終更新日時');
  });

  it('状態ラベルを行に展開する', () => {
    const csv = buildMembersCsv([
      member({ name: '山田 太郎', email: 'taro@rete.local', isActive: true }),
    ]);
    const row = csv.replace('﻿', '').split('\r\n')[1];
    expect(row).toBe(
      '山田 太郎,taro@rete.local,有効,2026-06-01T09:00:00.000Z,2026-06-05T09:00:00.000Z',
    );
  });

  it('ロックは「ロック」ラベルになる', () => {
    const csv = buildMembersCsv([member({ isActive: false })]);
    const row = csv.replace('﻿', '').split('\r\n')[1];
    const cols = row.split(',');
    expect(cols[2]).toBe('ロック'); // 状態
  });
});
