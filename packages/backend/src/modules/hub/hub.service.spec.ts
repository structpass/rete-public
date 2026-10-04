import { HubService } from './hub.service';

describe('HubService', () => {
  let service: HubService;
  // env はプロセス共有のため、テスト前後で REFERENCE_APP_URL / REFERENCE_OIDC_READY を保存・復元する。
  const ORIGINAL_REFERENCE_URL = process.env.REFERENCE_APP_URL;
  const ORIGINAL_REFERENCE_READY = process.env.REFERENCE_OIDC_READY;

  beforeEach(() => {
    service = new HubService();
  });

  afterEach(() => {
    if (ORIGINAL_REFERENCE_URL === undefined) {
      delete process.env.REFERENCE_APP_URL;
    } else {
      process.env.REFERENCE_APP_URL = ORIGINAL_REFERENCE_URL;
    }
    if (ORIGINAL_REFERENCE_READY === undefined) {
      delete process.env.REFERENCE_OIDC_READY;
    } else {
      process.env.REFERENCE_OIDC_READY = ORIGINAL_REFERENCE_READY;
    }
  });

  describe('getMenu', () => {
    it('tasks と reference の 2 導線をこの順で返すこと', () => {
      const keys = service.getMenu().items.map((i) => i.key);
      expect(keys).toEqual(['tasks', 'reference']);
    });

    it('tasks は internal / rete カテゴリで未接続（available=false）であること', () => {
      const tasks = service.getMenu().items.find((i) => i.key === 'tasks')!;
      expect(tasks.type).toBe('internal');
      expect(tasks.category).toBe('rete');
      expect(tasks.href).toBe('/tasks');
      expect(tasks.available).toBe(false);
    });

    it('REFERENCE_APP_URL 未設定時、reference は localhost:3000 にフォールバックし available=false', () => {
      delete process.env.REFERENCE_APP_URL;
      delete process.env.REFERENCE_OIDC_READY;
      const reference = service.getMenu().items.find((i) => i.key === 'reference')!;
      expect(reference.href).toBe('http://localhost:3000');
      expect(reference.available).toBe(false);
    });

    it('URL 設定済みでも REFERENCE_OIDC_READY 未設定なら available=false（連携完成までグレー）', () => {
      // URL があるだけでは導線を有効化しない。OIDC RP 連携が完成するまで「準備中」に保つ。
      process.env.REFERENCE_APP_URL = 'https://ref.example.com';
      delete process.env.REFERENCE_OIDC_READY;
      const reference = service.getMenu().items.find((i) => i.key === 'reference')!;
      expect(reference.href).toBe('https://ref.example.com');
      expect(reference.available).toBe(false);
    });

    it('URL 設定 + REFERENCE_OIDC_READY=true で reference は当該 URL を指し external / system で available=true', () => {
      process.env.REFERENCE_APP_URL = 'https://ref.example.com';
      process.env.REFERENCE_OIDC_READY = 'true';
      const reference = service.getMenu().items.find((i) => i.key === 'reference')!;
      expect(reference.href).toBe('https://ref.example.com');
      expect(reference.available).toBe(true);
      expect(reference.type).toBe('external');
      expect(reference.category).toBe('system');
    });

    it('REFERENCE_OIDC_READY=true でも URL が空文字なら available=false（空 href の有効化を防ぐ）', () => {
      process.env.REFERENCE_APP_URL = '';
      process.env.REFERENCE_OIDC_READY = 'true';
      const reference = service.getMenu().items.find((i) => i.key === 'reference')!;
      expect(reference.available).toBe(false);
      // 空文字フォールバックは href にデフォルトが入る（?? は null/undefined のみ捕捉のため空文字は素通り → 既存挙動を固定）。
      expect(reference.href).toBe('');
    });

    it('READY=true でも危険スキーム（javascript:/file:）の URL は available=false（open redirect/XSS 防御）', () => {
      // href は frontend で window.location.href + probe fetch に渡るため、http(s) 以外は連携不可に倒す。
      process.env.REFERENCE_OIDC_READY = 'true';
      for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
        process.env.REFERENCE_APP_URL = bad;
        const reference = service.getMenu().items.find((i) => i.key === 'reference')!;
        expect(reference.available).toBe(false);
      }
    });

    it('http / https スキームは従来どおり available=true（防御で正常系を巻き込まない）', () => {
      process.env.REFERENCE_OIDC_READY = 'true';
      for (const ok of ['http://localhost:3000', 'https://ref.example.com']) {
        process.env.REFERENCE_APP_URL = ok;
        const reference = service.getMenu().items.find((i) => i.key === 'reference')!;
        expect(reference.available).toBe(true);
      }
    });
  });
});
