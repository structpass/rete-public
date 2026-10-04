import { toAttachment } from './attachments.mapper';
import type { AttachmentWithDisplay } from './repositories/attachments.repository';

const FIXED_DATE = new Date('2026-06-05T01:23:45.000Z');

function makeAttachmentWithDisplay(
  overrides: Partial<AttachmentWithDisplay> = {},
): AttachmentWithDisplay {
  return {
    id: 'att-1',
    fileVersionId: 'ver-1',
    taskId: 1,
    chatMessageId: null,
    attachedById: 'acc-1',
    createdAt: FIXED_DATE,
    fileVersion: {
      id: 'ver-1',
      versionNo: 2,
      byteSize: BigInt(2048),
      mimeType: 'text/csv',
      file: { id: 'file-1', name: '入荷データ.csv' },
    },
    attachedBy: { name: '田中 太郎' },
    ...overrides,
  } as AttachmentWithDisplay;
}

describe('attachments.mapper', () => {
  describe('toAttachment', () => {
    it('固定版（FileVersion）→ ファイル名/版番号/サイズ/MIME/添付者/日時 を DTO へ載せる', () => {
      const result = toAttachment(makeAttachmentWithDisplay());

      expect(result).toEqual({
        id: 'att-1',
        fileId: 'file-1',
        fileName: '入荷データ.csv',
        versionNo: 2,
        byteSize: 2048,
        mimeType: 'text/csv',
        attachedBy: '田中 太郎',
        createdAt: '2026-06-05T01:23:45.000Z',
      });
    });

    it('byteSize は BigInt → number へ変換する（JSON 化可能）', () => {
      const result = toAttachment(
        makeAttachmentWithDisplay({
          fileVersion: {
            id: 'ver-1',
            versionNo: 1,
            byteSize: BigInt(5_000_000),
            mimeType: 'application/pdf',
            file: { id: 'file-9', name: '仕様書.pdf' },
          },
        } as Partial<AttachmentWithDisplay>),
      );

      expect(result.byteSize).toBe(5_000_000);
      expect(typeof result.byteSize).toBe('number');
    });
  });
});
