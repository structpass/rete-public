// cmn-0395: e2e レート制限の素通し判定（throttle-skip.ts）の単体検証。
//
// - criteria 3: 本番（NODE_ENV=production）では env を立てても素通ししない。
// - criteria 4: 設定項目を立てていない状態ではレート制限が従来どおり効く（判定は false）。
import { throttleBypassEnabled } from './throttle-skip';

const REAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...REAL_ENV };
});

describe('throttleBypassEnabled（cmn-0395）', () => {
  it('NODE_ENV=production では E2E_THROTTLE_BYPASS=true でも素通ししない（criteria 3）', () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'production', E2E_THROTTLE_BYPASS: 'true' };
    expect(throttleBypassEnabled()).toBe(false);
  });

  it('development + E2E_THROTTLE_BYPASS=true で素通しする', () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'development', E2E_THROTTLE_BYPASS: 'true' };
    expect(throttleBypassEnabled()).toBe(true);
  });

  it('E2E_THROTTLE_BYPASS 未設定なら素通ししない（従来どおりレート制限が効く・criteria 4）', () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'development' };
    delete process.env.E2E_THROTTLE_BYPASS;
    expect(throttleBypassEnabled()).toBe(false);
  });

  it('E2E_THROTTLE_BYPASS が true 以外（false / 空 / 大文字）なら素通ししない', () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'development', E2E_THROTTLE_BYPASS: 'false' };
    expect(throttleBypassEnabled()).toBe(false);
    process.env = { ...REAL_ENV, NODE_ENV: 'development', E2E_THROTTLE_BYPASS: '' };
    expect(throttleBypassEnabled()).toBe(false);
    process.env = { ...REAL_ENV, NODE_ENV: 'development', E2E_THROTTLE_BYPASS: 'TRUE' };
    expect(throttleBypassEnabled()).toBe(false);
  });

  it('env をリクエスト時に読む（呼び出しのたびに評価＝起動後に変えても反映される・criteria 8）', () => {
    process.env = { ...REAL_ENV, NODE_ENV: 'development' };
    delete process.env.E2E_THROTTLE_BYPASS;
    expect(throttleBypassEnabled()).toBe(false);
    process.env.E2E_THROTTLE_BYPASS = 'true';
    // 同じ関数の再呼び出しで反映される（クロージャ生成時にスナップショットしない）
    expect(throttleBypassEnabled()).toBe(true);
  });
});
