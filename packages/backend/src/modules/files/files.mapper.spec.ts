import {
  toFolderTree,
  toFolderContent,
  toUploadedFileRow,
  toFileSettings,
  toFileMeta,
} from './files.mapper';
import {
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_REJECTED_EXTENSIONS,
  FIXED_REJECTED_EXTENSIONS,
} from './files.constants';
import {
  makeFolderEntity,
  makeFolderWithTags,
  makeFileEntity,
  makeFileWithLatestVersion,
  makeFileVersionEntity,
  makeFileSettingsEntity,
  makeTagEntity,
} from '../../__tests__/factories';

describe('files.mapper', () => {
  describe('toFolderTree', () => {
    it('parentFolderId=null を root に、子を親の children へネストする', () => {
      const root = makeFolderEntity({ id: 'r', name: 'リポジトリ', parentFolderId: null });
      const child = makeFolderEntity({ id: 'c', name: '受入', parentFolderId: 'r' });
      const grandchild = makeFolderEntity({ id: 'g', name: 'メモ', parentFolderId: 'c' });

      const result = toFolderTree([root, child, grandchild]);

      expect(result.roots).toHaveLength(1);
      expect(result.roots[0]).toMatchObject({ id: 'r', name: 'リポジトリ' });
      expect(result.roots[0].children[0]).toMatchObject({ id: 'c', name: '受入' });
      expect(result.roots[0].children[0].children[0]).toMatchObject({ id: 'g', name: 'メモ' });
    });

    it('兄弟順は入力配列の順序を保持する', () => {
      const root = makeFolderEntity({ id: 'r', parentFolderId: null });
      const a = makeFolderEntity({ id: 'a', name: 'A', parentFolderId: 'r' });
      const b = makeFolderEntity({ id: 'b', name: 'B', parentFolderId: 'r' });

      const result = toFolderTree([root, a, b]);

      expect(result.roots[0].children.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('空配列なら roots は空', () => {
      expect(toFolderTree([])).toEqual({ roots: [] });
    });
  });

  describe('toFolderContent', () => {
    it('crumb は祖先（root→対象）をそのまま id/name で返す', () => {
      const folder = makeFolderEntity({ id: 'f', name: '在庫アラート検討' });
      const ancestors = [
        { id: 'root', name: '中央倉庫PJ' },
        { id: 'f', name: '在庫アラート検討' },
      ];

      const result = toFolderContent(folder, [], [], ancestors);

      expect(result.crumb).toEqual([
        { id: 'root', name: '中央倉庫PJ' },
        { id: 'f', name: '在庫アラート検討' },
      ]);
    });

    it('items はサブフォルダ → ファイルの順（フォルダ優先）', () => {
      const folder = makeFolderEntity({ id: 'f' });
      const sub = makeFolderWithTags({ id: 'sub', name: '議事録', parentFolderId: 'f' });
      const file = makeFileWithLatestVersion({ id: 'file-x', name: 'メモ.md', folderId: 'f' });

      const result = toFolderContent(folder, [sub], [file], []);

      expect(result.items.map((i) => i.kind)).toEqual(['folder', 'file']);
      expect(result.items[0]).toMatchObject({
        kind: 'folder',
        id: 'sub',
        name: '議事録',
        versionNo: null,
        byteSize: null,
      });
    });

    it('ファイル行は最新版から versionNo / updatedBy / byteSize / updatedAt(ISO) を載せる', () => {
      const folder = makeFolderEntity({ id: 'f' });
      const file = makeFileWithLatestVersion(
        { id: 'file-x', name: '設計.md', folderId: 'f' },
        '佐藤花子',
        { versionNo: 3, byteSize: BigInt(4096), createdAt: new Date('2026-06-01T10:00:00.000Z') },
      );

      const result = toFolderContent(folder, [], [file], []);

      expect(result.items[0]).toMatchObject({
        kind: 'file',
        id: 'file-x',
        name: '設計.md',
        versionNo: 3,
        updatedBy: '佐藤花子',
        byteSize: 4096,
        updatedAt: '2026-06-01T10:00:00.000Z',
      });
    });

    it('版が無いファイル（実体未保存）は versionNo/updatedBy/byteSize=null・updatedAt は file.updatedAt にフォールバック', () => {
      const folder = makeFolderEntity({ id: 'f' });
      const file = makeFileWithLatestVersion({ id: 'file-x', folderId: 'f' });
      file.versions = [];

      const result = toFolderContent(folder, [], [file], []);

      expect(result.items[0]).toMatchObject({ versionNo: null, updatedBy: null, byteSize: null });
      expect(result.items[0].updatedAt).toBe(file.updatedAt.toISOString());
    });

    it('フォルダ行の updatedAt は folder.updatedAt 由来（cmn-0295・意図的な非対称の境界）', () => {
      // ファイル行が最新版 createdAt 由来なのに対し、フォルダ行は folder.updatedAt 由来であることを固定する。
      // folder.updatedAt を未来日に設定し、ファイル側に最新版（versions に 1 件）を入れた状態で
      // DTO 出力を見る＝フォルダ行は file.versions と無関係に folder.updatedAt を反映することを assert
      // する（toFolderRow が最新版経路を一切経由しないことの裏返し）。
      const folderUpdatedAt = new Date('2026-07-20T08:00:00.000Z');
      const folder = makeFolderEntity({ id: 'f' });
      const sub = makeFolderWithTags({
        id: 'folder-x',
        name: '設計メモ',
        parentFolderId: 'f',
        updatedAt: folderUpdatedAt,
      });
      const file = makeFileWithLatestVersion(
        { id: 'file-x', name: '設計.md', folderId: 'f' },
        '佐藤花子',
        { versionNo: 1, byteSize: BigInt(1024), createdAt: new Date('2026-06-01T10:00:00.000Z') },
      );

      const result = toFolderContent(folder, [sub], [file], []);

      const folderRow = result.items.find((i) => i.kind === 'folder');
      expect(folderRow).toBeDefined();
      expect(folderRow!.updatedAt).toBe(folderUpdatedAt.toISOString());
      // ファイル行は最新版由来（このテストの主題ではないが、非対称が崩れていないことの確認）
      const fileRow = result.items.find((i) => i.kind === 'file');
      expect(fileRow!.updatedAt).toBe('2026-06-01T10:00:00.000Z');
    });
  });

  describe('toUploadedFileRow', () => {
    it('アップロード結果（File + 新版 + アップロード者名）を file 行 DTO 化する', () => {
      const version = {
        ...makeFileVersionEntity({
          versionNo: 2,
          byteSize: BigInt(8192),
          createdAt: new Date('2026-06-04T09:30:00.000Z'),
        }),
        uploadedBy: { name: '田中一郎' },
      };

      const row = toUploadedFileRow('file-9', '提案書.pptx', version);

      expect(row).toEqual({
        kind: 'file',
        id: 'file-9',
        name: '提案書.pptx',
        versionNo: 2,
        updatedBy: '田中一郎',
        byteSize: 8192,
        updatedAt: '2026-06-04T09:30:00.000Z',
        // アップロード応答はタグを伴わない（一覧再取得で反映）。
        tags: [],
      });
    });
  });

  describe('toFileRow（一覧行のタグ列 / rete-files-0006）', () => {
    it('file 行は付与タグ（FileTag→Tag）を TagDto 配列で載せる', () => {
      const folder = makeFolderEntity({ id: 'f' });
      const file = makeFileWithLatestVersion(
        { id: 'file-x', name: 'メモ.md', folderId: 'f' },
        '山田太郎',
        {},
        [
          makeTagEntity({ id: 't1', name: '重要', icon: 'Star', color: 'red' }),
          makeTagEntity({ id: 't2', name: '請求', icon: 'Flag', color: 'blue' }),
        ],
      );

      const result = toFolderContent(folder, [], [file], []);

      expect(result.items[0].tags).toEqual([
        { id: 't1', name: '重要', icon: 'Star', color: 'red', archived: false },
        { id: 't2', name: '請求', icon: 'Flag', color: 'blue', archived: false },
      ]);
    });

    it('folder 行は付与タグ（FolderTag→Tag）を TagDto 配列で載せる（rete-files-0033）', () => {
      const folder = makeFolderEntity({ id: 'f' });
      const sub = makeFolderWithTags({ id: 'sub', name: '議事録', parentFolderId: 'f' }, [
        makeTagEntity({ id: 't9', name: '機密', icon: 'Lock', color: 'amber' }),
      ]);

      const result = toFolderContent(folder, [sub], [], []);

      expect(result.items[0]).toMatchObject({ kind: 'folder', id: 'sub' });
      expect(result.items[0].tags).toEqual([
        { id: 't9', name: '機密', icon: 'Lock', color: 'amber', archived: false },
      ]);
    });

    it('タグ未付与の folder 行の tags は空配列', () => {
      const folder = makeFolderEntity({ id: 'f' });
      const sub = makeFolderWithTags({ id: 'sub', name: '議事録', parentFolderId: 'f' });

      const result = toFolderContent(folder, [sub], [], []);

      expect(result.items[0].tags).toEqual([]);
    });
  });

  describe('toFileSettings', () => {
    it('entity を DTO へ写す（maxSizeBytes は Number 化・固定分はコード定数）', () => {
      const entity = makeFileSettingsEntity({
        maxSizeBytes: BigInt(5242880),
        allowedExtensions: ['.pdf'],
      });

      expect(toFileSettings(entity)).toEqual({
        maxSizeBytes: 5242880,
        allowedExtensions: ['.pdf'],
        fixedRejectedExtensions: [...FIXED_REJECTED_EXTENSIONS],
        rejectedExtensions: [],
      });
    });

    it('追加分（v2-197）は entity の値をそのまま写す', () => {
      const entity = makeFileSettingsEntity({ rejectedExtensions: ['.ps1', '.sh'] });

      expect(toFileSettings(entity).rejectedExtensions).toEqual(['.ps1', '.sh']);
    });

    it('固定分（要求版2）は DB ではなくコード定数を載せる（設定行があっても同じ）', () => {
      const entity = makeFileSettingsEntity({ rejectedExtensions: [] });

      expect(toFileSettings(entity).fixedRejectedExtensions).toEqual([
        ...FIXED_REJECTED_EXTENSIONS,
      ]);
    });

    it('null（未設定）は app 既定（hard cap / 全許可 / 固定分 / 既定の追加分）へフォールバックする', () => {
      expect(toFileSettings(null)).toEqual({
        maxSizeBytes: DEFAULT_MAX_SIZE_BYTES,
        allowedExtensions: [],
        fixedRejectedExtensions: [...FIXED_REJECTED_EXTENSIONS],
        rejectedExtensions: [...DEFAULT_REJECTED_EXTENSIONS],
      });
    });

    it('null の既定拒否拡張子は共有配列を漏らさない（返り値を書き換えても定数は不変）', () => {
      const dto = toFileSettings(null);
      dto.rejectedExtensions.push('.zzz');
      dto.fixedRejectedExtensions.push('.zzz');

      expect(DEFAULT_REJECTED_EXTENSIONS).not.toContain('.zzz');
      expect(FIXED_REJECTED_EXTENSIONS).not.toContain('.zzz');
    });
  });

  describe('toFileMeta（FF お気に入り編集のメタ DTO）', () => {
    it('id / name / folderId と最新版番号を載せる', () => {
      const file = makeFileEntity({ id: 'file-7', name: '見積.xlsx', folderId: 'folder-3' });

      expect(toFileMeta(file, 4)).toEqual({
        id: 'file-7',
        name: '見積.xlsx',
        folderId: 'folder-3',
        versionNo: 4,
      });
    });

    it('版が無い（実体未保存）ファイルは versionNo=null', () => {
      const file = makeFileEntity({ id: 'file-7', name: '空.txt', folderId: 'folder-3' });

      expect(toFileMeta(file, 0)).toMatchObject({ versionNo: null });
    });
  });
});
