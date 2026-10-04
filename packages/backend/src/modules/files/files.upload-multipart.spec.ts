/**
 * アップロード受け（POST /files/folders/:id/files）の multipart 制限の回帰（v2-189）。
 *
 * 実サーバーで 1 ファイルの multipart が 400 Too many parts になっていた。原因は limits.parts=1 で、
 * multer 2.x は busboy の partsLimit を LIMIT_PART_COUNT のエラーへ変換するため、busboy が parts を
 * 初期境界の分だけ -1 から数える仕様と組み合わさると正当な 1 パート目で上限に達していた。
 *
 * この spec は controller を実 Express へ載せて本物の multer / FileInterceptor を通す（メソッド直呼びでは
 * multipart 層が素通りするため回帰を検出できない）。保証する形は 2 つ:
 * - 1 ファイルの multipart が 201 で通る（再発防止）
 * - 複数ファイル・非ファイルフィールドは 400 で拒否される（DoS ガードを弱めていない）
 *
 * 拒否時の応答本文は v2-191 で日本語の案内文へ変わったため、応答 shape ごと固定する（filter の配線が
 * 外れて英語のまま返る退行を、ここで検出する）。
 *
 * v2-191 のレビュー指摘（MEDIUM）: アップロード用のフィルタはメソッド単位で付くため、@Catch()（全例外）に
 * するとグローバルの PrismaExceptionFilter をこの 2 経路だけ影落ちさせる。DB 例外の写像（P2002 → 409）が
 * 維持されることを、グローバル filter を実際に登録した app で固定する。
 */
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Role } from '@rete/shared';
import { AllExceptionsFilter, PrismaExceptionFilter } from '../../common/filters';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.service';

const FOLDER_ID = '11111111-2222-4333-8444-555555555555';
const ACTOR = { id: 'account-1', role: Role.MEMBER } as unknown as AuthenticatedUser;
const UPLOADED = { success: true, data: { kind: 'file', id: 'file-1', versionNo: 1 } };

const uploadFile = jest.fn();
const uploadFileVersion = jest.fn();

/** multipart のパート（filename があれば file パート・無ければ非ファイルフィールド）。 */
interface Part {
  name: string;
  value: string;
  filename?: string;
}

describe('FilesController アップロード受けの multipart 制限', () => {
  let app: INestApplication;
  let origin: string;
  let storageRoot: string;
  let previousStorageRoot: string | undefined;

  beforeAll(async () => {
    // multer の diskStorage が書く一時フォルダだけをテスト専用の使い捨て領域へ逃がす。
    previousStorageRoot = process.env.FILE_STORAGE_ROOT;
    storageRoot = await mkdtemp(join(tmpdir(), 'rete-upload-spec-'));
    process.env.FILE_STORAGE_ROOT = storageRoot;

    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        { provide: FilesService, useValue: { uploadFile, uploadFileVersion } },
        // 本番（app.module）と同じ順序でグローバル filter を登録する。メソッド単位の UploadErrorFilter が
        // PrismaExceptionFilter を影落ちさせていないかを、実際の filter 解決順で検証するため。
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_FILTER, useClass: PrismaExceptionFilter },
      ],
    })
      // 認証は本 spec の対象外。passport を通さず req.user を直接与える。
      .overrideGuard(AuthenticatedGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = ACTOR;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // localhost は ::1 へ解決される環境があるため IPv4 を明示して listen する。
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await app?.close();
    if (previousStorageRoot === undefined) delete process.env.FILE_STORAGE_ROOT;
    else process.env.FILE_STORAGE_ROOT = previousStorageRoot;
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  beforeEach(() => {
    uploadFile.mockResolvedValue(UPLOADED);
    uploadFileVersion.mockResolvedValue(UPLOADED);
  });

  const upload = (parts: Part[]) => {
    const form = new FormData();
    for (const part of parts) {
      if (part.filename) {
        form.append(part.name, new Blob([part.value], { type: 'text/plain' }), part.filename);
      } else {
        form.append(part.name, part.value);
      }
    }
    return fetch(`${origin}/files/folders/${FOLDER_ID}/files`, { method: 'POST', body: form });
  };

  /** Content-Disposition を持たないパートを含む multipart を生バイトで送る（FormData では作れない形）。 */
  const uploadWithDispositionlessPart = () => {
    const boundary = 'v2-189-boundary';
    const body = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="a.txt"',
        'Content-Type: text/plain',
        '',
        'a',
        `--${boundary}`,
        // Content-Disposition が無いパート。busboy はファイルにもフィールドにも数えず読み捨てる。
        'Content-Type: text/plain',
        '',
        'ignored',
        `--${boundary}--`,
        '',
      ].join('\r\n'),
    );
    return fetch(`${origin}/files/folders/${FOLDER_ID}/files`, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
  };

  it('1 ファイルの multipart を 201 で受け付ける（v2-189 回帰: 400 Too many parts にならない）', async () => {
    const res = await upload([
      { name: 'file', value: '[DiskInfo]\nVersion=3\n', filename: 'DiskInfo3.ini' },
    ]);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(UPLOADED);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith(
      FOLDER_ID,
      expect.objectContaining({ originalname: 'DiskInfo3.ini' }),
      ACTOR,
    );
  });

  it('2 ファイルの multipart は 400 で拒否する（files: 1 のガードは維持）', async () => {
    const res = await upload([
      { name: 'file', value: 'a', filename: 'a.txt' },
      { name: 'file', value: 'b', filename: 'b.txt' },
    ]);

    expect(res.status).toBe(400);
    // 拒否理由は英語のままだと画面に出せないため、controller の filter が日本語へ訳す（v2-191）。
    expect(await res.json()).toEqual({
      success: false,
      error: { code: 'BAD_REQUEST', message: '1 回にアップロードできるファイルは 1 件です' },
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('ファイル 1 + 非ファイルフィールド 1 の multipart は 400 で拒否する（fields: 0 のガードは維持）', async () => {
    const res = await upload([
      { name: 'file', value: 'a', filename: 'a.txt' },
      { name: 'note', value: 'x'.repeat(64) },
    ]);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'ファイルと一緒に項目は送信できません' },
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('Content-Disposition 無しパートの混入は 400 で拒否する（parts: 1 = 実質 1 パートで固定）', async () => {
    const res = await uploadWithDispositionlessPart();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: '送信されたデータの形式が不正です（区切りの数が上限を超えました）',
      },
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('回数制限の 429 も日本語で案内する（フレームワーク名を画面へ出さない）', async () => {
    uploadFile.mockRejectedValue(new ThrottlerException());

    const res = await upload([{ name: 'file', value: 'a', filename: 'a.txt' }]);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'アップロードの回数が多すぎます。少し待ってからお試しください',
      },
    });
  });

  it('DB の一意制約違反はグローバルの PrismaExceptionFilter が受けて 409 を返す（影落ちしない）', async () => {
    uploadFile.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'spec',
        meta: { target: ['folderId', 'name'] },
      }),
    );

    const res = await upload([{ name: 'file', value: 'a', filename: 'a.txt' }]);

    // UploadErrorFilter を @Catch()（全例外）にすると、この 2 経路だけ 500 INTERNAL_ERROR へ化ける。
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: 'CONFLICT', message: '指定された値は既に使用されています' },
    });
  });
});
