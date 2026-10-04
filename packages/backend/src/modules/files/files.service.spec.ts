import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_CHANNEL_ID } from '@rete/shared';
import { createReadStream } from 'fs';
// consistent-type-imports（3c152fe6 で error 化）はインライン `import()` 型注釈を禁じるため、
// jest.mock factory の requireActual へ渡す型は名前空間の型インポートで受ける。
// 型は実行時に消えるので jest.mock の out-of-scope 変数参照の制約には掛からない。
import type { ReadStream } from 'fs';
import type * as FsModule from 'fs';
import type * as FsPromisesModule from 'fs/promises';
import { unlink, open } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';

// diskStorage 経路テスト（fil-0121）が「一時ファイル読み出し・削除」を検証できるよう、fs の該当関数だけ
// モックへ差し替える。実ディスク書き込みは並列実行環境で非決定的に EPERM/ENOENT になるため使わない。
// namespace import 経由の spyOn は getter が configurable:false で失敗するため、factory で解決する。
jest.mock('fs', () => ({
  ...jest.requireActual<typeof FsModule>('fs'),
  createReadStream: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  ...jest.requireActual<typeof FsPromisesModule>('fs/promises'),
  unlink: jest.fn(),
  // fil-0140 内容署名検査: diskStorage 経路のテストで temp ファイルの open/read をモックし、任意バイト列を返す。
  open: jest.fn(),
}));
import { FilesService, extensionDecisionName, extensionForDecision } from './files.service';
import { FilesRepository } from './repositories/files.repository';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';
import { StorageService } from './storage/storage.service';
import {
  makeFolderEntity,
  makeFolderWithTags,
  makeFileEntity,
  makeFileVersionEntity,
  makeFileWithLatestVersion,
  makeFileSettingsEntity,
  makeTagEntity,
} from '../../__tests__/factories';
import {
  DEFAULT_MAX_SIZE_BYTES,
  DEFAULT_REJECTED_EXTENSIONS,
  FIXED_REJECTED_EXTENSIONS,
  FOLDER_DEPTH_EXCEEDED_MESSAGE,
  SINGLE_TARGET_NOT_FOUND_MESSAGE,
  resolveUploadTempDir,
} from './files.constants';

const mockRepo = {
  findAllFolders: jest.fn(),
  findFolderById: jest.fn(),
  searchFolders: jest.fn(),
  searchFiles: jest.fn(),
  findSubfolders: jest.fn(),
  findFilesWithLatestVersion: jest.fn(),
  findFileByFolderAndName: jest.fn(),
  getMaxVersionNo: jest.fn(),
  createFileWithInitialVersion: jest.fn(),
  addFileVersion: jest.fn(),
  findLatestVersionWithFile: jest.fn(),
  findVersionWithFile: jest.fn(),
  findSettings: jest.fn(),
  upsertSettings: jest.fn(),
  findFileById: jest.fn(),
  findFolderByParentAndName: jest.fn(),
  createFolder: jest.fn(),
  moveFolderAtomic: jest.fn(),
  moveFileAtomic: jest.fn(),
  findFileWithAllVersions: jest.fn(),
  deleteFile: jest.fn(),
  deleteEmptyFolder: jest.fn(),
  findFileWithTags: jest.fn(),
  countTagsByIds: jest.fn(),
  setFileTags: jest.fn(),
  findFolderWithTags: jest.fn(),
  setFolderTags: jest.fn(),
  assignTagsBatch: jest.fn(),
  findFileSpaceRefs: jest.fn(),
  searchFilesByTags: jest.fn(),
  searchFoldersByTags: jest.fn(),
  // 可視性判定（ADR 0063）の解決素材。
  findFolderSpaceIds: jest.fn(),
};

/**
 * 操作主体（ADR 0063）。可視性判定の入力は accountId だけになったので system Role は持たない
 * （「ADMIN は全フォルダを見られる」バイパスは廃止＝ADMIN も所属 Space だけが見える）。
 */
type ActorUser = { id: string };
function admin(id = 'account-1'): ActorUser {
  return { id };
}
const ADMIN: ActorUser = admin();
const MEMBER: ActorUser = { id: 'member-1' };

/**
 * 可視性判定（ScopeVisibilityService）。既定は「既定チャネルだけが見える」で、非可視ケースは
 * 各テストで resolveVisibleSpaceIds / canAccessSpace を上書きする。
 */
const mockScope = {
  resolveVisibleSpaceIds: jest.fn(),
  canAccessSpace: jest.fn(),
  assertVisibleOr404: jest.fn(),
};

const mockStorage = {
  write: jest.fn(),
  createReadStream: jest.fn(),
  delete: jest.fn(),
};

function makeUpload(
  overrides: Partial<{
    originalname: string;
    buffer: Buffer;
    size: number;
    mimetype: string;
    path?: string;
  }> = {},
) {
  return {
    originalname: 'メモ.md',
    buffer: Buffer.from('本文'),
    size: 6,
    mimetype: 'text/markdown',
    ...overrides,
  };
}

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: FilesRepository, useValue: mockRepo },
        { provide: StorageService, useValue: mockStorage },
        { provide: ScopeVisibilityService, useValue: mockScope },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
    // storage の write/delete は Promise を返す（service が await / .catch する）。
    mockStorage.write.mockResolvedValue(undefined);
    mockStorage.delete.mockResolvedValue(undefined);
    // 既定は「設定行なし」＝ app 既定（hard cap / 全許可）。個別テストで上書きする。
    mockRepo.findSettings.mockResolvedValue(null);
    // 可視性の既定は「既定チャネルだけが見える」。makeFolderEntity の spaceId も同値なので、
    // 権限に関心のないケースは素の振る舞いだけを見られる（非可視ケースは各テストで上書きする）。
    mockScope.resolveVisibleSpaceIds.mockResolvedValue([DEFAULT_CHANNEL_ID]);
    mockScope.canAccessSpace.mockResolvedValue(true);
    mockScope.assertVisibleOr404.mockResolvedValue(undefined);
    // 可視性判定は対象フォルダの spaceId を見る（ADR 0063）。既定は「既定チャネルにある可視フォルダ」
    // ＝権限に関心のないケースが素通りする状態。不在ケースは各テストで null を返させる。
    mockRepo.findFolderById.mockResolvedValue(makeFolderEntity());
    // 一括操作の可視性判定素材。既定は「渡した id が全て既定チャネルに実在する」＝可視。
    mockRepo.findFolderSpaceIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, spaceId: DEFAULT_CHANNEL_ID }))),
    );
    // fil-0146: ファイル側も対称の既定（渡した id が全て既定チャネルの folder-1 に実在する）。
    mockRepo.findFileSpaceRefs.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, folderId: 'folder-1', spaceId: DEFAULT_CHANNEL_ID }))),
    );
  });

  describe('getTree', () => {
    it('全フォルダ取得 → ネストツリー DTO を { success, data } で返す', async () => {
      const root = makeFolderEntity({ id: 'r', parentFolderId: null });
      const child = makeFolderEntity({ id: 'c', parentFolderId: 'r' });
      mockRepo.findAllFolders.mockResolvedValue([root, child]);

      const result = await service.getTree(ADMIN, DEFAULT_CHANNEL_ID);

      expect(result.success).toBe(true);
      expect(result.data.roots).toHaveLength(1);
      expect(result.data.roots[0].children[0].id).toBe('c');
    });
  });

  describe('search（横断検索 / rete-files-0004）', () => {
    it('空クエリ（trim 後 0 文字）は DB を叩かず空結果を返す', async () => {
      const res = await service.search('   ', ADMIN);
      expect(res.data).toEqual({ query: '', items: [] });
      expect(mockRepo.searchFolders).not.toHaveBeenCalled();
      expect(mockRepo.searchFiles).not.toHaveBeenCalled();
    });

    it('未指定（undefined）でも空結果を返す', async () => {
      const res = await service.search(undefined, ADMIN);
      expect(res.data).toEqual({ query: '', items: [] });
      expect(mockRepo.searchFiles).not.toHaveBeenCalled();
    });

    it('フォルダ → ファイルの順でヒットを返し、parentFolderId を移動元の親として載せる', async () => {
      const folder = makeFolderEntity({ id: 'fd', name: '請求 2026', parentFolderId: 'root' });
      const file = makeFileEntity({ id: 'fl', name: '請求書.pdf', folderId: 'sub' });
      mockRepo.searchFolders.mockResolvedValue([folder]);
      mockRepo.searchFiles.mockResolvedValue([file]);

      const res = await service.search('  請求  ', ADMIN);

      // 検索は可視 space の集合で DB 側から絞る（ADR 0063）。
      expect(mockRepo.searchFolders).toHaveBeenCalledWith('請求', [DEFAULT_CHANNEL_ID]);
      expect(mockRepo.searchFiles).toHaveBeenCalledWith('請求', [DEFAULT_CHANNEL_ID]);
      expect(res.data.query).toBe('請求');
      expect(res.data.items).toEqual([
        { kind: 'folder', id: 'fd', name: '請求 2026', parentFolderId: 'root' },
        { kind: 'file', id: 'fl', name: '請求書.pdf', parentFolderId: 'sub' },
      ]);
    });
  });

  describe('getFolderContent', () => {
    it('対象不在なら NotFoundException（warn は出さない・fil-0146）', async () => {
      mockRepo.findFolderById.mockResolvedValue(null);
      // 可視性判定（visibleSpaceIds）は不在フォルダでも一度通る（fil-0146・timing oracle 残差の解消）。
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(service.getFolderContent('missing', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.findSubfolders).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('パンくず + サブフォルダ/ファイルを DTO 化して返す', async () => {
      const folder = makeFolderEntity({ id: 'f', name: '在庫アラート検討' });
      mockRepo.findFolderById.mockResolvedValue(folder);
      mockRepo.findSubfolders.mockResolvedValue([
        makeFolderWithTags({ id: 'sub', name: '議事録' }),
      ]);
      mockRepo.findFilesWithLatestVersion.mockResolvedValue([
        makeFileWithLatestVersion({ id: 'file-x', name: 'メモ.md' }),
      ]);
      // crumb は同一 space の全フォルダ 1 回ロードから組む（ADR 0063）。
      mockRepo.findAllFolders.mockResolvedValue([
        makeFolderEntity({ id: 'f', name: '在庫アラート検討' }),
        makeFolderEntity({ id: 'sub', name: '議事録', parentFolderId: 'f' }),
      ]);

      const result = await service.getFolderContent('f', ADMIN);

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('f');
      expect(result.data.crumb).toEqual([{ id: 'f', name: '在庫アラート検討' }]);
      expect(result.data.items.map((i) => i.kind)).toEqual(['folder', 'file']);
      // サブフォルダ / ファイルは同一 id で取得する（取得対象の一致を固定）。
      expect(mockRepo.findSubfolders).toHaveBeenCalledWith('f');
      expect(mockRepo.findFilesWithLatestVersion).toHaveBeenCalledWith('f');
    });
  });

  describe('uploadFile', () => {
    it('ファイル未指定なら BadRequest（storage / repo に触れない）', async () => {
      await expect(
        service.uploadFile('folder-1', undefined, admin('account-1')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('フォルダ不在なら NotFound（実体保存しない）', async () => {
      mockRepo.findFolderById.mockResolvedValue(null);

      await expect(
        service.uploadFile('missing', makeUpload(), admin('account-1')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('新規ファイル: 実体保存 → File+初版(versionNo=1)を作成し file 行 DTO を返す', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockImplementation(({ fileId, name, version }) => ({
        ...makeFileEntity({ id: fileId, name }),
        versions: [{ ...makeFileVersionEntity(version), uploadedBy: { name: '山田太郎' } }],
      }));

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: '提案.md', size: 12 }),
        admin('account-1'),
      );

      expect(mockStorage.write).toHaveBeenCalledTimes(1);
      const createArgs = mockRepo.createFileWithInitialVersion.mock.calls[0][0];
      expect(createArgs.version.versionNo).toBe(1);
      expect(createArgs.version.byteSize).toBe(BigInt(12));
      expect(createArgs.version.uploadedById).toBe('account-1');
      // storageKey は <fileId>/<versionId> 形式で、実体保存の key と DB の storageKey が一致する。
      expect(createArgs.version.storageKey).toBe(`${createArgs.fileId}/${createArgs.version.id}`);
      expect(mockStorage.write).toHaveBeenCalledWith(
        createArgs.version.storageKey,
        expect.any(Buffer),
      );
      expect(result.data).toMatchObject({
        kind: 'file',
        name: '提案.md',
        versionNo: 1,
        byteSize: 12,
      });
    });

    it('multer が latin1 で誤デコードした日本語ファイル名を UTF-8 に正規化して保存する', async () => {
      // multer/FileInterceptor は multipart のファイル名を latin1 でデコードするため、日本語名は
      // UTF-8 バイト列が latin1 として読まれた「化けた」文字列で届く。これを再現する。
      const garbled = Buffer.from('請求書の控え.md', 'utf8').toString('latin1');
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockImplementation(({ fileId, name, version }) => ({
        ...makeFileEntity({ id: fileId, name }),
        versions: [{ ...makeFileVersionEntity(version), uploadedBy: { name: '山田太郎' } }],
      }));

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: garbled, size: 8 }),
        admin('account-1'),
      );

      // 同名検索・保存名ともに正規化後の正しい UTF-8 名で行われる（化けたまま保存しない）。
      expect(mockRepo.findFileByFolderAndName).toHaveBeenCalledWith('folder-1', '請求書の控え.md');
      expect(mockRepo.createFileWithInitialVersion.mock.calls[0][0].name).toBe('請求書の控え.md');
      expect(result.data).toMatchObject({ kind: 'file', name: '請求書の控え.md' });
    });

    it('パス成分・null バイト・制御文字を除去した basename で保存する（パストラバーサル防止）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockImplementation(({ fileId, name, version }) => ({
        ...makeFileEntity({ id: fileId, name }),
        versions: [{ ...makeFileVersionEntity(version), uploadedBy: { name: '山田太郎' } }],
      }));

      const result = await service.uploadFile(
        'folder-1',
        // null バイト + パス区切りを含む入力（ソースに制御文字を埋め込まず構築する）。
        makeUpload({ originalname: '../../etc/pass' + String.fromCharCode(0) + 'wd.md', size: 4 }),
        admin('account-1'),
      );

      expect(mockRepo.createFileWithInitialVersion.mock.calls[0][0].name).toBe('passwd.md');
      expect(result.data).toMatchObject({ kind: 'file', name: 'passwd.md' });
    });

    it('サニタイズ後に空になるファイル名は BadRequest で弾き、実体保存しない', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));

      await expect(
        service.uploadFile('folder-1', makeUpload({ originalname: '../../' }), admin('account-1')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('同名再アップ: 既存 File へ最大版+1 の新版を追加する（File は新規作成しない）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'メモ.md' }),
      );
      mockRepo.getMaxVersionNo.mockResolvedValue(2);
      mockRepo.addFileVersion.mockImplementation((data) => ({
        ...makeFileVersionEntity(data),
        uploadedBy: { name: '山田太郎' },
      }));

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'メモ.md' }),
        admin('account-1'),
      );

      expect(mockRepo.createFileWithInitialVersion).not.toHaveBeenCalled();
      const addArgs = mockRepo.addFileVersion.mock.calls[0][0];
      expect(addArgs.fileId).toBe('file-1');
      expect(addArgs.versionNo).toBe(3);
      expect(result.data).toMatchObject({
        kind: 'file',
        id: 'file-1',
        name: 'メモ.md',
        versionNo: 3,
      });
    });

    it('DB 書き込み失敗時は保存済み実体を補償削除してから rethrow する', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockRejectedValue(new Error('db down'));

      await expect(
        service.uploadFile('folder-1', makeUpload(), admin('account-1')),
      ).rejects.toThrow('db down');
      expect(mockStorage.write).toHaveBeenCalledTimes(1);
      const writtenKey = mockStorage.write.mock.calls[0][0];
      expect(mockStorage.delete).toHaveBeenCalledWith(writtenKey);
    });
  });

  describe('moveFolder（原子移動 result の例外翻訳）', () => {
    // 検証＋書き込みは repo.moveFolderAtomic が単一 tx で原子的に実行する（TOCTOU 窓封鎖・FB-2b 負債返済）。
    // Service の責務は result union → 文言付き HTTP 例外への翻訳に絞られたため、本 describe はその翻訳のみ検証する。
    // fil-0115 で moveFolder は公開範囲ガードより前に判定時の親（expectedParentFolderId）を読むため、
    // 各ケースで findFolderById を stub する。
    const stubCurrentFolder = (parentFolderId: string | null = null) =>
      mockRepo.findFolderById.mockResolvedValue(
        makeFolderEntity({ id: 'f', name: '議事録', parentFolderId }),
      );

    it('reason=not_found → NotFound', async () => {
      mockRepo.findFolderById.mockResolvedValue(null);
      await expect(service.moveFolder('missing', 'parent-1', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.moveFolderAtomic).not.toHaveBeenCalled();
    });

    it('reason=target_not_found → NotFound', async () => {
      stubCurrentFolder();
      mockRepo.moveFolderAtomic.mockResolvedValue({ ok: false, reason: 'target_not_found' });
      await expect(service.moveFolder('f', 'missing', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reason=self → BadRequest', async () => {
      stubCurrentFolder();
      mockRepo.moveFolderAtomic.mockResolvedValue({ ok: false, reason: 'self' });
      await expect(service.moveFolder('f', 'f', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reason=cycle（自身の子孫への移動）→ BadRequest', async () => {
      stubCurrentFolder();
      mockRepo.moveFolderAtomic.mockResolvedValue({ ok: false, reason: 'cycle' });
      await expect(service.moveFolder('f', 'child', ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reason=duplicate（同名衝突）→ Conflict', async () => {
      stubCurrentFolder();
      mockRepo.moveFolderAtomic.mockResolvedValue({ ok: false, reason: 'duplicate' });
      await expect(service.moveFolder('f', 'p', ADMIN)).rejects.toBeInstanceOf(ConflictException);
    });

    it('reason=stale（判定時の親が変わった）→ Conflict と固定文言', async () => {
      stubCurrentFolder('x');
      mockRepo.moveFolderAtomic.mockResolvedValue({ ok: false, reason: 'stale' });
      await expect(service.moveFolder('f', 'p', ADMIN)).rejects.toThrow(
        'フォルダの移動元が変更されました。再読み込みしてください',
      );
    });

    it('reason=depth_exceeded（階層 100 段超）→ BadRequest と固定文言（fil-0118）', async () => {
      stubCurrentFolder();
      mockRepo.moveFolderAtomic.mockResolvedValue({ ok: false, reason: 'depth_exceeded' });
      await expect(service.moveFolder('f', 'p', ADMIN)).rejects.toThrow(
        FOLDER_DEPTH_EXCEEDED_MESSAGE,
      );
    });

    it('ok: 原子移動の結果フォルダを移動結果 DTO に写して返す', async () => {
      stubCurrentFolder();
      mockRepo.moveFolderAtomic.mockResolvedValue({
        ok: true,
        folder: makeFolderEntity({ id: 'f', name: '議事録', parentFolderId: 'p' }),
      });

      const result = await service.moveFolder('f', 'p', ADMIN);

      expect(mockRepo.moveFolderAtomic).toHaveBeenCalledWith('f', 'p', null);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'f', name: '議事録', parentFolderId: 'p' });
    });
  });

  describe('moveFile（原子移動 result の例外翻訳）', () => {
    // ACL 判定のため moveFile は事前に findFileById で移動元フォルダを引く。ここを stub しないと
    // 事前チェックの 404 で先に落ち、本来の検証対象（moveFileAtomic の reason 翻訳）に到達しない。
    it('reason=not_found → NotFound', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', folderId: 'folder-1' }),
      );
      mockRepo.moveFileAtomic.mockResolvedValue({ ok: false, reason: 'not_found' });
      await expect(service.moveFile('file-1', 'folder-1', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.moveFileAtomic).toHaveBeenCalledWith('file-1', 'folder-1', 'folder-1');
    });

    it('reason=target_not_found → NotFound', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', folderId: 'folder-1' }),
      );
      mockRepo.moveFileAtomic.mockResolvedValue({ ok: false, reason: 'target_not_found' });
      await expect(service.moveFile('file-1', 'missing', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.moveFileAtomic).toHaveBeenCalledWith('file-1', 'missing', 'folder-1');
    });

    it('reason=duplicate（同名衝突）→ Conflict', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', folderId: 'folder-1' }),
      );
      mockRepo.moveFileAtomic.mockResolvedValue({ ok: false, reason: 'duplicate' });
      await expect(service.moveFile('file-1', 'folder-2', ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('ok: 原子移動の結果ファイルを移動結果 DTO に写して返す', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', folderId: 'folder-1' }),
      );
      mockRepo.moveFileAtomic.mockResolvedValue({
        ok: true,
        file: makeFileEntity({ id: 'file-1', name: 'メモ.md', folderId: 'folder-2' }),
      });

      const result = await service.moveFile('file-1', 'folder-2', ADMIN);

      expect(mockRepo.moveFileAtomic).toHaveBeenCalledWith('file-1', 'folder-2', 'folder-1');
      expect(result.data).toEqual({ id: 'file-1', name: 'メモ.md', folderId: 'folder-2' });
    });

    it('reason=stale（並行移動で移動元が変更）→ Conflict（再読み込み可能）', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', folderId: 'folder-1' }),
      );
      mockRepo.moveFileAtomic.mockResolvedValue({ ok: false, reason: 'stale' });

      await expect(service.moveFile('file-1', 'folder-2', ADMIN)).rejects.toThrow(
        new ConflictException('ファイルの移動元が変更されました。再読み込みしてください'),
      );
      expect(mockRepo.moveFileAtomic).toHaveBeenCalledWith('file-1', 'folder-2', 'folder-1');
    });
  });

  describe('downloadFile', () => {
    it('最新版が無い/ファイル不在なら NotFound', async () => {
      mockRepo.findLatestVersionWithFile.mockResolvedValue(null);
      await expect(service.downloadFile('missing', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('最新版のストリーム + mimeType + ファイル名を返す', async () => {
      const stream = Readable.from(['data']);
      mockRepo.findLatestVersionWithFile.mockResolvedValue({
        ...makeFileEntity({ id: 'file-1', name: '設計.md' }),
        versions: [makeFileVersionEntity({ storageKey: 'file-1/v3', mimeType: 'text/markdown' })],
      });
      mockStorage.createReadStream.mockReturnValue(stream);

      const result = await service.downloadFile('file-1', ADMIN);

      expect(mockStorage.createReadStream).toHaveBeenCalledWith('file-1/v3');
      expect(result).toEqual({ stream, mimeType: 'text/markdown', fileName: '設計.md' });
    });
  });

  describe('downloadFileVersion', () => {
    it('指定版が無ければ NotFound', async () => {
      mockRepo.findVersionWithFile.mockResolvedValue(null);
      await expect(service.downloadFileVersion('file-1', 9, ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('指定版のストリーム + mimeType + ファイル名を返す', async () => {
      const stream = Readable.from(['old']);
      mockRepo.findVersionWithFile.mockResolvedValue({
        ...makeFileVersionEntity({ storageKey: 'file-1/v1', mimeType: 'application/pdf' }),
        file: makeFileEntity({ id: 'file-1', name: '旧版.pdf' }),
      });
      mockStorage.createReadStream.mockReturnValue(stream);

      const result = await service.downloadFileVersion('file-1', 1, ADMIN);

      expect(mockStorage.createReadStream).toHaveBeenCalledWith('file-1/v1');
      expect(result).toEqual({ stream, mimeType: 'application/pdf', fileName: '旧版.pdf' });
    });
  });

  describe('uploadFileVersion（FF お気に入り編集の新版アップロード）', () => {
    it('ファイル未指定なら BadRequest（storage / repo に触れない）', async () => {
      await expect(
        service.uploadFileVersion('file-1', undefined, admin('account-1')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStorage.write).not.toHaveBeenCalled();
      expect(mockRepo.findFileById).not.toHaveBeenCalled();
    });

    it('対象ファイル不在なら NotFound（実体保存しない）', async () => {
      mockRepo.findFileById.mockResolvedValue(null);

      await expect(
        service.uploadFileVersion('missing', makeUpload(), admin('account-1')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('既存ファイル id へ最大版+1 の新版を追加し、保存名は既存 name を固定する（アップロード名は不採用）', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'report.docx' }),
      );
      mockRepo.getMaxVersionNo.mockResolvedValue(2);
      mockRepo.addFileVersion.mockImplementation((data) => ({
        ...makeFileVersionEntity(data),
        uploadedBy: { name: '山田太郎' },
      }));

      // ローカル編集で別名（"report (1).docx"）になっても、id 指定なので同一ファイルの新版になる。
      const result = await service.uploadFileVersion(
        'file-1',
        makeUpload({ originalname: 'report (1).docx', size: 20 }),
        admin('account-2'),
      );

      const addArgs = mockRepo.addFileVersion.mock.calls[0][0];
      expect(addArgs.fileId).toBe('file-1');
      expect(addArgs.versionNo).toBe(3);
      expect(addArgs.byteSize).toBe(BigInt(20));
      expect(addArgs.uploadedById).toBe('account-2');
      // storageKey は <fileId>/<versionId> 形式で実体保存 key と一致する。
      expect(addArgs.storageKey).toBe(`file-1/${addArgs.id}`);
      expect(mockStorage.write).toHaveBeenCalledWith(addArgs.storageKey, expect.any(Buffer));
      // 行 DTO の name は既存 name（report.docx）で、アップロード時の一時名は採用しない。
      expect(result.data).toMatchObject({
        kind: 'file',
        id: 'file-1',
        name: 'report.docx',
        versionNo: 3,
      });
    });

    it('サイズ上限超過は BadRequest で弾き、実体保存しない', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'big.bin' }));
      mockRepo.findSettings.mockResolvedValue(makeFileSettingsEntity({ maxSizeBytes: BigInt(5) }));

      const rejected = service.uploadFileVersion(
        'file-1',
        makeUpload({ size: 999 }),
        admin('account-1'),
      );
      // 文言だけでなく 400 系であること（HTTP 契約）も固定する。文言が同じでも 500 へ化けたら落ちる。
      await expect(rejected).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejected).rejects.toThrow('ファイルサイズが上限（5 B）を超えています');
      expect(mockStorage.write).not.toHaveBeenCalled();
      expect(mockRepo.addFileVersion).not.toHaveBeenCalled();
    });

    it('拡張子は既存ファイル名で判定する（許可外の既存 name は弾く）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'old.zip' }));
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: ['.md', '.pdf'] }),
      );

      // アップロード一時名が .md でも、ファイル自身（old.zip）の拡張子で判定して弾く。
      // 文言は拡張子を添えないため、判定元の違いは「拒否されること + 実体を書かないこと」で見る
      // ＝一時名（.md）で判定していれば許可されて保存へ進んでしまう。
      const rejected = service.uploadFileVersion(
        'file-1',
        makeUpload({ originalname: 'x.md' }),
        admin('account-1'),
      );
      await expect(rejected).rejects.toBeInstanceOf(BadRequestException);
      // 文言は拡張子の一覧を添えない（開発統括の修正依頼）。部分一致では括弧が戻っても通ってしまうため、
      // 全文一致（^…$）で固定する。
      await expect(rejected).rejects.toThrow(/^許可されていない拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('追加分の拒否拡張子に載る既存 name は 400 で弾き、実体保存しない（v2-197）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'setup.ps1' }));
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: ['.ps1', '.sh'] }),
      );

      const rejected = service.uploadFileVersion(
        'file-1',
        makeUpload({ originalname: 'x.md' }),
        admin('account-1'),
      );
      await expect(rejected).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejected).rejects.toThrow(/^拒否する拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('固定分（常に拒否）の既存 name は、追加分が空でも 400 で弾く（要求版2）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'setup.exe' }));
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: [] }),
      );

      const rejected = service.uploadFileVersion('file-1', makeUpload(), admin('account-1'));

      // 固定分は設定から外せない層なので、追加分が空でも拒否され、文言も「常に拒否」と分かる形で返す。
      await expect(rejected).rejects.toThrow(/^常に拒否される拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('既存 name が末尾ドット付きでも拒否リストで弾く（版差し替えのすり抜け防止・v2-197・F1）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'setup.ps1.' }));
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: ['.ps1'] }),
      );

      const rejected = service.uploadFileVersion('file-1', makeUpload(), admin('account-1'));

      await expect(rejected).rejects.toThrow(/^拒否する拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('許可と拒否の両方に載る拡張子は拒否を優先する（v2-197）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'setup.ps1' }));
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({
          allowedExtensions: ['.ps1', '.md'],
          rejectedExtensions: ['.ps1'],
        }),
      );

      const rejected = service.uploadFileVersion('file-1', makeUpload(), admin('account-1'));

      // 許可一覧にも載っているが、管理者が「置かせない」と明示した拒否が勝つ（拒否の文言が返る）。
      await expect(rejected).rejects.toThrow(/^拒否する拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('拒否拡張子が空なら追加分由来の拒否は起きない（後段の許可判定だけが効く・v2-197）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'setup.ps1' }));
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: ['.md'], rejectedExtensions: [] }),
      );

      const rejected = service.uploadFileVersion('file-1', makeUpload(), admin('account-1'));

      await expect(rejected).rejects.toThrow(/^許可されていない拡張子です$/);
    });

    it('DB 書き込み失敗時は保存済み実体を補償削除してから rethrow する', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'a.md' }));
      mockRepo.getMaxVersionNo.mockResolvedValue(1);
      mockRepo.addFileVersion.mockRejectedValue(new Error('db down'));

      await expect(
        service.uploadFileVersion('file-1', makeUpload(), admin('account-1')),
      ).rejects.toThrow('db down');
      expect(mockStorage.write).toHaveBeenCalledTimes(1);
      const writtenKey = mockStorage.write.mock.calls[0][0];
      expect(mockStorage.delete).toHaveBeenCalledWith(writtenKey);
    });
  });

  describe('getFileMeta（FF お気に入り編集のメタ解決）', () => {
    it('ファイル不在なら NotFound', async () => {
      mockRepo.findFileById.mockResolvedValue(null);
      await expect(service.getFileMeta('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('id / name / folderId / 最新版番号を { success, data } で返す', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'report.docx', folderId: 'folder-9' }),
      );
      mockRepo.getMaxVersionNo.mockResolvedValue(4);

      const result = await service.getFileMeta('file-1', ADMIN);

      expect(result.data).toEqual({
        id: 'file-1',
        name: 'report.docx',
        folderId: 'folder-9',
        versionNo: 4,
      });
    });

    it('版が無い異常データは versionNo=null へ写す', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'x.md' }));
      mockRepo.getMaxVersionNo.mockResolvedValue(0);

      const result = await service.getFileMeta('file-1', ADMIN);
      expect(result.data.versionNo).toBeNull();
    });
  });

  describe('getSettings', () => {
    it('未設定なら既定（hard cap / 全許可 / 既定の拒否拡張子）を { success, data } で返す', async () => {
      mockRepo.findSettings.mockResolvedValue(null);

      const result = await service.getSettings();

      expect(result).toEqual({
        success: true,
        data: {
          maxSizeBytes: DEFAULT_MAX_SIZE_BYTES,
          allowedExtensions: [],
          fixedRejectedExtensions: [...FIXED_REJECTED_EXTENSIONS],
          rejectedExtensions: [...DEFAULT_REJECTED_EXTENSIONS],
        },
      });
    });

    it('設定行があれば値を反映する（固定分はコード定数のまま）', async () => {
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ maxSizeBytes: BigInt(2048), allowedExtensions: ['.pdf'] }),
      );

      const result = await service.getSettings();

      expect(result.data).toEqual({
        maxSizeBytes: 2048,
        allowedExtensions: ['.pdf'],
        fixedRejectedExtensions: [...FIXED_REJECTED_EXTENSIONS],
        rejectedExtensions: [],
      });
    });
  });

  describe('updateSettings', () => {
    it('拡張子を小文字化・重複排除で正規化して patch upsert する（read 不要）', async () => {
      mockRepo.upsertSettings.mockImplementation(async (d) =>
        makeFileSettingsEntity({
          maxSizeBytes: d.maxSizeBytes,
          allowedExtensions: d.allowedExtensions,
          rejectedExtensions: d.rejectedExtensions,
        }),
      );

      await service.updateSettings({
        maxSizeBytes: 4096,
        allowedExtensions: ['.PDF', '.pdf', '.MD'],
        rejectedExtensions: ['.BAT', '.bat', '.PS1'],
      });

      expect(mockRepo.upsertSettings).toHaveBeenCalledWith({
        maxSizeBytes: BigInt(4096),
        allowedExtensions: ['.pdf', '.md'],
        rejectedExtensions: ['.bat', '.ps1'],
      });
      // read-modify-write を撤廃したため findSettings は呼ばない（ロストアップデート回避）。
      expect(mockRepo.findSettings).not.toHaveBeenCalled();
    });

    it('固定分（常に拒否）は保存値から除く（要求版2）', async () => {
      mockRepo.upsertSettings.mockImplementation(async (d) =>
        makeFileSettingsEntity({ rejectedExtensions: d.rejectedExtensions }),
      );

      // 古いクライアントが既定 9 種をそのまま送っても、固定分は保存されず 400 にもならない。
      await service.updateSettings({
        rejectedExtensions: ['.exe', '.dll', '.msi', '.scr', '.com', '.bat', '.ps1'],
      });

      expect(mockRepo.upsertSettings).toHaveBeenCalledWith({
        maxSizeBytes: undefined,
        allowedExtensions: undefined,
        rejectedExtensions: ['.bat', '.ps1'],
      });
    });

    it('固定分だけを送ると空配列で保存する（常に拒否されるため編集一覧へ持たない）', async () => {
      mockRepo.upsertSettings.mockImplementation(async (d) =>
        makeFileSettingsEntity({ rejectedExtensions: d.rejectedExtensions }),
      );

      const result = await service.updateSettings({ rejectedExtensions: ['.EXE'] });

      expect(mockRepo.upsertSettings).toHaveBeenCalledWith({
        maxSizeBytes: undefined,
        allowedExtensions: undefined,
        rejectedExtensions: [],
      });
      expect(result.data.rejectedExtensions).toEqual([]);
    });

    it('部分更新: 未指定フィールドは undefined で渡し DB 側の既存値保持に委ねる', async () => {
      mockRepo.upsertSettings.mockImplementation(async () => makeFileSettingsEntity());

      await service.updateSettings({ maxSizeBytes: 1024 });

      expect(mockRepo.upsertSettings).toHaveBeenCalledWith({
        maxSizeBytes: BigInt(1024),
        allowedExtensions: undefined,
        rejectedExtensions: undefined,
      });
      expect(mockRepo.findSettings).not.toHaveBeenCalled();
    });

    it('拒否拡張子だけを空配列で更新できる（[] は据え置きの undefined と区別して渡す・v2-197）', async () => {
      mockRepo.upsertSettings.mockImplementation(async (d) =>
        makeFileSettingsEntity({ rejectedExtensions: d.rejectedExtensions }),
      );

      const result = await service.updateSettings({ rejectedExtensions: [] });

      expect(mockRepo.upsertSettings).toHaveBeenCalledWith({
        maxSizeBytes: undefined,
        allowedExtensions: undefined,
        rejectedExtensions: [],
      });
      expect(result.data.rejectedExtensions).toEqual([]);
    });
  });

  describe('uploadFile / uploadFileVersion diskStorage 経路（fil-0121・一時ファイル削除）', () => {
    // multer の diskStorage は一時ファイルを `path` で渡す。service は保存ソースをその読み出しストリームにし、
    // 成功・業務エラー・DB 失敗を問わず finally で一時ファイルを必ず削除する（criteria 2/3）。
    // 一時ファイルの実体は置かず、createReadStream / unlink を fs モジュールごと差し替えて「読み出し・削除の
    // 呼び出し」を検証する（実ディスク書き込みは並列実行環境で非決定的に EPERM/ENOENT になるため使わない）。
    // fil-0157: 一時パス検証（所定フォルダ配下）を通すため、dummy パスは resolveUploadTempDir() 配下に置く。
    const dummyTempPath = join(resolveUploadTempDir(), 'rete-upload-dummy.bin');

    beforeEach(() => {
      (createReadStream as jest.Mock).mockReturnValue(
        Readable.from([Buffer.from('一時本文')]) as unknown as ReadStream,
      );
      (unlink as jest.Mock).mockResolvedValue(undefined);
      // fil-0140: diskStorage 経路で内容署名検査が一時ファイルを open するため、モックで同バイト列を返す。
      // 既存テストの createReadStream モックと整合させ、判定不能 → 通過を成立させる。
      // FileHandle.read の戻り値 { bytesRead, buffer } の buffer は呼び出し側が渡した Buffer を破壊変更する
      // 仕様（Node.js 公式）のため、モック内で dest へコピーする。
      const diskBytes = Buffer.from('一時本文');
      (open as jest.Mock).mockResolvedValue({
        read: jest.fn().mockImplementation((dest: Buffer) => {
          diskBytes.copy(dest, 0, 0, diskBytes.length);
          return Promise.resolve({ bytesRead: diskBytes.length, buffer: dest });
        }),
        close: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('正常アップロードは一時ファイルのストリームで保存され、完了後に unlink する', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockImplementation(({ fileId, name, version }) => ({
        ...makeFileEntity({ id: fileId, name }),
        versions: [{ ...makeFileVersionEntity(version), uploadedBy: { name: '山田太郎' } }],
      }));

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: '提案.md', size: 12, path: dummyTempPath }),
        admin('account-1'),
      );

      // 本文は一時ファイルの読み出しストリームで保存される＝全量 RAM に保持しない（criteria 1）。
      expect(createReadStream).toHaveBeenCalledWith(dummyTempPath);
      expect(mockStorage.write).toHaveBeenCalledWith(expect.any(String), expect.any(Readable));
      expect(result.data.kind).toBe('file');
      // finally で一時ファイルを必ず削除する（criteria 2）。
      expect(unlink).toHaveBeenCalledWith(dummyTempPath);
    });

    it('業務検証エラー（サイズ超過）時も一時ファイルを unlink する', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findSettings.mockResolvedValue(makeFileSettingsEntity({ maxSizeBytes: BigInt(5) }));

      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: '提案.md', size: 12, path: dummyTempPath }),
          admin('account-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStorage.write).not.toHaveBeenCalled();
      expect(unlink).toHaveBeenCalledWith(dummyTempPath);
    });

    it('DB 書き込み失敗時も一時ファイルを unlink し、補償削除（実体削除）も走る', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockRejectedValue(new Error('db down'));

      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: '提案.md', size: 12, path: dummyTempPath }),
          admin('account-1'),
        ),
      ).rejects.toThrow('db down');
      expect(mockStorage.delete).toHaveBeenCalled();
      expect(unlink).toHaveBeenCalledWith(dummyTempPath);
    });

    it('uploadFileVersion も版追加完了後に一時ファイルを unlink する', async () => {
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'report.docx' }),
      );
      mockRepo.getMaxVersionNo.mockResolvedValue(2);
      mockRepo.addFileVersion.mockImplementation((data) => ({
        ...makeFileVersionEntity(data),
        uploadedBy: { name: '山田太郎' },
      }));

      const result = await service.uploadFileVersion(
        'file-1',
        makeUpload({ originalname: 'report (1).docx', size: 20, path: dummyTempPath }),
        admin('account-2'),
      );

      expect(createReadStream).toHaveBeenCalledWith(dummyTempPath);
      expect(mockStorage.write).toHaveBeenCalledWith(expect.any(String), expect.any(Readable));
      expect(result.data).toMatchObject({ kind: 'file', id: 'file-1', versionNo: 3 });
      expect(unlink).toHaveBeenCalledWith(dummyTempPath);
    });

    it('fil-0157: 所定フォルダ配下でない一時パスは読み出しを拒否する（criteria 5）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      const outsidePath = join(tmpdir(), 'rete-upload-outside.bin');

      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: '提案.md', size: 12, path: outsidePath }),
          admin('account-1'),
        ),
      ).rejects.toThrow('所定フォルダ配下ではありません');
      expect(createReadStream).not.toHaveBeenCalledWith(outsidePath);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('fil-0157: 所定フォルダ配下でない一時パスは削除も拒否し、unlink を呼ばない（criteria 5）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      const outsidePath = join(tmpdir(), 'rete-upload-outside.bin');

      // アップロードは業務エラー（サイズ超過）で落とし、finally の削除が拒否経路を通るようにする
      mockRepo.findSettings.mockResolvedValue(makeFileSettingsEntity({ maxSizeBytes: BigInt(5) }));

      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: '提案.md', size: 12, path: outsidePath }),
          admin('account-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(unlink).not.toHaveBeenCalledWith(outsidePath);
    });
  });

  describe('拡張子判定の正規化（v2-197・F1）', () => {
    it('OS が実際に作る名前に正規化する（末尾ドット・末尾空白・代替データストリーム）', () => {
      // Windows は末尾のドット・空白を落として保存する（evil.bat. → evil.bat）。
      expect(extensionDecisionName('evil.bat.')).toBe('evil.bat');
      expect(extensionDecisionName('evil.bat. . ')).toBe('evil.bat');
      expect(extensionDecisionName('evil.bat ')).toBe('evil.bat');
      // ':' 以降は NTFS の代替データストリーム（evil.bat::$DATA は evil.bat の中身）。
      expect(extensionDecisionName('evil.bat::$DATA')).toBe('evil.bat');
      expect(extensionDecisionName('evil.bat:evil.txt')).toBe('evil.bat');
      // 通常の名前・末尾が拡張子でない名前は変えない。
      expect(extensionDecisionName('report.txt')).toBe('report.txt');
      expect(extensionDecisionName('レポート.pdf')).toBe('レポート.pdf');
    });

    it('判定名から拡張子を求める（大文字は小文字化・先頭ドットだけの名前は名前自体を使う）', () => {
      expect(extensionForDecision('evil.BAT.')).toBe('.bat');
      expect(extensionForDecision('evil.bat::$DATA')).toBe('.bat');
      expect(extensionForDecision('report.docx.')).toBe('.docx');
      // 名前全体が拡張子の形なら、それを拡張子として扱う（Windows では拡張子なし扱いだが一覧で止める）。
      expect(extensionForDecision('.ps1')).toBe('.ps1');
      expect(extensionForDecision('..ps1')).toBe('.ps1');
      // 拡張子が無い名前は空（拒否/許可のどちらの一覧にも当たらない）。
      expect(extensionForDecision('README')).toBe('');
      expect(extensionForDecision('...')).toBe('');
    });
  });

  describe('uploadFile バリデーション（FB-3）', () => {
    it('最大サイズ超過は BadRequest で弾き、実体保存しない', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity());
      mockRepo.findSettings.mockResolvedValue(makeFileSettingsEntity({ maxSizeBytes: BigInt(5) }));

      const rejected = service.uploadFile('folder-1', makeUpload({ size: 6 }), admin('account-1'));
      // 文言だけでなく 400 系であること（HTTP 契約）も固定する。文言が同じでも 500 へ化けたら落ちる。
      await expect(rejected).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejected).rejects.toThrow('ファイルサイズが上限（5 B）を超えています');
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('非許可拡張子は BadRequest で弾き、実体保存しない', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity());
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: ['.pdf'] }),
      );

      const rejected = service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'メモ.md', size: 6 }),
        admin('account-1'),
      );
      await expect(rejected).rejects.toBeInstanceOf(BadRequestException);
      await expect(rejected).rejects.toThrow(/^許可されていない拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('許可拡張子・サイズ内なら通常どおりアップロードする', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity());
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: ['.md'], maxSizeBytes: BigInt(1000) }),
      );
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockResolvedValue(
        makeFileWithLatestVersion({ id: 'file-1', name: 'メモ.md' }),
      );

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'メモ.md', size: 6 }),
        admin('account-1'),
      );

      expect(result.success).toBe(true);
      expect(mockStorage.write).toHaveBeenCalled();
    });
  });

  describe('uploadFile 内容署名検査（fil-0140）', () => {
    // 内容署名の検査素材。makeUpload の buffer を入れ替え、diskStorage 経路モック（open/createReadStream）
    // を上書きして検査対象バイト列を差し替える。各ケースで setDiskBytes を呼ぶ。
    function setDiskBytes(bytes: Buffer | Uint8Array): void {
      const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      (createReadStream as jest.Mock).mockReturnValue(
        Readable.from([buf]) as unknown as ReadStream,
      );
      (open as jest.Mock).mockResolvedValue({
        read: jest.fn().mockImplementation((dest: Buffer) => {
          buf.copy(dest, 0, 0, buf.length);
          return Promise.resolve({ bytesRead: buf.length, buffer: dest });
        }),
        close: jest.fn().mockResolvedValue(undefined),
      });
    }

    const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const PE_SIG = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]);
    const ELF_SIG = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const MACHO_SIG = Buffer.from([0xfe, 0xed, 0xfa, 0xcf]);
    const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const PDF_SIG = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

    beforeEach(() => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockImplementation(({ fileId, name, version }) => ({
        ...makeFileEntity({ id: fileId, name }),
        versions: [{ ...makeFileVersionEntity(version), uploadedBy: { name: '山田太郎' } }],
      }));
    });

    it('JPEG バイト列に .pdf 拡張子は内容不一致で 400（実体保存しない）', async () => {
      setDiskBytes(JPEG_SIG);
      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: 'fake.pdf', buffer: JPEG_SIG, mimetype: 'application/pdf' }),
          admin('account-1'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('PE/MZ バイト列に .pdf 拡張子（実行形式の恒久拒否）は 400（実体保存しない）', async () => {
      setDiskBytes(PE_SIG);
      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: 'malware.pdf', buffer: PE_SIG, mimetype: 'application/pdf' }),
          admin('account-1'),
        ),
      ).rejects.toThrow('実行形式（.exe や .dll など）のファイルはアップロードできません');
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('ELF バイト列に .pdf 拡張子は 400', async () => {
      setDiskBytes(ELF_SIG);
      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: 'binary.pdf', buffer: ELF_SIG, mimetype: 'application/pdf' }),
          admin('account-1'),
        ),
      ).rejects.toThrow('実行形式（.exe や .dll など）のファイルはアップロードできません');
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('Mach-O バイト列に .pdf 拡張子は 400', async () => {
      setDiskBytes(MACHO_SIG);
      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: 'mac.pdf', buffer: MACHO_SIG, mimetype: 'application/pdf' }),
          admin('account-1'),
        ),
      ).rejects.toThrow('実行形式（.exe や .dll など）のファイルはアップロードできません');
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('拒否拡張子に .exe が載っていても、内容が実行形式なら実行形式として拒否する（v2-197・判定順）', async () => {
      setDiskBytes(PE_SIG);
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: ['.exe'] }),
      );

      const rejected = service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'malware.exe', buffer: PE_SIG }),
        admin('account-1'),
      );

      // 一覧から .exe を外せば通る、と誤解させないため、内容が理由の実行形式メッセージを返す
      // （拒否拡張子のメッセージ「拒否する拡張子です」ではない）。
      await expect(rejected).rejects.toThrow(
        '実行形式（.exe や .dll など）のファイルはアップロードできません',
      );
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('追加分の拒否拡張子に載るテキストのスクリプトは拡張子で拒否する（内容署名では通る・v2-197）', async () => {
      const scriptBytes = Buffer.from('Write-Host "hello"\n');
      setDiskBytes(scriptBytes);
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: ['.ps1'] }),
      );

      const rejected = service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'setup.ps1', buffer: scriptBytes }),
        admin('account-1'),
      );

      await expect(rejected).rejects.toThrow(/^拒否する拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('末尾ドット・末尾空白・代替データストリーム・先頭ドット名でも拒否リストをすり抜けない（v2-197・F1）', async () => {
      const scriptBytes = Buffer.from('echo off\r\ndel /f /q C:\\*.*\r\n');
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({
          allowedExtensions: [],
          rejectedExtensions: [...DEFAULT_REJECTED_EXTENSIONS],
        }),
      );

      // 生の名前で比較すると、一覧で止めているはずのスクリプトが末尾に 1 文字足すだけで保存できる
      // （Windows は evil.bat. を evil.bat として作る）。内容がテキストのスクリプトは内容署名層が
      // 検出できないため、この一覧が唯一の防御層になる。
      // 文言は拡張子を添えなくなった（開発統括の修正依頼）ため、どの拡張子として判定したかは文言では見ない。
      // すり抜けの有無は「拒否されること + 実体を書かないこと」で見る（許可は空＝他に弾く層が無い）。
      for (const originalname of [
        'evil.bat.',
        'evil.bat ',
        'evil.bat::$DATA',
        'evil.BAT.',
        '.ps1',
      ]) {
        setDiskBytes(scriptBytes);
        mockStorage.write.mockClear();

        await expect(
          service.uploadFile(
            'folder-1',
            makeUpload({ originalname, buffer: scriptBytes }),
            admin('account-1'),
          ),
        ).rejects.toThrow(/^拒否する拡張子です$/);
        expect(mockStorage.write).not.toHaveBeenCalled();
      }
    });

    it('固定分（常に拒否）は内容がテキストでも拡張子で弾く（要求版2・設定に載せられない層）', async () => {
      const textBytes = Buffer.from('これは実行形式ではないただのテキスト\n');
      setDiskBytes(textBytes);
      // 追加分は空＝この経路で弾く層は固定分しかない（内容署名も通る）。
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: [] }),
      );

      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: 'foo.exe', buffer: textBytes }),
          admin('account-1'),
        ),
      ).rejects.toThrow(/^常に拒否される拡張子です$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('許可リストの判定も同じ正規化名で行う（report.txt. は .txt として許可する・v2-197・F1）', async () => {
      const textBytes = Buffer.from('hello\r\n');
      setDiskBytes(textBytes);
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: ['.txt'], rejectedExtensions: [] }),
      );

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'report.txt.', buffer: textBytes }),
        admin('account-1'),
      );

      // Windows が作る名前は report.txt（末尾ドットは落ちる）ため、許可一覧の判定も同じ名前で行う。
      expect(result.success).toBe(true);
    });

    it('末尾ドット付きの正当な OOXML を内容不一致と誤判定しない（v2-197・F1）', async () => {
      setDiskBytes(ZIP_SIG);
      mockRepo.findSettings.mockResolvedValue(
        makeFileSettingsEntity({ allowedExtensions: [], rejectedExtensions: [] }),
      );

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({
          originalname: 'report.docx.',
          buffer: ZIP_SIG,
          mimetype: 'application/octet-stream',
          size: ZIP_SIG.length,
        }),
        admin('account-1'),
      );

      // 判定名は report.docx なので zip コンテナとして一致する（正規化前は拡張子 '.' として不一致だった）。
      expect(result.success).toBe(true);
    });

    it('OOXML (.docx) は zip シグネチャの検出で許可され、検出 mime を採用する', async () => {
      setDiskBytes(ZIP_SIG);
      const result = await service.uploadFile(
        'folder-1',
        makeUpload({
          originalname: 'report.docx',
          buffer: ZIP_SIG,
          mimetype: 'application/octet-stream', // クライアントが誤申告
          size: ZIP_SIG.length,
        }),
        admin('account-1'),
      );
      expect(result.success).toBe(true);
      // 検出 mime が保存される（criteria 4）。docx の mimetype を採用。
      const savedVersion = mockRepo.createFileWithInitialVersion.mock.calls[0][0].version;
      expect(savedVersion.mimeType).toContain('openxmlformats-officedocument');
    });

    it('zip シグネチャでない zip 系拡張子（.docx だが中身が PNG）は 400', async () => {
      setDiskBytes(PNG_SIG);
      await expect(
        service.uploadFile(
          'folder-1',
          makeUpload({ originalname: 'trick.docx', buffer: PNG_SIG, mimetype: 'image/png' }),
          admin('account-1'),
        ),
      ).rejects.toThrow(/^ファイルの内容と拡張子が一致しません$/);
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('JPEG バイト列は .jpg と .jpeg のどちらでも許可され、検出 mime (image/jpeg) を採用する', async () => {
      setDiskBytes(JPEG_SIG);
      const result = await service.uploadFile(
        'folder-1',
        makeUpload({
          originalname: 'photo.jpeg',
          buffer: JPEG_SIG,
          mimetype: 'application/octet-stream',
          size: JPEG_SIG.length,
        }),
        admin('account-1'),
      );
      expect(result.success).toBe(true);
      const savedVersion = mockRepo.createFileWithInitialVersion.mock.calls[0][0].version;
      expect(savedVersion.mimeType).toBe('image/jpeg');
    });

    it('PDF バイト列は .pdf 拡張子で許可され、検出 mime (application/pdf) を採用する', async () => {
      setDiskBytes(PDF_SIG);
      const result = await service.uploadFile(
        'folder-1',
        makeUpload({
          originalname: 'doc.pdf',
          buffer: PDF_SIG,
          mimetype: 'application/octet-stream',
          size: PDF_SIG.length,
        }),
        admin('account-1'),
      );
      expect(result.success).toBe(true);
      const savedVersion = mockRepo.createFileWithInitialVersion.mock.calls[0][0].version;
      expect(savedVersion.mimeType).toBe('application/pdf');
    });

    it('HTML バイト列は .html / .htm で許可され（magic-bytes は HTML を検出しない）、クライアント mime を維持する', async () => {
      const htmlBytes = Buffer.from('<!DOCTYPE html><html><body></body></html>');
      setDiskBytes(htmlBytes);
      const result = await service.uploadFile(
        'folder-1',
        makeUpload({
          originalname: 'page.html',
          buffer: htmlBytes,
          mimetype: 'text/html',
          size: htmlBytes.length,
        }),
        admin('account-1'),
      );
      expect(result.success).toBe(true);
      const savedVersion = mockRepo.createFileWithInitialVersion.mock.calls[0][0].version;
      // 判定不能のためクライアント申告 mime を維持（criteria 2）。
      expect(savedVersion.mimeType).toBe('text/html');
    });

    it('検出不能なバイト列（plain text）は判定不能として通過し、クライアント mime を維持する', async () => {
      const plain = Buffer.from('普通のテキストファイルです', 'utf8');
      setDiskBytes(plain);
      const result = await service.uploadFile(
        'folder-1',
        makeUpload({
          originalname: 'memo.txt',
          buffer: plain,
          mimetype: 'text/plain',
          size: plain.length,
        }),
        admin('account-1'),
      );
      expect(result.success).toBe(true);
      const savedVersion = mockRepo.createFileWithInitialVersion.mock.calls[0][0].version;
      expect(savedVersion.mimeType).toBe('text/plain');
    });

    it('uploadFileVersion も同様に PE/MZ を実行形式として拒否する', async () => {
      setDiskBytes(PE_SIG);
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'photo.png' }));
      mockRepo.getMaxVersionNo.mockResolvedValue(1);

      await expect(
        service.uploadFileVersion(
          'file-1',
          makeUpload({ originalname: 'photo.png', buffer: PE_SIG, mimetype: 'image/png' }),
          admin('account-1'),
        ),
      ).rejects.toThrow('実行形式（.exe や .dll など）のファイルはアップロードできません');
      expect(mockStorage.write).not.toHaveBeenCalled();
    });

    it('uploadFileVersion も zip シグネチャ + .docx 拡張子で OOXML を許可し、検出 mime を採用する', async () => {
      // 版追加は既存ファイル名（既存 name）基準で拡張子判定するため、既存 name は .docx にする。
      setDiskBytes(ZIP_SIG);
      mockRepo.findFileById.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'report.docx' }),
      );
      mockRepo.getMaxVersionNo.mockResolvedValue(1);
      mockRepo.addFileVersion.mockImplementation((data) => ({
        ...makeFileVersionEntity(data),
        uploadedBy: { name: '山田太郎' },
      }));

      const result = await service.uploadFileVersion(
        'file-1',
        makeUpload({
          originalname: 'report (1).docx',
          buffer: ZIP_SIG,
          mimetype: 'application/octet-stream',
          size: ZIP_SIG.length,
        }),
        admin('account-1'),
      );

      expect(result.success).toBe(true);
      // 検出 mime が保存される（criteria 4・uploadFile と対称）。
      const savedVersion = mockRepo.addFileVersion.mock.calls[0][0];
      expect(savedVersion.mimeType).toContain('openxmlformats-officedocument.wordprocessingml');
    });
  });

  describe('versionNo 採番のリトライ（fil-0141）', () => {
    // fil-0141: 同一ファイルへの同時版追加で P2002 競合が起きた時、versionNo を取り直して最大4試行まで
    // 自動再試行する。versionNo 以外の一意衝突は即 409。試行ごとに実体の補償削除＋multer temp cleanup。

    function makeVersionNoConflict(): Error & { code: string; meta: { target: string[] } } {
      const err = new Error('Unique constraint failed') as Error & {
        code: string;
        meta: { target: string[] };
      };
      err.code = 'P2002';
      err.meta = { target: ['fileId', 'versionNo'] };
      return err;
    }

    function makeFolderIdNameConflict(): Error & { code: string; meta: { target: string[] } } {
      const err = new Error('Unique constraint failed') as Error & {
        code: string;
        meta: { target: string[] };
      };
      err.code = 'P2002';
      err.meta = { target: ['folderId', 'name'] };
      return err;
    }

    it('uploadFile: 既存同名追加で versionNo P2002 → 再試行で別 versionNo で成功する', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'a.txt' }),
      );
      // 試行 1: max=1 → 採番 2 → P2002
      // 試行 2: max=2 → 採番 3 → 成功
      mockRepo.getMaxVersionNo.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      let addCalls = 0;
      mockRepo.addFileVersion.mockImplementation((data) => {
        addCalls++;
        if (addCalls === 1) {
          // 試行 1 は衝突（versionNo=2 を別トランザクションが先取り）
          throw makeVersionNoConflict();
        }
        // 試行 2 は成功（versionNo=3）
        return { ...makeFileVersionEntity(data), uploadedBy: { name: '山田太郎' } };
      });

      const result = await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'a.txt', size: 4 }),
        admin('account-1'),
      );

      expect(result.success).toBe(true);
      expect(addCalls).toBe(2);
      // 試行 1 で storage.delete（補償削除）が呼ばれ、試行 2 で storage.write が再度走る。
      expect(mockStorage.delete).toHaveBeenCalled();
      const lastCall = mockRepo.addFileVersion.mock.calls[1][0];
      expect(lastCall.versionNo).toBe(3);
      // 試行ごとに versionId が採番されるため storageKey が変わる（criteria 5 連番保証）。
      expect(mockRepo.addFileVersion.mock.calls[0][0].storageKey).not.toBe(lastCall.storageKey);
    });

    it('uploadFileVersion: versionNo P2002 が 4 回連続したら最後のエラーをそのまま投げる', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'a.txt' }));
      mockRepo.getMaxVersionNo.mockResolvedValue(5);
      mockRepo.addFileVersion.mockRejectedValue(makeVersionNoConflict());

      await expect(
        service.uploadFileVersion(
          'file-1',
          makeUpload({ originalname: 'a.txt' }),
          admin('account-1'),
        ),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['fileId', 'versionNo'] } });

      // 4 試行（初回 + 最大 3 再試行）まで addFileVersion が呼ばれる
      expect(mockRepo.addFileVersion).toHaveBeenCalledTimes(4);
      // 各試行で storage.write + storage.delete（補償削除）が走る
      expect(mockStorage.write).toHaveBeenCalledTimes(4);
      expect(mockStorage.delete).toHaveBeenCalledTimes(4);
    });

    it('uploadFile: 新規作成経路で folderId_name P2002 が起きても再試行せず即 409 相当を投げる（criteria 3）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(null);
      mockRepo.createFileWithInitialVersion.mockRejectedValue(makeFolderIdNameConflict());

      await expect(
        service.uploadFile('folder-1', makeUpload({ originalname: 'dup.txt' }), admin('account-1')),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['folderId', 'name'] } });

      // 新規作成経路は 1 試行のみ。再試行しない（folderId_name は呼び出し前にも事前チェック済みなため
      // ここに来るのは TOCTOU の競合のみで、再試行しても別の name にはならない）。
      expect(mockRepo.createFileWithInitialVersion).toHaveBeenCalledTimes(1);
      expect(mockRepo.getMaxVersionNo).not.toHaveBeenCalled();
    });

    it('uploadFileVersion: folderId_name P2002 が起きても再試行せず即 409 相当を投げる', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'a.txt' }));
      mockRepo.getMaxVersionNo.mockResolvedValue(1);
      mockRepo.addFileVersion.mockRejectedValue(makeFolderIdNameConflict());

      await expect(
        service.uploadFileVersion(
          'file-1',
          makeUpload({ originalname: 'a.txt' }),
          admin('account-1'),
        ),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['folderId', 'name'] } });

      // folderId_name は再試行対象外（criteria 3）→ 1 試行のみ。
      expect(mockRepo.addFileVersion).toHaveBeenCalledTimes(1);
    });

    it('versionNo 競合が 2 回目で解消 → 成功試行の storageKey は初回の storageKey と異なる（versionId 再採番）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'a.txt' }),
      );
      mockRepo.getMaxVersionNo
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2) // 再試行も引き続き max=2 → 採番 3
        .mockResolvedValueOnce(2); // （3試行目は不要、2回で成功する）
      let addCalls = 0;
      mockRepo.addFileVersion.mockImplementation((data) => {
        addCalls++;
        if (addCalls === 1) throw makeVersionNoConflict();
        return { ...makeFileVersionEntity(data), uploadedBy: { name: '山田太郎' } };
      });

      await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'a.txt' }),
        admin('account-1'),
      );

      const firstKey = mockRepo.addFileVersion.mock.calls[0][0].storageKey;
      const secondKey = mockRepo.addFileVersion.mock.calls[1][0].storageKey;
      // versionId は buildNewVersion で毎回 randomUUID されるため storageKey は異なる（criteria 5）。
      expect(firstKey).not.toBe(secondKey);
      // multer temp file は呼び出し側 finally で 1 回だけ削除（criteria 6）。
      // path が無い upload input（makeUpload デフォルト）なので cleanupUploadTempFile は no-op。
      // path あり経路の検証は diskStorage describe 側に委ねる。
    });

    it('uploadFile: 既存同名追加で 1 試行目から成功する正常系では getMaxVersionNo は 1 回のみ呼ばれる', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.findFileByFolderAndName.mockResolvedValue(
        makeFileEntity({ id: 'file-1', name: 'a.txt' }),
      );
      mockRepo.getMaxVersionNo.mockResolvedValue(1);
      mockRepo.addFileVersion.mockImplementation((data) => ({
        ...makeFileVersionEntity(data),
        uploadedBy: { name: '山田太郎' },
      }));

      await service.uploadFile(
        'folder-1',
        makeUpload({ originalname: 'a.txt' }),
        admin('account-1'),
      );

      expect(mockRepo.getMaxVersionNo).toHaveBeenCalledTimes(1);
      expect(mockRepo.addFileVersion).toHaveBeenCalledTimes(1);
      // 正常系では補償削除は走らない。
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('対象ファイル不在なら NotFound（削除も実体削除もしない）', async () => {
      mockRepo.findFileWithAllVersions.mockResolvedValue(null);

      await expect(service.deleteFile('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.deleteFile).not.toHaveBeenCalled();
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });

    it('DB レコード削除後に全版の実体を storage から削除し ok({id}) を返す', async () => {
      mockRepo.findFileWithAllVersions.mockResolvedValue({
        ...makeFileEntity({ id: 'file-1', name: 'メモ.md' }),
        versions: [
          makeFileVersionEntity({ storageKey: 'file-1/v1' }),
          makeFileVersionEntity({ storageKey: 'file-1/v2' }),
        ],
      });
      mockRepo.deleteFile.mockResolvedValue(makeFileEntity({ id: 'file-1' }));

      const result = await service.deleteFile('file-1', ADMIN);

      expect(mockRepo.deleteFile).toHaveBeenCalledWith('file-1');
      expect(mockStorage.delete).toHaveBeenCalledWith('file-1/v1');
      expect(mockStorage.delete).toHaveBeenCalledWith('file-1/v2');
      expect(result).toEqual({ success: true, data: { id: 'file-1' } });
    });

    it('実体削除が一部失敗しても rethrow せず削除を完了する（孤児実体は許容）', async () => {
      mockRepo.findFileWithAllVersions.mockResolvedValue({
        ...makeFileEntity({ id: 'file-1' }),
        versions: [makeFileVersionEntity({ storageKey: 'file-1/v1' })],
      });
      mockRepo.deleteFile.mockResolvedValue(makeFileEntity({ id: 'file-1' }));
      mockStorage.delete.mockRejectedValueOnce(new Error('fs error'));

      const result = await service.deleteFile('file-1', ADMIN);

      expect(result).toEqual({ success: true, data: { id: 'file-1' } });
    });
  });

  describe('deleteFolder', () => {
    it('対象フォルダ不在なら NotFound（削除トランザクションに入らない）', async () => {
      mockRepo.findFolderById.mockResolvedValue(null);

      await expect(service.deleteFolder('missing', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.deleteEmptyFolder).not.toHaveBeenCalled();
    });

    it('空でないフォルダ（deleted=false）は Conflict で拒否する', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.deleteEmptyFolder.mockResolvedValue({ deleted: false });

      await expect(service.deleteFolder('folder-1', ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('空フォルダ（deleted=true）は削除し ok({id}) を返す', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.deleteEmptyFolder.mockResolvedValue({ deleted: true });

      const result = await service.deleteFolder('folder-1', ADMIN);

      expect(mockRepo.deleteEmptyFolder).toHaveBeenCalledWith('folder-1');
      expect(result).toEqual({ success: true, data: { id: 'folder-1' } });
    });
  });

  describe('createFolder', () => {
    it('サニタイズ後に空になる名前は BadRequest（作成しない）', async () => {
      // 制御文字 + 空白のみ → サニタイズで空。存在/同名チェックへ進まず弾く。
      await expect(service.createFolder(null, '  \u0000 ', ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.findFolderByParentAndName).not.toHaveBeenCalled();
      expect(mockRepo.createFolder).not.toHaveBeenCalled();
    });

    it('制御文字のみの名前はサニタイズで空になり BadRequest', async () => {
      // C0 制御文字 + DEL のみ → sanitizeFolderName で全除去 → 空 → 弾く。
      await expect(service.createFolder(null, '\x00\x01\x1f\x7f', ADMIN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockRepo.findFolderByParentAndName).not.toHaveBeenCalled();
      expect(mockRepo.createFolder).not.toHaveBeenCalled();
    });

    it('作成先フォルダ不在なら NotFound', async () => {
      mockRepo.findFolderById.mockResolvedValue(null);

      await expect(service.createFolder('missing', '議事録', ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.createFolder).not.toHaveBeenCalled();
    });

    it('同名フォルダが既に存在すれば Conflict', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'parent' }));
      mockRepo.findFolderByParentAndName.mockResolvedValue(
        makeFolderEntity({ id: 'other', name: '議事録', parentFolderId: 'parent' }),
      );

      await expect(service.createFolder('parent', '議事録', ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mockRepo.createFolder).not.toHaveBeenCalled();
    });

    it('正常: 作成結果 DTO を返す（sortOrder 採番は repository の tx 内・fil-0150）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'parent' }));
      mockRepo.findFolderByParentAndName.mockResolvedValue(null);
      mockRepo.createFolder.mockImplementation(async (params) => ({
        ok: true,
        folder: makeFolderEntity({
          id: 'new-folder',
          name: params.name,
          parentFolderId: params.parentFolderId,
        }),
      }));

      const result = await service.createFolder('parent', '新しいフォルダ', ADMIN);

      // 採番は service 層から撤去され、repo へ sortOrder を渡さない（tx 内で max+1 を採番）。
      expect(mockRepo.createFolder).toHaveBeenCalledWith({
        name: '新しいフォルダ',
        parentFolderId: 'parent',
        spaceId: DEFAULT_CHANNEL_ID, // ADR 0063: 親ありの場合は repository が親の spaceId を継承する
        createdById: 'account-1', // fil-0027: 作成者は暗黙 MANAGE を得るため記録する
      });
      expect(result).toEqual({
        success: true,
        data: { id: 'new-folder', name: '新しいフォルダ', parentFolderId: 'parent' },
      });
    });

    it('名前は前後空白を詰めて保存する（サニタイズ）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'parent' }));
      mockRepo.findFolderByParentAndName.mockResolvedValue(null);
      mockRepo.createFolder.mockImplementation(async (params) => ({
        ok: true,
        folder: makeFolderEntity({
          id: 'n',
          name: params.name,
          parentFolderId: params.parentFolderId,
        }),
      }));

      await service.createFolder('parent', '  議事録  ', ADMIN);

      // 同名チェック・作成いずれも前後空白を詰めた名前で行う。
      // 同名チェックは器スコープ（ADR 0063）。親ありなので親の spaceId を継承する。
      expect(mockRepo.findFolderByParentAndName).toHaveBeenCalledWith(
        'parent',
        '議事録',
        DEFAULT_CHANNEL_ID,
      );
      expect(mockRepo.createFolder).toHaveBeenCalledWith(
        expect.objectContaining({ name: '議事録' }),
      );
    });

    it('ルート直下への作成: parentFolderId=null・作成先存在チェック不要', async () => {
      mockRepo.findFolderByParentAndName.mockResolvedValue(null);
      mockRepo.createFolder.mockImplementation(async (params) => ({
        ok: true,
        folder: makeFolderEntity({
          id: 'root-folder',
          name: params.name,
          parentFolderId: null,
        }),
      }));

      const result = await service.createFolder(null, 'ルートフォルダ', ADMIN, DEFAULT_CHANNEL_ID);

      // ルート直下は作成先フォルダの存在確認（findFolderById）を行わない。
      expect(mockRepo.findFolderById).not.toHaveBeenCalled();
      expect(mockRepo.createFolder).toHaveBeenCalledWith({
        name: 'ルートフォルダ',
        parentFolderId: null,
        spaceId: DEFAULT_CHANNEL_ID, // ADR 0063: ルート直下の帰属器（呼び出し側の指定・fil-0137 で必須化）
        createdById: 'account-1', // fil-0027: 作成者は暗黙 MANAGE を得るため記録する
      });
      expect(result.data).toEqual({
        id: 'root-folder',
        name: 'ルートフォルダ',
        parentFolderId: null,
      });
    });

    it('ルート直下への作成で spaceId 未指定なら 400（fil-0137 で移行期フォールバック撤去）', async () => {
      await expect(service.createFolder(null, 'ルートフォルダ', ADMIN)).rejects.toMatchObject({
        message: 'ルート直下の作成には器（spaceId）の指定が必要です',
      });
      expect(mockRepo.createFolder).not.toHaveBeenCalled();
    });

    it('repo が depth_exceeded を返したら BadRequest と固定文言（作成後 101 段・fil-0118）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'parent' }));
      mockRepo.findFolderByParentAndName.mockResolvedValue(null);
      mockRepo.createFolder.mockResolvedValue({ ok: false, reason: 'depth_exceeded' });

      await expect(service.createFolder('parent', '議事録', ADMIN)).rejects.toThrow(
        FOLDER_DEPTH_EXCEEDED_MESSAGE,
      );
    });
  });

  describe('setFileTags（タグ付与 / rete-files-0006）', () => {
    it('対象ファイル不在なら NotFound（実在確認も置換もしない）', async () => {
      mockRepo.findFileById.mockResolvedValue(null);

      await expect(service.setFileTags('missing', ['tag-1'], ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.countTagsByIds).not.toHaveBeenCalled();
      expect(mockRepo.setFileTags).not.toHaveBeenCalled();
    });

    it('存在しない tagId が含まれれば BadRequest（部分適用せず全体を拒否）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1' }));
      // 2 件要求だが実在 1 件 → 件数不一致で拒否。
      mockRepo.countTagsByIds.mockResolvedValue(1);

      await expect(
        service.setFileTags('file-1', ['tag-1', 'tag-missing'], ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.setFileTags).not.toHaveBeenCalled();
    });

    it('重複 tagId は畳んでから件数照合する（重複は冪等）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1' }));
      mockRepo.countTagsByIds.mockResolvedValue(1);
      mockRepo.setFileTags.mockResolvedValue(undefined);
      mockRepo.findFileWithTags.mockResolvedValue(
        makeFileWithLatestVersion({ id: 'file-1', name: 'メモ.md' }, '山田太郎', {}, [
          makeTagEntity({ id: 'tag-1' }),
        ]),
      );

      await service.setFileTags('file-1', ['tag-1', 'tag-1'], ADMIN);

      // 重複排除後の 1 件で照合・置換する。
      expect(mockRepo.countTagsByIds).toHaveBeenCalledWith(['tag-1']);
      expect(mockRepo.setFileTags).toHaveBeenCalledWith('file-1', ['tag-1']);
    });

    it('空配列は全解除（実在確認をスキップして置換のみ）', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1' }));
      mockRepo.setFileTags.mockResolvedValue(undefined);
      mockRepo.findFileWithTags.mockResolvedValue(
        makeFileWithLatestVersion({ id: 'file-1', name: 'メモ.md' }),
      );

      const result = await service.setFileTags('file-1', [], ADMIN);

      expect(mockRepo.countTagsByIds).not.toHaveBeenCalled();
      expect(mockRepo.setFileTags).toHaveBeenCalledWith('file-1', []);
      expect(result.data.tags).toEqual([]);
    });

    it('正常: 全 tagId 実在を確認 → 置換 → タグ込みの行 DTO を返す', async () => {
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', name: 'メモ.md' }));
      mockRepo.countTagsByIds.mockResolvedValue(2);
      mockRepo.setFileTags.mockResolvedValue(undefined);
      mockRepo.findFileWithTags.mockResolvedValue(
        makeFileWithLatestVersion({ id: 'file-1', name: 'メモ.md' }, '山田太郎', {}, [
          makeTagEntity({ id: 'tag-1', name: '重要', icon: 'Star' }),
          makeTagEntity({ id: 'tag-2', name: '請求', icon: 'Flag' }),
        ]),
      );

      const result = await service.setFileTags('file-1', ['tag-1', 'tag-2'], ADMIN);

      expect(mockRepo.setFileTags).toHaveBeenCalledWith('file-1', ['tag-1', 'tag-2']);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ kind: 'file', id: 'file-1', name: 'メモ.md' });
      expect(result.data.tags).toEqual([
        { id: 'tag-1', name: '重要', icon: 'Star', color: 'slate', archived: false },
        { id: 'tag-2', name: '請求', icon: 'Flag', color: 'slate', archived: false },
      ]);
    });
  });

  describe('setFolderTags（フォルダタグ付与 / rete-files-0033）', () => {
    it('対象フォルダ不在なら NotFound（実在確認も置換もしない）', async () => {
      mockRepo.findFolderById.mockResolvedValue(null);

      await expect(service.setFolderTags('missing', ['tag-1'], ADMIN)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.countTagsByIds).not.toHaveBeenCalled();
      expect(mockRepo.setFolderTags).not.toHaveBeenCalled();
    });

    it('存在しない tagId が含まれれば BadRequest（部分適用せず全体を拒否）', async () => {
      mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ id: 'folder-1' }));
      mockRepo.countTagsByIds.mockResolvedValue(1);

      await expect(
        service.setFolderTags('folder-1', ['tag-1', 'tag-missing'], ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.setFolderTags).not.toHaveBeenCalled();
    });

    it('正常: 実在確認 → 置換 → タグ込みのフォルダ行 DTO を返す', async () => {
      mockRepo.findFolderById.mockResolvedValue(
        makeFolderEntity({ id: 'folder-1', name: '議事録' }),
      );
      mockRepo.countTagsByIds.mockResolvedValue(2);
      mockRepo.setFolderTags.mockResolvedValue(undefined);
      mockRepo.findFolderWithTags.mockResolvedValue(
        makeFolderWithTags({ id: 'folder-1', name: '議事録' }, [
          makeTagEntity({ id: 'tag-1', name: '重要', icon: 'Star' }),
          makeTagEntity({ id: 'tag-2', name: '機密', icon: 'Lock' }),
        ]),
      );

      const result = await service.setFolderTags('folder-1', ['tag-1', 'tag-2'], ADMIN);

      expect(mockRepo.setFolderTags).toHaveBeenCalledWith('folder-1', ['tag-1', 'tag-2']);
      expect(result.data).toMatchObject({ kind: 'folder', id: 'folder-1', name: '議事録' });
      expect(result.data.tags).toEqual([
        { id: 'tag-1', name: '重要', icon: 'Star', color: 'slate', archived: false },
        { id: 'tag-2', name: '機密', icon: 'Lock', color: 'slate', archived: false },
      ]);
    });
  });

  describe('assignTagsBatch（一括 add/remove / rete-files-0034 / fil-0048）', () => {
    it('対象（ファイル/フォルダ）が両方空なら BadRequest', async () => {
      await expect(
        service.assignTagsBatch({ fileIds: [], folderIds: [], addTagIds: ['tag-1'] }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.assignTagsBatch).not.toHaveBeenCalled();
    });

    it('addTagIds / removeTagIds が両方空（または省略）なら BadRequest', async () => {
      await expect(
        service.assignTagsBatch({ fileIds: ['file-1'], addTagIds: [], removeTagIds: [] }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.assignTagsBatch).not.toHaveBeenCalled();
    });

    it('同一タグを add と remove の両方に指定すると BadRequest（無言の上書き防止 / code review MEDIUM）', async () => {
      mockRepo.countTagsByIds.mockResolvedValue(1); // 各タグは実在（検証は通る）
      await expect(
        service.assignTagsBatch(
          {
            fileIds: ['file-1'],
            addTagIds: ['tag-x'],
            removeTagIds: ['tag-x'],
          },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.assignTagsBatch).not.toHaveBeenCalled();
    });

    it('存在しないファイルが含まれれば BadRequest（部分適用せず全体を拒否）', async () => {
      mockRepo.countTagsByIds.mockResolvedValue(1);
      // 2 要求だが実在 1 件（不在 id は refs に現れない・fil-0146 で count → refs 照合へ統合）。
      mockRepo.findFileSpaceRefs.mockResolvedValue([
        { id: 'file-1', folderId: 'folder-1', spaceId: DEFAULT_CHANNEL_ID },
      ]);

      await expect(
        service.assignTagsBatch({ fileIds: ['file-1', 'file-x'], addTagIds: ['tag-1'] }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.assignTagsBatch).not.toHaveBeenCalled();
    });

    it('正常（add のみ）: ファイル/フォルダ実在確認 → 追加付与 → 件数を返す（重複 id は畳む）', async () => {
      // 実在＋可視の素材は beforeEach 既定（渡した id が全て既定チャネルに実在＝refs 全件返却）で足りる。
      mockRepo.countTagsByIds.mockResolvedValue(2);
      mockRepo.assignTagsBatch.mockResolvedValue(undefined);

      const result = await service.assignTagsBatch(
        {
          fileIds: ['file-1', 'file-1'],
          folderIds: ['folder-1'],
          addTagIds: ['tag-1', 'tag-2', 'tag-2'],
        },
        ADMIN,
      );

      // 重複排除後の id / tag で 1 tx 付与。removeTagIds は空（省略時は [] 扱い）。
      expect(mockRepo.assignTagsBatch).toHaveBeenCalledWith(
        ['file-1'],
        ['folder-1'],
        ['tag-1', 'tag-2'],
        [],
      );
      expect(result.data).toEqual({ fileCount: 1, folderCount: 1, addCount: 2, removeCount: 0 });
    });

    it('正常（add + remove）: 追加と解除を 1 tx で原子適用する（fil-0048）', async () => {
      // addTagIds 1件 + removeTagIds 1件 → normalizeAndVerifyTagIds を各 1 回ずつ呼ぶ。
      // countTagsByIds は mock が常に最後の mockResolvedValue を返すため、各 1 件で 1 を返すよう設定。
      mockRepo.countTagsByIds.mockResolvedValue(1);
      mockRepo.assignTagsBatch.mockResolvedValue(undefined);

      const result = await service.assignTagsBatch(
        {
          fileIds: ['file-1'],
          addTagIds: ['tag-add'],
          removeTagIds: ['tag-remove'],
        },
        ADMIN,
      );

      expect(mockRepo.assignTagsBatch).toHaveBeenCalledWith(
        ['file-1'],
        [],
        ['tag-add'],
        ['tag-remove'],
      );
      expect(result.data).toEqual({ fileCount: 1, folderCount: 0, addCount: 1, removeCount: 1 });
    });

    it('正常（remove のみ）: removeTagIds のみ指定で解除できる', async () => {
      mockRepo.countTagsByIds.mockResolvedValue(1);
      mockRepo.assignTagsBatch.mockResolvedValue(undefined);

      const result = await service.assignTagsBatch(
        {
          folderIds: ['folder-1'],
          removeTagIds: ['tag-1'],
        },
        ADMIN,
      );

      expect(mockRepo.assignTagsBatch).toHaveBeenCalledWith([], ['folder-1'], [], ['tag-1']);
      expect(result.data).toEqual({ fileCount: 0, folderCount: 1, addCount: 0, removeCount: 1 });
    });

    it('非可視対象が複数でも warn は 1 行に集約（folderIds=[...] 形式・cmn-0422）', async () => {
      mockRepo.countTagsByIds.mockResolvedValue(1);
      // ファイル 1 件（所属フォルダ folder-a が非可視）＋フォルダ 2 件（folder-b / folder-c が非可視）。
      const OTHER_SPACE = '99999999-9999-4999-b999-999999999999';
      mockRepo.findFileSpaceRefs.mockResolvedValue([
        { id: 'file-1', folderId: 'folder-a', spaceId: OTHER_SPACE },
      ]);
      mockRepo.findFolderSpaceIds.mockResolvedValue([
        { id: 'folder-b', spaceId: OTHER_SPACE },
        { id: 'folder-c', spaceId: OTHER_SPACE },
      ]);
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.assignTagsBatch(
          { fileIds: ['file-1'], folderIds: ['folder-b', 'folder-c'], addTagIds: ['tag-1'] },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      // warn は 404 応答後に非同期（setImmediate）で書かれるため、応答確定まで待ってから確認する。
      await new Promise((resolve) => setImmediate(resolve));
      // 1 件ずつ 3 行ではなく 1 行に集約される（大規模バッチのログ洪水防止・秘匿情報なし）。
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'FOLDER_NOT_VISIBLE: folderIds=[folder-a,folder-b,folder-c] userId=account-1',
      );
      warnSpy.mockRestore();
    });
  });

  describe('searchByTags（タグ横断検索 / rete-files-0032）', () => {
    it('tagIds 空なら DB を叩かず空結果', async () => {
      const result = await service.searchByTags([], ADMIN);

      expect(result.data).toEqual({ tagIds: [], items: [], truncated: false });
      expect(mockRepo.searchFilesByTags).not.toHaveBeenCalled();
      expect(mockRepo.searchFoldersByTags).not.toHaveBeenCalled();
    });

    it('フォルダ → ファイルの順で items を返す（重複 tagId は畳む）・truncated=false', async () => {
      mockRepo.searchFoldersByTags.mockResolvedValue([
        makeFolderEntity({ id: 'folder-9', name: '機密案件', parentFolderId: 'root' }),
      ]);
      mockRepo.searchFilesByTags.mockResolvedValue([
        makeFileEntity({ id: 'file-9', name: '契約書.pdf', folderId: 'folder-9' }),
      ]);

      const result = await service.searchByTags(['tag-1', 'tag-1'], ADMIN);

      // タグ検索も可視 space の集合で DB 側から絞る（ADR 0063）。
      expect(mockRepo.searchFoldersByTags).toHaveBeenCalledWith(['tag-1'], [DEFAULT_CHANNEL_ID]);
      expect(mockRepo.searchFilesByTags).toHaveBeenCalledWith(['tag-1'], [DEFAULT_CHANNEL_ID]);
      expect(result.data.tagIds).toEqual(['tag-1']);
      expect(result.data.truncated).toBe(false);
      expect(result.data.items).toEqual([
        { kind: 'folder', id: 'folder-9', name: '機密案件', parentFolderId: 'root' },
        { kind: 'file', id: 'file-9', name: '契約書.pdf', parentFolderId: 'folder-9' },
      ]);
    });

    it('フォルダが 201件のとき truncated=true で items を 200件に切る（ファイルは 0件）', async () => {
      mockRepo.searchFoldersByTags.mockResolvedValue(
        Array.from({ length: 201 }, (_, i) =>
          makeFolderEntity({ id: `fd-${i}`, name: `フォルダ${i}`, parentFolderId: 'root' }),
        ),
      );
      mockRepo.searchFilesByTags.mockResolvedValue([]);

      const result = await service.searchByTags(['tag-1'], ADMIN);

      expect(result.data.truncated).toBe(true);
      expect(result.data.items).toHaveLength(200);
      expect(result.data.items.every((it) => it.kind === 'folder')).toBe(true);
    });

    it('ファイルが 201件のとき truncated=true で items を 200件に切る（フォルダは 0件）', async () => {
      mockRepo.searchFoldersByTags.mockResolvedValue([]);
      mockRepo.searchFilesByTags.mockResolvedValue(
        Array.from({ length: 201 }, (_, i) =>
          makeFileEntity({ id: `fl-${i}`, name: `ファイル${i}.pdf`, folderId: 'folder-1' }),
        ),
      );

      const result = await service.searchByTags(['tag-1'], ADMIN);

      expect(result.data.truncated).toBe(true);
      expect(result.data.items).toHaveLength(200);
      expect(result.data.items.every((it) => it.kind === 'file')).toBe(true);
    });

    it('フォルダ 100件 + ファイル 101件で truncated=true（合計超過でなく各々で判定）', async () => {
      mockRepo.searchFoldersByTags.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) =>
          makeFolderEntity({ id: `fd-${i}`, name: `フォルダ${i}`, parentFolderId: 'root' }),
        ),
      );
      mockRepo.searchFilesByTags.mockResolvedValue(
        Array.from({ length: 201 }, (_, i) =>
          makeFileEntity({ id: `fl-${i}`, name: `ファイル${i}.pdf`, folderId: 'folder-1' }),
        ),
      );

      const result = await service.searchByTags(['tag-1'], ADMIN);

      expect(result.data.truncated).toBe(true);
      // フォルダ 100 + ファイル 200（切り詰め後）= 300 件
      expect(result.data.items).toHaveLength(300);
    });
  });

  /**
   * 可視性の enforcement（ADR 0063 / fil-0136）。判定主体は Desk の ScopeVisibilityService で、規則は
   * 「チャネル可視＝配下ファイル可視」の 1 段だけ。ここでは service 層の適用 —— 非可視 space が
   * ツリー / 検索 / 直アクセスからどう消えるか（存在秘匿）と、移動が同一器に閉じること —— を固定する。
   */
  describe('可視性（ADR 0063）', () => {
    const OTHER_SPACE = '99999999-9999-4999-b999-999999999999';

    it('非可視 space のツリーを要求すると 404（存在秘匿・「無い」と同一文言）', async () => {
      await expect(service.getTree(MEMBER, OTHER_SPACE)).rejects.toMatchObject({
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
      });
      expect(mockRepo.findAllFolders).not.toHaveBeenCalled();
    });

    it('可視 space のツリーは取得できる（spaceId 必須・fil-0137 でフォールバック撤去）', async () => {
      mockRepo.findAllFolders.mockResolvedValue([makeFolderEntity({ id: 'r' })]);

      const result = await service.getTree(MEMBER, DEFAULT_CHANNEL_ID);

      expect(result.success).toBe(true);
      expect(mockRepo.findAllFolders).toHaveBeenCalledWith(DEFAULT_CHANNEL_ID);
    });

    it('非可視 space のフォルダへ直アクセスすると、実在しない時と同一文言の 404（warn 1 回・fil-0146）', async () => {
      // フォルダ自体は実在するが、器が可視集合に無い。
      mockRepo.findFolderById.mockResolvedValue(
        makeFolderEntity({ id: 'f', spaceId: OTHER_SPACE }),
      );
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(service.getFolderContent('f', MEMBER)).rejects.toMatchObject({
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
      });
      // 可視判定 → 中身取得の順（非可視なら中身のクエリを走らせない）。
      expect(mockRepo.findSubfolders).not.toHaveBeenCalled();
      expect(mockRepo.findFilesWithLatestVersion).not.toHaveBeenCalled();
      // fil-0146: 存在するが見えないフォルダへのアクセスは warn に残る。warn は 404 応答後に
      // 非同期（setImmediate）で書かれるため、応答確定まで待ってから確認する（不在は記録しない）。
      // ※単一対象経路は「warn 1 回」のまま（1 行集約は一括経路のみ・cmn-0422）。
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FOLDER_NOT_VISIBLE'));
      warnSpy.mockRestore();
    });

    it('makeFileEntity: overrides の folder は第 2 引数の既定 folderSpaceId に上書きされない（cmn-0422）', () => {
      // Partial ヘルパーの一般契約（overrides が既定より勝つ）。folder を渡すとそのまま返り値に現れ、
      // 非可視 space の再現が第 2 引数だけでなく folder 上書きでも可能（fil-0146 の道筋ピン）。
      // ※File 型（Prisma スカラのみ）に folder が無いため、呼び出しはキャストで型を広げて渡す。
      const entity = makeFileEntity(
        {
          folder: makeFolderEntity({ id: 'folder-x', spaceId: DEFAULT_CHANNEL_ID }),
        } as Parameters<typeof makeFileEntity>[0],
        OTHER_SPACE, // 第 2 引数の既定は overrides が存在するとき無視される
      );
      expect(entity.folder).toMatchObject({ id: 'folder-x', spaceId: DEFAULT_CHANNEL_ID });
      // folder を渡さない従来呼び出し（60 箇所）は第 2 引数の値がそのまま載る。
      const legacy = makeFileEntity({ id: 'file-x' }, OTHER_SPACE);
      expect(legacy.folder).toEqual({ spaceId: OTHER_SPACE });
    });

    it('可視 space がゼロなら検索は DB を叩かず空結果（fail-closed）', async () => {
      mockScope.resolveVisibleSpaceIds.mockResolvedValue([]);

      const res = await service.search('請求', MEMBER);

      expect(res.data.items).toEqual([]);
      expect(mockRepo.searchFolders).not.toHaveBeenCalled();
      expect(mockRepo.searchFiles).not.toHaveBeenCalled();
    });

    it('検索ヒットの親が非可視なら parentFolderId を伏せる（非可視な親 id を検索経由で回収させない）', async () => {
      mockRepo.searchFolders.mockResolvedValue([
        makeFolderEntity({ id: 'fd', name: '請求 2026', parentFolderId: 'hidden-parent' }),
      ]);
      mockRepo.searchFiles.mockResolvedValue([]);
      // 親フォルダは別の器にあり、可視集合に入らない。
      mockRepo.findFolderSpaceIds.mockResolvedValue([
        { id: 'hidden-parent', spaceId: OTHER_SPACE },
      ]);

      const res = await service.search('請求', MEMBER);

      expect(res.data.items).toEqual([
        { kind: 'folder', id: 'fd', name: '請求 2026', parentFolderId: null },
      ]);
    });

    it('別の器へのフォルダ移動は 400（同一器内に限る）', async () => {
      mockRepo.findFolderById
        .mockResolvedValueOnce(makeFolderEntity({ id: 'f' }))
        .mockResolvedValueOnce(makeFolderEntity({ id: 'dst', spaceId: OTHER_SPACE }));
      // 移動先の器も可視な場合でも、器を跨ぐ移動そのものを拒否する。
      mockScope.resolveVisibleSpaceIds.mockResolvedValue([DEFAULT_CHANNEL_ID, OTHER_SPACE]);

      await expect(service.moveFolder('f', 'dst', MEMBER)).rejects.toMatchObject({
        message: '別の器へは移動できません',
      });
      expect(mockRepo.moveFolderAtomic).not.toHaveBeenCalled();
    });

    it('別の器へのファイル移動も 400（フォルダ移動と対称）', async () => {
      // 移動元の可視判定はファイル取得の folder include で済む（fil-0146）。findFolderById は移動先のみ。
      mockRepo.findFileById.mockResolvedValue(makeFileEntity({ id: 'file-1', folderId: 'src' }));
      mockRepo.findFolderById.mockResolvedValue(
        makeFolderEntity({ id: 'dst', spaceId: OTHER_SPACE }),
      );
      mockScope.resolveVisibleSpaceIds.mockResolvedValue([DEFAULT_CHANNEL_ID, OTHER_SPACE]);

      await expect(service.moveFile('file-1', 'dst', MEMBER)).rejects.toMatchObject({
        message: '別の器へは移動できません',
      });
      expect(mockRepo.moveFileAtomic).not.toHaveBeenCalled();
    });

    it('一括タグ操作は対象フォルダが 1 件でも非可視なら拒否する（部分適用しない）', async () => {
      mockRepo.countTagsByIds.mockResolvedValue(1);
      mockRepo.findFolderSpaceIds.mockResolvedValue([
        { id: 'folder-1', spaceId: DEFAULT_CHANNEL_ID },
        { id: 'folder-2', spaceId: OTHER_SPACE },
      ]);

      await expect(
        service.assignTagsBatch(
          { folderIds: ['folder-1', 'folder-2'], addTagIds: ['tag-1'] },
          MEMBER,
        ),
      ).rejects.toMatchObject({ message: '存在しないファイルまたはフォルダが含まれています' });
      expect(mockRepo.assignTagsBatch).not.toHaveBeenCalled();
    });

    // fil-0148 M1: 一括タグ操作の「実在不在」と「実在するが非可視」を 4 種プローブで同一文言へ倒す
    // 回帰ピン。2 文言制へ先祖返りするとここで全件落ちる。各プローブは「不在シナリオ」「非可視シナリオ」
    // の 2 段で同一文言を assert する（criteria 1 / 2 / 6）。fil-0146 で実在検証は count → refs
    // （findFileSpaceRefs / findFolderSpaceIds）の件数照合へ統合されたため、不在＝refs から欠落・
    // 非可視＝refs に OTHER_SPACE で実在、としてモックする（実システムの形と一致）。
    type AssignTagsBatchProbe = {
      name: string;
      /** dto の組み立て（fileIds / folderIds）。 */
      dto: Parameters<typeof service.assignTagsBatch>[0];
      /** 不在シナリオの refs モックを設定する。 */
      applyMissingMock: () => void;
      /** 非可視シナリオの refs モックを設定する。 */
      applyHiddenMock: () => void;
    };
    const assignBatchProbes: AssignTagsBatchProbe[] = [
      {
        // プローブ 1: 単一 id プローブ（folder のみ・fileIds=[] は既定モックで空 refs）。
        name: '単一 id プローブ（folder のみ）',
        dto: { folderIds: ['folder-1'], addTagIds: ['tag-1'] },
        applyMissingMock: () => {
          mockRepo.findFolderSpaceIds.mockResolvedValue([]);
        },
        applyHiddenMock: () => {
          mockRepo.findFolderSpaceIds.mockResolvedValue([{ id: 'folder-1', spaceId: OTHER_SPACE }]);
        },
      },
      {
        // プローブ 2: 非可視フォルダ内のファイル単体（folders=[]）。fil-0146: 不在でもファイル側の
        // refs クエリと可視範囲評価は必ず走る（後段の it.each が道筋を assert）。
        name: '非可視フォルダ内ファイル単体',
        dto: { fileIds: ['file-1'], addTagIds: ['tag-1'] },
        applyMissingMock: () => {
          mockRepo.findFileSpaceRefs.mockResolvedValue([]);
        },
        applyHiddenMock: () => {
          mockRepo.findFileSpaceRefs.mockResolvedValue([
            { id: 'file-1', folderId: 'folder-1', spaceId: OTHER_SPACE },
          ]);
        },
      },
      {
        // プローブ 3: 可視ファイル + 非可視フォルダ 混在。files 検査は通過、folder-2 側が不在 / 非可視の
        // どちらも同一文言へ倒れる（folderIds 由来のみ）。
        name: '可視ファイル + 非可視フォルダ 混在',
        dto: { fileIds: ['file-1'], folderIds: ['folder-2'], addTagIds: ['tag-1'] },
        applyMissingMock: () => {
          mockRepo.findFolderSpaceIds.mockResolvedValue([]);
        },
        applyHiddenMock: () => {
          mockRepo.findFolderSpaceIds.mockResolvedValue([{ id: 'folder-2', spaceId: OTHER_SPACE }]);
        },
      },
      {
        // プローブ 4: 1 段深いクロス組み合わせ（CL 2026-08-05 指摘）。folderIds に folder-2（任意 Y・可視）
        // を混ぜ、fileIds の file-1 は folder-1（非可視）所属。Y 不在/実在いずれの応答でも文言が割れない
        // ことを assert する＝fileRefs 由来の非可視が fileIds 経由で見える経路を封鎖。
        name: '1 段深いクロス組み合わせ {非可視ファイル, 任意 Y フォルダ}・CL 2026-08-05 指摘',
        dto: { fileIds: ['file-1'], folderIds: ['folder-2'], addTagIds: ['tag-1'] },
        applyMissingMock: () => {
          mockRepo.findFileSpaceRefs.mockResolvedValue([
            { id: 'file-1', folderId: 'folder-1', spaceId: OTHER_SPACE },
          ]);
          mockRepo.findFolderSpaceIds.mockResolvedValue([]);
        },
        applyHiddenMock: () => {
          mockRepo.findFileSpaceRefs.mockResolvedValue([
            { id: 'file-1', folderId: 'folder-1', spaceId: OTHER_SPACE },
          ]);
          mockRepo.findFolderSpaceIds.mockResolvedValue([
            { id: 'folder-2', spaceId: DEFAULT_CHANNEL_ID },
          ]);
        },
      },
    ];

    const BATCH_NOT_FOUND_MESSAGE = '存在しないファイルまたはフォルダが含まれています';
    it.each(assignBatchProbes)(
      '一括タグ操作: $name — 不在シナリオも非可視シナリオも同一文言の 400（fil-0148 M1 / fil-0146 道筋）',
      async ({ dto, applyMissingMock, applyHiddenMock }) => {
        mockRepo.countTagsByIds.mockResolvedValue(1);

        // 不在シナリオ（実在検証が 400 で拒否）。
        applyMissingMock();
        await expect(service.assignTagsBatch(dto, MEMBER)).rejects.toMatchObject({
          message: BATCH_NOT_FOUND_MESSAGE,
        });
        // fil-0146: 不在の枝でも可視範囲評価と両 refs クエリを必ず通ってから判定する（クエリの回数と
        // 形が入力のみで決まる＝「速ければ不在」の逆転 oracle を作らない道筋ピン）。
        expect(mockScope.resolveVisibleSpaceIds).toHaveBeenCalled();
        expect(mockRepo.findFileSpaceRefs).toHaveBeenCalledWith(dto.fileIds ?? []);
        expect(mockRepo.findFolderSpaceIds).toHaveBeenCalledWith(dto.folderIds ?? []);

        // 非可視シナリオ（可視性拒否も同じ文言で判別不能）。
        applyHiddenMock();
        await expect(service.assignTagsBatch(dto, MEMBER)).rejects.toMatchObject({
          message: BATCH_NOT_FOUND_MESSAGE,
        });
        expect(mockRepo.assignTagsBatch).not.toHaveBeenCalled();
      },
    );

    // fil-0148 M3: 単件 10 経路の「非可視 → 不在時と同一ステータス（404）・同一文言」を table-driven で固定する。
    // 実装が 1 行消えると fail-open に戻る箇所の回帰ピン。各経路で「判定後のクエリ not called」を
    // assert する（最初の取得クエリ＝対象行の読み込みは非可視判定の前提なので対象外）。
    const visibilityProbes: {
      name: string;
      missing: () => void;
      hidden: () => void;
      invoke: () => Promise<unknown>;
      message: string;
      afterQuery: jest.Mock;
    }[] = [
      {
        name: 'downloadFile',
        missing: () => mockRepo.findLatestVersionWithFile.mockResolvedValue(null),
        hidden: () => {
          // fil-0146: 非可視は取得行に同乗する folder.spaceId で判定される（findFolderById は使わない）。
          mockRepo.findLatestVersionWithFile.mockResolvedValue({
            ...makeFileWithLatestVersion({ folderId: 'folder-1' }),
            folder: { spaceId: OTHER_SPACE },
          });
        },
        invoke: () => service.downloadFile('file-1', MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockStorage.createReadStream,
      },
      {
        name: 'downloadFileVersion',
        missing: () => mockRepo.findVersionWithFile.mockResolvedValue(null),
        hidden: () => {
          mockRepo.findVersionWithFile.mockResolvedValue({
            ...makeFileVersionEntity(),
            file: makeFileEntity({ id: 'file-1', folderId: 'folder-1' }, OTHER_SPACE),
          });
        },
        invoke: () => service.downloadFileVersion('file-1', 1, MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockStorage.createReadStream,
      },
      {
        name: 'uploadFile',
        missing: () => mockRepo.findFolderById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ spaceId: OTHER_SPACE })),
        invoke: () => service.uploadFile('folder-1', makeUpload(), MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.findSettings,
      },
      {
        name: 'uploadFileVersion',
        missing: () => mockRepo.findFileById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFileById.mockResolvedValue(
            makeFileEntity({ folderId: 'folder-1' }, OTHER_SPACE),
          ),
        invoke: () => service.uploadFileVersion('file-1', makeUpload(), MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.findSettings,
      },
      {
        name: 'getFileMeta',
        missing: () => mockRepo.findFileById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFileById.mockResolvedValue(
            makeFileEntity({ folderId: 'folder-1' }, OTHER_SPACE),
          ),
        invoke: () => service.getFileMeta('file-1', MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.getMaxVersionNo,
      },
      {
        name: 'deleteFile',
        missing: () => mockRepo.findFileWithAllVersions.mockResolvedValue(null),
        hidden: () => {
          mockRepo.findFileWithAllVersions.mockResolvedValue({
            ...makeFileEntity({ folderId: 'folder-1' }, OTHER_SPACE),
            versions: [makeFileVersionEntity()],
          });
        },
        invoke: () => service.deleteFile('file-1', MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.deleteFile,
      },
      {
        name: 'deleteFolder',
        missing: () => mockRepo.findFolderById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ spaceId: OTHER_SPACE })),
        invoke: () => service.deleteFolder('folder-1', MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.deleteEmptyFolder,
      },
      {
        name: 'setFileTags',
        missing: () => mockRepo.findFileById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFileById.mockResolvedValue(
            makeFileEntity({ folderId: 'folder-1' }, OTHER_SPACE),
          ),
        invoke: () => service.setFileTags('file-1', ['tag-1'], MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.setFileTags,
      },
      {
        // fil-0146: 移動元も同表へ追加（title の「並行削除 409 集約」と同じ moveFile の入口・移動系は
        // 単件 1 文言化の対象外なので文言だけ固有）。
        name: 'moveFile（移動元）',
        missing: () => mockRepo.findFileById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFileById.mockResolvedValue(
            makeFileEntity({ folderId: 'folder-1' }, OTHER_SPACE),
          ),
        invoke: () => service.moveFile('file-1', 'folder-2', MEMBER),
        message: '移動対象のファイルが見つかりません',
        afterQuery: mockRepo.moveFileAtomic,
      },
      {
        name: 'setFolderTags',
        missing: () => mockRepo.findFolderById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ spaceId: OTHER_SPACE })),
        invoke: () => service.setFolderTags('folder-1', ['tag-1'], MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.setFolderTags,
      },
      {
        name: 'createFolder（親非可視）',
        missing: () => mockRepo.findFolderById.mockResolvedValue(null),
        hidden: () =>
          mockRepo.findFolderById.mockResolvedValue(makeFolderEntity({ spaceId: OTHER_SPACE })),
        invoke: () => service.createFolder('folder-1', '新規フォルダ', MEMBER),
        message: SINGLE_TARGET_NOT_FOUND_MESSAGE,
        afterQuery: mockRepo.findFolderByParentAndName,
      },
    ];

    it.each(visibilityProbes)(
      '$name — 非可視 space の対象は不在時と同一文言の 404（fil-0148 M3 / fil-0146 道筋・warn）',
      async ({ missing, hidden, invoke, message, afterQuery }) => {
        const warnSpy = jest
          .spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
          .mockImplementation(() => undefined);

        missing();
        await expect(invoke()).rejects.toMatchObject({ message });
        // fil-0146: 不在の枝でも可視範囲評価（visibleSpaceIds）を通ってから 404 になる
        // （不在だけ評価を省略して速く返る timing oracle を再発させない道筋ピン）。
        expect(mockScope.resolveVisibleSpaceIds).toHaveBeenCalled();
        // 不在は warn に記録しない（打ち間違いの掃き溜めで本物の探索を埋めない）。
        await new Promise((resolve) => setImmediate(resolve));
        expect(warnSpy).not.toHaveBeenCalled();

        hidden();
        await expect(invoke()).rejects.toMatchObject({ message });
        // 判定後のクエリは非可視時に走らない（fail-open への退行をここで落とす）。
        expect(afterQuery).not.toHaveBeenCalled();
        // 非可視は warn 1 回（404 応答後に setImmediate で非同期に書かれる）。※単一対象経路は
        // 「warn 1 回」のまま（1 行集約は一括経路のみ・cmn-0422）。
        await new Promise((resolve) => setImmediate(resolve));
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FOLDER_NOT_VISIBLE'));
        warnSpy.mockRestore();
      },
    );
  });
});
