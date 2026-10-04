import { InviteStatus } from '@prisma/client';
import { toInviteDto } from './invite.mapper';
import type { InviteWithRelationsPublic } from './repositories/invite.repository';

const FIXED_DATE = new Date('2026-06-14T10:00:00.000Z');
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const FUTURE = new Date(FIXED_DATE.getTime() + SEVEN_DAYS);
const PAST = new Date(FIXED_DATE.getTime() - SEVEN_DAYS);

// effective status 判定が参照する now（new Date()）ごと FIXED_DATE に固定する。
// FUTURE/PAST の相対定数は FIXED_DATE 基準なので、now を固定すれば実行日に依存せず緑になる
// （cmn-0061: 固定しないと実時刻が FUTURE を追い越した時点で PENDING テストが EXPIRED を受け取り fail する time-bomb）。
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_DATE);
});
afterAll(() => {
  jest.useRealTimers();
});

function makeInviteRow(
  overrides: Partial<InviteWithRelationsPublic> = {},
): InviteWithRelationsPublic {
  return {
    id: 'invite-1',
    email: 'newuser@rete.local',
    status: InviteStatus.PENDING,
    expiresAt: FUTURE,
    invitedById: 'account-1',
    acceptedAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    invitedBy: { name: '田中 太郎' },
    spaceId: null,
    ...overrides,
  };
}

describe('toInviteDto', () => {
  it('PENDING かつ未期限なら status=PENDING を返す', () => {
    const dto = toInviteDto(makeInviteRow({ status: InviteStatus.PENDING, expiresAt: FUTURE }));
    expect(dto.status).toBe('PENDING');
  });

  it('PENDING かつ expiresAt < now なら status=EXPIRED（effective）を返す', () => {
    const dto = toInviteDto(makeInviteRow({ status: InviteStatus.PENDING, expiresAt: PAST }));
    expect(dto.status).toBe('EXPIRED');
  });

  it('ACCEPTED なら status=ACCEPTED を返す', () => {
    const dto = toInviteDto(
      makeInviteRow({ status: InviteStatus.ACCEPTED, acceptedAt: FIXED_DATE }),
    );
    expect(dto.status).toBe('ACCEPTED');
  });

  it('DB status=EXPIRED はそのまま EXPIRED を返す', () => {
    const dto = toInviteDto(makeInviteRow({ status: InviteStatus.EXPIRED }));
    expect(dto.status).toBe('EXPIRED');
  });

  it('tokenHash が DTO フィールドに含まれない', () => {
    const dto = toInviteDto(makeInviteRow());
    expect(Object.keys(dto)).not.toContain('tokenHash');
    expect(Object.keys(dto)).not.toContain('token_hash');
  });

  it('invitedByName を含む', () => {
    const dto = toInviteDto(makeInviteRow({ invitedBy: { name: '管理者' } }));
    expect(dto.invitedByName).toBe('管理者');
  });

  it('invitedAt は createdAt の ISO 文字列で返す', () => {
    const dto = toInviteDto(makeInviteRow());
    expect(dto.invitedAt).toBe(FIXED_DATE.toISOString());
  });

  it('acceptedAt が null なら null を返す', () => {
    const dto = toInviteDto(makeInviteRow({ acceptedAt: null }));
    expect(dto.acceptedAt).toBeNull();
  });

  it('acceptedAt が非 null なら ISO 文字列を返す', () => {
    const dto = toInviteDto(makeInviteRow({ acceptedAt: FIXED_DATE }));
    expect(dto.acceptedAt).toBe(FIXED_DATE.toISOString());
  });

  it('DTO フィールド一覧が仕様通り（tokenHash / invitedById 等の内部列が含まれない）', () => {
    const dto = toInviteDto(makeInviteRow());
    expect(Object.keys(dto).sort()).toEqual(
      ['id', 'email', 'status', 'invitedAt', 'expiresAt', 'acceptedAt', 'invitedByName'].sort(),
    );
  });
});
