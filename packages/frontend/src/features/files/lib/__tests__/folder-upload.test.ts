import { describe, it, expect, vi } from 'vitest';
import { uploadEntries, type FsEntryLike } from '../folder-upload';

/** ファイルエントリのモック。failRead=true で file() がエラーコールバックを呼ぶ。 */
function fileEntry(name: string, opts: { failRead?: boolean } = {}): FsEntryLike {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (success, error) => {
      if (opts.failRead) error?.(new Error('read fail'));
      else success(new File(['x'], name, { type: 'text/plain' }));
    },
  };
}

/** ディレクトリエントリのモック。batchSize で readEntries の分割（ページング）を再現できる。 */
function dirEntry(
  name: string,
  children: FsEntryLike[],
  opts: { batchSize?: number; failRead?: boolean } = {},
): FsEntryLike {
  const batch = opts.batchSize ?? children.length;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let i = 0;
      return {
        readEntries: (success, error) => {
          if (opts.failRead) {
            error?.(new Error('read fail'));
            return;
          }
          const slice = children.slice(i, i + batch);
          i += batch;
          success(slice);
        },
      };
    },
  };
}

/** createFolder / uploadFile のモック。失敗集合で個別に失敗させられる。 */
function makeDeps(opts: { failFolder?: Set<string>; failUpload?: Set<string> } = {}) {
  let seq = 0;
  const createdFolders: { parent: string; name: string; id: string }[] = [];
  const uploaded: { folderId: string; name: string }[] = [];
  const createFolder = vi.fn(async (parent: string, name: string) => {
    if (opts.failFolder?.has(name)) throw new Error('folder fail');
    const id = `f${++seq}`;
    createdFolders.push({ parent, name, id });
    return { id };
  });
  const uploadFile = vi.fn(async (folderId: string, file: File) => {
    if (opts.failUpload?.has(file.name)) throw new Error('upload fail');
    uploaded.push({ folderId, name: file.name });
  });
  return { deps: { createFolder, uploadFile }, createdFolders, uploaded, createFolder, uploadFile };
}

describe('uploadEntries — フォルダ階層 D&D の再帰アップロード', () => {
  it('トップレベルのファイルは root フォルダへアップロードする', async () => {
    const { deps, uploaded } = makeDeps();
    const res = await uploadEntries('root', [fileEntry('a.txt'), fileEntry('b.txt')], deps);
    expect(res.files).toBe(2);
    expect(res.folders).toBe(0);
    expect(res.failed).toBe(0);
    expect(uploaded).toEqual([
      { folderId: 'root', name: 'a.txt' },
      { folderId: 'root', name: 'b.txt' },
    ]);
  });

  it('ディレクトリは createFolder で作成し、配下ファイルを作成フォルダへ入れる', async () => {
    const { deps, createdFolders, uploaded } = makeDeps();
    const tree = [dirEntry('docs', [fileEntry('readme.md'), fileEntry('spec.md')])];
    const res = await uploadEntries('root', tree, deps);
    expect(res.folders).toBe(1);
    expect(res.files).toBe(2);
    expect(createdFolders).toEqual([{ parent: 'root', name: 'docs', id: 'f1' }]);
    expect(uploaded).toEqual([
      { folderId: 'f1', name: 'readme.md' },
      { folderId: 'f1', name: 'spec.md' },
    ]);
  });

  it('ネストした階層を親 id を引き継いで再帰展開する', async () => {
    const { deps, createdFolders, uploaded } = makeDeps();
    const tree = [dirEntry('a', [dirEntry('b', [fileEntry('deep.txt')])])];
    const res = await uploadEntries('root', tree, deps);
    expect(res.folders).toBe(2);
    expect(res.files).toBe(1);
    // a は root 配下(f1)、b は a 配下(f2)、deep.txt は b 配下(f2)。
    expect(createdFolders).toEqual([
      { parent: 'root', name: 'a', id: 'f1' },
      { parent: 'f1', name: 'b', id: 'f2' },
    ]);
    expect(uploaded).toEqual([{ folderId: 'f2', name: 'deep.txt' }]);
  });

  it('トップレベルにファイルとフォルダが混在しても両方処理する', async () => {
    const { deps, uploaded, createdFolders } = makeDeps();
    const tree = [fileEntry('top.txt'), dirEntry('sub', [fileEntry('inner.txt')])];
    const res = await uploadEntries('root', tree, deps);
    expect(res.files).toBe(2);
    expect(res.folders).toBe(1);
    expect(createdFolders).toEqual([{ parent: 'root', name: 'sub', id: 'f1' }]);
    expect(uploaded).toEqual([
      { folderId: 'root', name: 'top.txt' },
      { folderId: 'f1', name: 'inner.txt' },
    ]);
  });

  it('readEntries が分割（ページング）して返しても全件読み切る', async () => {
    const { deps, uploaded } = makeDeps();
    const children = [fileEntry('1.txt'), fileEntry('2.txt'), fileEntry('3.txt')];
    const tree = [dirEntry('big', children, { batchSize: 1 })];
    const res = await uploadEntries('root', tree, deps);
    expect(res.files).toBe(3);
    expect(uploaded.map((u) => u.name)).toEqual(['1.txt', '2.txt', '3.txt']);
  });

  it('ファイルアップロード失敗は集計して継続する（ベストエフォート）', async () => {
    const { deps } = makeDeps({ failUpload: new Set(['bad.txt']) });
    const tree = [dirEntry('d', [fileEntry('ok.txt'), fileEntry('bad.txt')])];
    const res = await uploadEntries('root', tree, deps);
    expect(res.files).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.failedPaths).toEqual(['d/bad.txt']);
    // 応答が理由を返さない失敗は汎用文言へ倒す（v2-191）。理由を出す経路は下のテストで固定する。
    expect(res.failedReasons).toEqual({ 'd/bad.txt': '原因を特定できませんでした' });
  });

  it('サーバーが返した拒否理由を失敗パスごとに残す（v2-191）', async () => {
    const { deps } = makeDeps();
    // axios のエラー形状（response.data.error.message）で返す＝実際の API クライアントと同じ形。
    const rejection = {
      response: {
        data: {
          error: { message: '実行形式（.exe や .dll など）のファイルはアップロードできません' },
        },
      },
    };
    const uploadFile = vi.fn(async (_folderId: string, file: File) => {
      if (file.name === 'bad.exe') throw rejection;
    });
    const tree = [dirEntry('d', [fileEntry('ok.txt'), fileEntry('bad.exe')])];

    const res = await uploadEntries('root', tree, { ...deps, uploadFile });

    expect(res.failed).toBe(1);
    expect(res.failedReasons).toEqual({
      'd/bad.exe': '実行形式（.exe や .dll など）のファイルはアップロードできません',
    });
  });

  it('サーバー側の想定外（5xx）の汎用英文は日本語の理由に置き換えて残す（v2-191）', async () => {
    const { deps } = makeDeps();
    const rejection = {
      response: {
        status: 500,
        data: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      },
    };
    const uploadFile = vi.fn(async (_folderId: string, file: File) => {
      if (file.name === 'bad.txt') throw rejection;
    });
    const tree = [dirEntry('d', [fileEntry('ok.txt'), fileEntry('bad.txt')])];

    const res = await uploadEntries('root', tree, { ...deps, uploadFile });

    expect(res.failedReasons).toEqual({
      'd/bad.txt': 'サーバー側でエラーが発生しました。時間をおいてもう一度お試しください',
    });
  });

  it('理由を持たない失敗（上限・読み取り失敗）は failedReasons に載せない', async () => {
    const { deps } = makeDeps({ failFolder: new Set(['locked']) });
    const tree = [dirEntry('locked', [fileEntry('never.txt')])];

    const res = await uploadEntries('root', tree, deps);

    expect(res.failedPaths).toEqual(['locked/']);
    expect(res.failedReasons).toEqual({});
  });

  it('フォルダ作成失敗時は配下を辿らず、失敗パスを末尾 / で記録する', async () => {
    const { deps, uploadFile } = makeDeps({ failFolder: new Set(['locked']) });
    const tree = [dirEntry('locked', [fileEntry('never.txt')])];
    const res = await uploadEntries('root', tree, deps);
    expect(res.folders).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.failedPaths).toEqual(['locked/']);
    // 作成できなかったので配下ファイルのアップロードは試みない。
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('子エントリ読み取りが reject してもベストエフォートで継続し失敗記録する（rejection を伝播させない）', async () => {
    const { deps, createdFolders } = makeDeps();
    // フォルダ作成は成功するが readEntries がエラーを返すディレクトリ。
    const tree = [dirEntry('unreadable', [fileEntry('never.txt')], { failRead: true })];
    // uploadEntries 自体が reject しないこと（await が解決すること）を確認する。
    const res = await uploadEntries('root', tree, deps);
    expect(res.folders).toBe(1); // フォルダは作成済み
    expect(res.failed).toBe(1); // 子読み取り失敗を記録
    expect(res.failedPaths).toEqual(['unreadable/']);
    expect(createdFolders).toEqual([{ parent: 'root', name: 'unreadable', id: 'f1' }]);
  });

  it('ファイルでもディレクトリでもないエントリは黙殺せず失敗に記録する', async () => {
    const { deps } = makeDeps();
    const weird: FsEntryLike = { isFile: false, isDirectory: false, name: 'link' };
    const res = await uploadEntries('root', [weird], deps);
    expect(res.failed).toBe(1);
    expect(res.failedPaths).toEqual(['link']);
    expect(res.files).toBe(0);
    expect(res.folders).toBe(0);
  });

  it('onProgress が成功/失敗の度に累計を通知する', async () => {
    const onProgress = vi.fn();
    const { deps } = makeDeps();
    const tree = [dirEntry('d', [fileEntry('x.txt')])];
    await uploadEntries('root', tree, { ...deps, onProgress });
    // フォルダ作成で1回 + ファイル成功で1回。
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ folders: 1, files: 1, failed: 0 });
  });
});

describe('uploadEntries — 上限ハードニング（fil-0056・自己 DoS 対策）', () => {
  it('総ファイル上限に達したら以降を中断し limited 理由を載せる', async () => {
    const { deps, uploaded } = makeDeps();
    const tree = [fileEntry('1.txt'), fileEntry('2.txt'), fileEntry('3.txt')];
    const res = await uploadEntries('root', tree, { ...deps, limits: { maxTotalFiles: 2 } });
    expect(res.files).toBe(2);
    expect(uploaded.map((u) => u.name)).toEqual(['1.txt', '2.txt']);
    expect(res.limited).toMatch(/ファイル数が上限/);
  });

  it('深さ上限を超えるフォルダは配下を辿らず失敗記録＋limited を載せる', async () => {
    const { deps } = makeDeps();
    // a(depth0)→b(depth1)。maxDepth:1 で b が拒否される。
    const tree = [dirEntry('a', [dirEntry('b', [fileEntry('deep.txt')])])];
    const res = await uploadEntries('root', tree, { ...deps, limits: { maxDepth: 1 } });
    expect(res.folders).toBe(1); // a のみ作成、b は拒否
    expect(res.files).toBe(0); // deep.txt まで辿らない
    expect(res.failedPaths).toContain('a/b/');
    expect(res.limited).toMatch(/フォルダ階層が上限/);
  });

  it('総フォルダ上限に達したら以降の作成を中断し limited を載せる（フォルダのみツリーの DoS 防御）', async () => {
    const { deps } = makeDeps();
    const tree = [dirEntry('a', []), dirEntry('b', [])];
    const res = await uploadEntries('root', tree, { ...deps, limits: { maxTotalFolders: 1 } });
    expect(res.folders).toBe(1); // a のみ作成、b は中断
    expect(res.limited).toMatch(/フォルダ数が上限/);
  });

  it('1フォルダの項目数上限を超えたら配下を諦め limited を載せる', async () => {
    const { deps } = makeDeps();
    const big = dirEntry('big', [fileEntry('1.txt'), fileEntry('2.txt'), fileEntry('3.txt')]);
    const res = await uploadEntries('root', [big], { ...deps, limits: { maxChildrenPerDir: 2 } });
    expect(res.folders).toBe(1); // big は作成済み
    expect(res.files).toBe(0); // 上限超過で配下を読まない
    expect(res.failedPaths).toContain('big/');
    expect(res.limited).toMatch(/項目数が上限/);
  });

  it('failedPaths は maxFailedPaths で truncate するが failed カウントは全件保持する', async () => {
    const names = ['1.txt', '2.txt', '3.txt', '4.txt'];
    const { deps } = makeDeps({ failUpload: new Set(names) });
    const tree = names.map((n) => fileEntry(n));
    const res = await uploadEntries('root', tree, { ...deps, limits: { maxFailedPaths: 2 } });
    expect(res.failed).toBe(4); // 全件カウント
    expect(res.failedPaths).toHaveLength(2); // 配列は truncate
  });
});
