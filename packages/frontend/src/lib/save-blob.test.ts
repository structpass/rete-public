import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveBlobAsFile } from './save-blob';

// v2-234: 共有ヘルパの revoke 契約（省略時=click 直後 / 数値=遅延 ms）を固定する。
// 呼び出し側の従来挙動（files の DL=1000ms・desk の添付 DL=0ms・CSV 出力=即時）が
// この契約に依存しているため、既定を遅延側へ倒すと既存導線の挙動差になる。
describe('saveBlobAsFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: { mockRestore: () => void };
  const created: HTMLAnchorElement[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    created.length = 0;
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    // jsdom は URL.createObjectURL を実装しないため差し込む。
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const orig = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag);
      if (tag === 'a') created.push(el as HTMLAnchorElement);
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('blob を object URL 経由でファイル名付き保存し、既定では click 直後に解放する', () => {
    const blob = new Blob(['x']);

    saveBlobAsFile(blob, '一覧.csv');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(created).toHaveLength(1);
    expect(created[0].download).toBe('一覧.csv');
    expect(created[0].href).toContain('blob:mock-url');
    expect(created[0].isConnected).toBe(false);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokeDelayMs=0 は次 tick まで解放しない（desk 添付 DL の従来挙動）', async () => {
    saveBlobAsFile(new Blob(['x']), '添付.pdf', 0);

    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokeDelayMs=1000 は 1000ms 経過まで解放しない（files DL の従来挙動）', async () => {
    saveBlobAsFile(new Blob(['x']), '報告書.pdf', 1000);

    await vi.advanceTimersByTimeAsync(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
