import {
  toAnnouncementSummary,
  toAnnouncementDetail,
  ANNOUNCEMENT_EXCERPT_MAX_LENGTH,
} from './announcement.mapper';
import type { AnnouncementWithAuthor } from './repositories/announcement.repository';
import { makeAnnouncementTagEntity } from '../../__tests__/factories';

const FIXED_TAG_DATE = new Date('2026-06-17T00:00:00.000Z');

function makeAnnouncement(overrides: Partial<AnnouncementWithAuthor> = {}): AnnouncementWithAuthor {
  const base = new Date('2026-06-01T00:00:00.000Z');
  return {
    id: 'ann-1',
    title: 'お知らせ',
    body: '<p>本文</p>',
    authorId: 'acc-1',
    // targetRoles / targetBusinessRoleIds は hom-0143 で列ごと削除済（fixture に残さない）。
    publishedAt: base,
    createdAt: base,
    updatedAt: base,
    author: { name: '田中 太郎' },
    tagAssignments: [],
    ...overrides,
  } as AnnouncementWithAuthor;
}

describe('announcement.mapper', () => {
  describe('toAnnouncementSummary', () => {
    it('一覧 DTO は id/title/publishedAt/author/excerpt/unread/tags の 7 キーで body/important/isNew を含めない（§1 DTO 境界・hom-0054）', () => {
      const dto = toAnnouncementSummary(makeAnnouncement());
      expect(Object.keys(dto).sort()).toEqual([
        'author',
        'excerpt',
        'id',
        'publishedAt',
        'tags',
        'title',
        'unread',
      ]);
      expect(dto).not.toHaveProperty('body');
      expect(dto).not.toHaveProperty('authorId');
      expect(dto).not.toHaveProperty('important');
      expect(dto).not.toHaveProperty('isNew');
    });

    it('tagAssignments が空配列なら tags は空配列', () => {
      const dto = toAnnouncementSummary(makeAnnouncement({ tagAssignments: [] } as never));
      expect(dto.tags).toEqual([]);
    });

    it('tagAssignments からタグを name 昇順で tags へ変換する', () => {
      const ann = makeAnnouncement({
        tagAssignments: [
          {
            announcementId: 'ann-1',
            tagId: 'b',
            createdAt: FIXED_TAG_DATE,
            tag: makeAnnouncementTagEntity({ id: 'b', name: '重要' }),
          },
          {
            announcementId: 'ann-1',
            tagId: 'a',
            createdAt: FIXED_TAG_DATE,
            tag: makeAnnouncementTagEntity({ id: 'a', name: '新着' }),
          },
        ],
      } as never);
      const dto = toAnnouncementSummary(ann);
      expect(dto.tags.map((t: { name: string }) => t.name)).toEqual(['新着', '重要']);
    });

    it('unread は第2引数をそのまま反映し、省略時（未ログイン経路）は false へフォールバックする（HM-3・ADR 0029）', () => {
      expect(toAnnouncementSummary(makeAnnouncement(), true).unread).toBe(true);
      expect(toAnnouncementSummary(makeAnnouncement(), false).unread).toBe(false);
      expect(toAnnouncementSummary(makeAnnouncement()).unread).toBe(false);
    });

    it('excerpt は body の HTML タグを除去した先頭テキスト（最大長で切り詰め + …）', () => {
      const short = toAnnouncementSummary(
        makeAnnouncement({ body: '<p>列幅永続化機能を<strong>全一覧画面</strong>で有効化</p>' }),
      );
      expect(short.excerpt).toBe('列幅永続化機能を 全一覧画面 で有効化');

      const long = toAnnouncementSummary(
        makeAnnouncement({ body: `<p>${'あ'.repeat(ANNOUNCEMENT_EXCERPT_MAX_LENGTH + 10)}</p>` }),
      );
      expect(long.excerpt).toBe(`${'あ'.repeat(ANNOUNCEMENT_EXCERPT_MAX_LENGTH)}…`);
      expect(toAnnouncementSummary(makeAnnouncement({ body: '' })).excerpt).toBe('');
    });

    it('publishedAt は ISO 8601 文字列・author は表示名へ写す', () => {
      const dto = toAnnouncementSummary(
        makeAnnouncement({ publishedAt: new Date('2026-05-20T09:30:00.000Z') }),
      );
      expect(dto.publishedAt).toBe('2026-05-20T09:30:00.000Z');
      expect(dto.author).toBe('田中 太郎');
    });
  });

  describe('toAnnouncementDetail', () => {
    it('詳細 DTO は body/attachments/tags を含む 7 キーで authorId/important/isNew/通知先を漏らさない（hom-0054・hom-0143）', () => {
      const dto = toAnnouncementDetail(makeAnnouncement({ body: '<p>詳細本文</p>' }));
      expect(Object.keys(dto).sort()).toEqual([
        'attachments',
        'author',
        'body',
        'id',
        'publishedAt',
        'tags',
        'title',
      ]);
      expect(dto.body).toBe('<p>詳細本文</p>');
      expect(dto).not.toHaveProperty('authorId');
      expect(dto).not.toHaveProperty('important');
      expect(dto).not.toHaveProperty('isNew');
      expect(dto).not.toHaveProperty('targetRoles');
      expect(dto).not.toHaveProperty('targetBusinessRoles');
    });

    it('attachments 未指定は空配列、指定時はそのまま載せる（H0022）', () => {
      expect(toAnnouncementDetail(makeAnnouncement()).attachments).toEqual([]);
      const att = [{ id: 'att-1', fileId: 'f1', fileName: 'a.pdf' } as never];
      expect(toAnnouncementDetail(makeAnnouncement(), att).attachments).toBe(att);
    });
  });
});
