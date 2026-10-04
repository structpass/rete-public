import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// apiClient をモックし、downloadAttachment が blob 取得 → object URL → アンカー保存を踏むことを検証する。
// cmn-0146: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  default: { get: (...a: unknown[]) => get(...a) },
}));

import { downloadAttachment } from '../lib/download-attachment';

describe('downloadAttachment（dsk-0251）', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: { mockRestore: () => void };
  let createElementSpy: { mockRestore: () => void };
  const created: HTMLAnchorElement[] = [];

  beforeEach(() => {
    // revoke は共有 saveBlobAsFile(blob, name, 0) の setTimeout(0) 越しに走るため、fake timer で
    // 発火を制御し assert 可能にする（v2-234 で手組みから共有ヘルパへ置換・遅延幅は従来どおり）。
    vi.useFakeTimers();
    get.mockReset();
    created.length = 0;
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    // jsdom は URL.createObjectURL を実装しないため差し込む。
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const orig = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === 'a') created.push(el as HTMLAnchorElement);
      return el;
    });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    createElementSpy.mockRestore();
    vi.useRealTimers();
  });

  it('GET /files/files/:id/download を blob で叩き、ファイル名付きでアンカー保存を起動すること', async () => {
    const blob = new Blob(['data']);
    get.mockResolvedValue({ data: blob });

    await downloadAttachment({ fileId: 'f1', fileName: '設計書.pdf' });

    expect(get).toHaveBeenCalledWith('/files/files/f1/download', { responseType: 'blob' });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(created).toHaveLength(1);
    expect(created[0].download).toBe('設計書.pdf');
    expect(created[0].href).toContain('blob:mock-url');
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // revoke は次 tick（setTimeout 0）まで走らない → object URL リーク防止が確かに踏まれることを検証。
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('apiClient が失敗したら reject を伝播すること（呼び出し側で握る）', async () => {
    get.mockRejectedValue(new Error('boom'));
    await expect(downloadAttachment({ fileId: 'f2', fileName: 'x.png' })).rejects.toThrow('boom');
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
