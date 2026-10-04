import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import {
  shouldUsePersistentStore,
  createSessionStore,
  SESSION_POOL_MAX,
} from './session-store.config';

// connect-pg-simple の実体は pg Pool を抱え prune クエリを叩くため、構築可否のみをモックで検証する。
// 振る舞い（ストアクラスを返す）は resetMocks で毎テスト剥がれるため beforeEach で張り直す。
jest.mock('connect-pg-simple', () => jest.fn());

class MockPgStore {
  readonly options: unknown;
  constructor(options: unknown) {
    this.options = options;
  }
}

const mockConnectPgSimple = connectPgSimple as unknown as jest.Mock;

beforeEach(() => {
  mockConnectPgSimple.mockImplementation(() => MockPgStore);
});

describe('shouldUsePersistentStore', () => {
  it('本番では常に永続ストアを要求する', () => {
    expect(shouldUsePersistentStore({ NODE_ENV: 'production' })).toBe(true);
    // 本番では SESSION_STORE に関わらず永続ストア
    expect(shouldUsePersistentStore({ NODE_ENV: 'production', SESSION_STORE: 'memory' })).toBe(
      true,
    );
  });

  it('dev は既定で MemoryStore（永続ストア不要）', () => {
    expect(shouldUsePersistentStore({ NODE_ENV: 'development' })).toBe(false);
    expect(shouldUsePersistentStore({})).toBe(false);
  });

  it('dev でも SESSION_STORE=pg なら永続ストアを使う', () => {
    expect(shouldUsePersistentStore({ NODE_ENV: 'development', SESSION_STORE: 'pg' })).toBe(true);
  });

  it('dev で SESSION_STORE が pg 以外なら MemoryStore', () => {
    expect(shouldUsePersistentStore({ SESSION_STORE: 'redis' })).toBe(false);
  });
});

describe('createSessionStore', () => {
  it('dev 既定では undefined を返す（express-session 既定の MemoryStore）', () => {
    expect(createSessionStore(session, { NODE_ENV: 'development' })).toBeUndefined();
  });

  it('本番で DATABASE_URL 未設定なら fail-fast で throw する', () => {
    expect(() => createSessionStore(session, { NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('本番では connect-pg-simple ストアを createTableIfMissing:false で構築する', () => {
    const store = createSessionStore(session, {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    }) as unknown as { options: Record<string, unknown> };

    expect(store).toBeDefined();
    expect(store.options).toMatchObject({
      conObject: {
        connectionString: 'postgresql://u:p@localhost:5432/db',
        max: SESSION_POOL_MAX,
      },
      tableName: 'session',
      createTableIfMissing: false,
    });
  });

  it('dev でも SESSION_STORE=pg なら pg ストアを構築する', () => {
    const store = createSessionStore(session, {
      NODE_ENV: 'development',
      SESSION_STORE: 'pg',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    }) as unknown as { options: Record<string, unknown> };
    // cmn-0335: 兄弟テスト（上・本番 pg ストア）と同じ強さで検証する（toBeDefined のみでは何も確かめない）。
    expect(store).toBeDefined();
    expect(store.options).toMatchObject({
      conObject: {
        connectionString: 'postgresql://u:p@localhost:5432/db',
        max: SESSION_POOL_MAX,
      },
      tableName: 'session',
      createTableIfMissing: false,
    });
  });

  it('errorLog を渡すとストアに透過される（既定 console.error を避ける）', () => {
    const errorLog = jest.fn();
    const store = createSessionStore(
      session,
      { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' },
      { errorLog },
    ) as unknown as { options: Record<string, unknown> };
    expect(store.options).toMatchObject({ errorLog });
  });
});
