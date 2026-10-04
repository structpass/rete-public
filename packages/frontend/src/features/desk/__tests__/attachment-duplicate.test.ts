import { describe, it, expect } from 'vitest';
import { findDuplicateAttachmentName } from '../lib/attachment-duplicate';
import type { Attachment } from '../lib/api';

const att = (id: string, name: string, versionNo = 1): Attachment => ({
  id,
  fileId: `f-${id}`,
  fileName: name,
  versionNo,
  byteSize: 10,
  mimeType: 'application/pdf',
  attachedBy: '山田',
  createdAt: '2026-06-01T00:00:00.000Z',
});

describe('findDuplicateAttachmentName（dsk-0273）', () => {
  it('確定済み添付と同名なら該当添付を返すこと', () => {
    const list = [att('a', '仕様.pdf'), att('b', '図面.png')];
    expect(findDuplicateAttachmentName(list, '図面.png')).toBe(list[1]);
  });

  it('同名が無ければ undefined を返すこと', () => {
    expect(findDuplicateAttachmentName([att('a', '仕様.pdf')], '別図面.png')).toBeUndefined();
  });

  it('保留チップ（pending- id・versionNo 0）は比較対象に含めないこと（確定済み限定・dsk-0273 スコープ）', () => {
    const pending = { ...att('x', '保留分.pdf', 0), id: 'pending-f-x' };
    expect(findDuplicateAttachmentName([pending], '保留分.pdf')).toBeUndefined();
  });

  it('空一覧では undefined を返すこと', () => {
    expect(findDuplicateAttachmentName([], '仕様.pdf')).toBeUndefined();
  });
});
