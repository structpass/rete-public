import {
  makeAccountEntity,
  makeMembershipEntity,
  makeChatThemeEntity,
  makeChatMessageEntity,
  makeReactionEntity,
  makeChatMessageMentionEntity,
  makeChatThemeMentionEntity,
  makeChatReadStateEntity,
} from './factories';
import { REACTION_EMOJIS } from '@rete/shared';

// 新規追加した test factory（Account / Membership / Chat 系）の契約を固定する。
// 「既定値が有効な entity 形状を返す」「override が浅くマージされる」「Reaction の XOR 既定」を担保し、
// 後続の spec が安心してバリエーションを組めるようにする。
describe('test factories (chat / account / membership)', () => {
  describe('makeAccountEntity', () => {
    it('returns a valid Account shape with safe defaults', () => {
      const acc = makeAccountEntity();
      expect(acc.id).toBe('account-1');
      expect(acc.role).toBe('MEMBER');
      expect(acc.isActive).toBe(true);
      expect(acc.lockedUntil).toBeNull();
    });

    it('applies overrides for multi-user fixtures', () => {
      const admin = makeAccountEntity({ id: 'account-2', role: 'ADMIN', name: '管理者' });
      expect(admin.id).toBe('account-2');
      expect(admin.role).toBe('ADMIN');
      expect(admin.name).toBe('管理者');
      // 非 override 列は既定のまま
      expect(admin.isActive).toBe(true);
    });
  });

  describe('makeMembershipEntity', () => {
    it('defaults to an ORGANIZATION-scoped MEMBER membership', () => {
      const m = makeMembershipEntity();
      expect(m.scopeType).toBe('ORGANIZATION');
      expect(m.role).toBe('MEMBER');
    });

    it('supports multiple scope types and roles via overrides', () => {
      const group = makeMembershipEntity({ scopeType: 'GROUP', scopeId: 'space-9', role: 'ADMIN' });
      expect(group.scopeType).toBe('GROUP');
      expect(group.scopeId).toBe('space-9');
      expect(group.role).toBe('ADMIN');
    });
  });

  describe('makeChatThemeEntity / makeChatMessageEntity', () => {
    it('theme belongs to a space by default and supports CLOSED + tenmatsu', () => {
      const open = makeChatThemeEntity();
      expect(open.spaceId).toBe('space-1');
      expect(open.status).toBe('OPEN');
      expect(open.tenmatsu).toBeNull();

      const closed = makeChatThemeEntity({ status: 'CLOSED', tenmatsu: '区分3段階で運用開始' });
      expect(closed.status).toBe('CLOSED');
      expect(closed.tenmatsu).toBe('区分3段階で運用開始');
    });

    it('messages can be threaded under a theme', () => {
      const msg = makeChatMessageEntity({
        themeId: 'theme-1',
        authorId: 'account-2',
        body: '了解です',
      });
      expect(msg.themeId).toBe('theme-1');
      expect(msg.authorId).toBe('account-2');
      expect(msg.body).toBe('了解です');
    });
  });

  describe('makeReactionEntity (XOR target)', () => {
    it('defaults to a message-targeted reaction (themeId null)', () => {
      const r = makeReactionEntity();
      expect(r.messageId).toBe('message-1');
      expect(r.themeId).toBeNull();
      expect(REACTION_EMOJIS).toContain(r.emoji);
    });

    it('can be retargeted to a theme (messageId null)', () => {
      const r = makeReactionEntity({ messageId: null, themeId: 'theme-1', emoji: '🎉' });
      expect(r.messageId).toBeNull();
      expect(r.themeId).toBe('theme-1');
      // XOR 不変条件: ちょうど一方が非 NULL
      expect((r.messageId === null) !== (r.themeId === null)).toBe(true);
    });
  });

  describe('mention / read-state factories', () => {
    it('message mention pairs a message with a recipient account', () => {
      const m = makeChatMessageMentionEntity({ messageId: 'm9', accountId: 'a9' });
      expect(m.messageId).toBe('m9');
      expect(m.accountId).toBe('a9');
    });

    it('theme mention defaults to DESCRIPTION field and supports TENMATSU', () => {
      expect(makeChatThemeMentionEntity().field).toBe('DESCRIPTION');
      expect(makeChatThemeMentionEntity({ field: 'TENMATSU' }).field).toBe('TENMATSU');
    });

    it('read state carries a per-account last-read timestamp', () => {
      const later = new Date('2026-06-01T00:00:00.000Z');
      const rs = makeChatReadStateEntity({ accountId: 'a1', themeId: 't1', lastReadAt: later });
      expect(rs.accountId).toBe('a1');
      expect(rs.lastReadAt).toEqual(later);
    });
  });
});
