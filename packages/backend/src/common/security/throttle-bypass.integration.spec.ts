// cmn-0395 criteria 5: 素通し（skipIf）が**窓口ごとに個別指定されたレート制限**（@Throttle）にも
// 効くことの integration 検証。
//
// 検証する機構（grounding 7・@nestjs/throttler v6 の throttler.guard.js:72-77）:
//   skipIf の評価は route/class の limit・ttl 読み取り（:77-78）より**前**。よって @Throttle で
//   上書きされたルートも素通しでき、個別指定を書き換えずに済む。これを実 HTTP で固定する。
//
// 実測で確認した事実（本 spec が守る回帰）:
//   - ThrottlerModule.forRoot を配列形式で渡すとトップレベルの skipIf が読まれない
//     （throttler.guard.js:45-47 で commonOptions = {} になる）。オブジェクト形式
//     `{ throttlers: [...], skipIf }` が必須（app.module.ts は本チケットでこちらへ変更済み）。
import { APP_GUARD } from '@nestjs/core';
import { Controller, Get } from '@nestjs/common';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { throttleBypassEnabled } from './throttle-skip';

// 窓口ごとの個別制限（limit:1）を付けた最小コントローラ。login 系の 5/60s と同型の「全体既定より
// 厳しい個別指定」を模す。
@Controller('throttle-test')
class ThrottleTestController {
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Get()
  limited() {
    return { ok: true };
  }
}

const REAL_ENV = { ...process.env };

async function bootApp(): Promise<{ app: INestApplication; port: number }> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 30 }],
        // app.module.ts と同じ判定関数をそのまま使う（本実装の integration 検証）。
        skipIf: () => throttleBypassEnabled(),
      }),
    ],
    controllers: [ThrottleTestController],
    providers: [
      // 実アプリ（app.module.ts）と同じ登録方法: ThrottlerGuard を APP_GUARD として useClass 登録。
      // ThrottlerModule が ThrottlerStorage（in-memory）を provider として用意するため、guard の
      // コンストラクタ注入（storageService）が解決される。
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  const server = app.getHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { app, port };
}

afterEach(async () => {
  process.env = { ...REAL_ENV };
});

describe('skipIf による個別 @Throttle の素通し（cmn-0395 criteria 5）', () => {
  it('素通しが無効（既定）なら、limit:1 の個別指定ルートは 2 回目に 429 になる', async () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'development' };
    delete process.env.E2E_THROTTLE_BYPASS;
    const { app, port } = await bootApp();
    try {
      const url = `http://127.0.0.1:${port}/throttle-test`;
      const r1 = await fetch(url);
      expect(r1.status).toBe(200);
      const r2 = await fetch(url);
      expect(r2.status).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('素通しが有効なら、limit:1 の個別指定ルートでも連続して素通しする（@Throttle に効く）', async () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'development', E2E_THROTTLE_BYPASS: 'true' };
    const { app, port } = await bootApp();
    try {
      const url = `http://127.0.0.1:${port}/throttle-test`;
      // limit:1 を大きく超える連続アクセスで素通しが効くことを見る
      const statuses = [];
      for (let i = 0; i < 5; i++) {
        const r = await fetch(url);
        statuses.push(r.status);
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200]);
    } finally {
      await app.close();
    }
  });

  it('本番（NODE_ENV=production）では env を立てても素通ししない（criteria 3・integration）', async () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'production', E2E_THROTTLE_BYPASS: 'true' };
    const { app, port } = await bootApp();
    try {
      const url = `http://127.0.0.1:${port}/throttle-test`;
      expect((await fetch(url)).status).toBe(200);
      expect((await fetch(url)).status).toBe(429); // 本番は素通しせず従来どおり制限が効く
    } finally {
      await app.close();
    }
  });
});

// code-reviewer MEDIUM 是正: app.module.ts の実配線（forRoot 形式）を回帰固定する。
// 本 spec の bootApp は ThrottlerModule をインラインで再構築しており、app.module.ts の形式が
// 配列（forRoot([...])）へ戻っても素通しが静かに死ぬのを検出できない。app.module.ts のソースを
// 読み、`ThrottlerModule.forRoot(` の直後が `[`（配列形式＝commonOptions が {} になり skipIf が
// 読まれない）でないことを固定する（throttler.guard.js:45-47・grounding 8）。
describe('app.module.ts の forRoot 形式（cmn-0395 code-reviewer MEDIUM 是正）', () => {
  it('ThrottlerModule.forRoot はオブジェクト形式（{ throttlers, skipIf }）で配列形式でない', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8');
    // forRoot 呼び出しを探し、直後の文字で形式を判定する
    const match = src.match(/ThrottlerModule\.forRoot\(\s*([\[{])/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('{');
    // 配列形式（forRoot([）が残っていないこと
    expect(src.includes('ThrottlerModule.forRoot([')).toBe(false);
    // skipIf への配線（トップレベル skipIf）が存在すること
    expect(src).toMatch(/skipIf:\s*\(\)\s*=>\s*throttleBypassEnabled\(\)/);
  });
});
