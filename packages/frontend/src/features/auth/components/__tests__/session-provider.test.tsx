import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Role } from '@rete/shared';
import { SessionProvider, useSessionContext } from '../session-provider';
import { useSession } from '../../hooks/use-session';

// fetchMe（/auth/me）と fetchHubMenu（/hub/menu）をモック。
// provider はこれらを「アプリ起動時に 1 回だけ」呼ぶのが本テストの主眼。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
// cmn-0420: fetchDisplayPreference もモック。provider がログイン確定後に呼ぶが未モックだったため、
// 実 XHR が backend へ飛んでいた（CI では AggregateError ノイズ・reject は provider が握り潰す）。
const { fetchMe, fetchHubMenu, fetchDisplayPreference, applyDisplayPreference } = vi.hoisted(
  () => ({
    fetchMe: vi.fn(),
    fetchHubMenu: vi.fn(),
    fetchDisplayPreference: vi.fn(),
    applyDisplayPreference: vi.fn(),
  }),
);

vi.mock('../../lib/api', () => ({
  fetchMe: (...a: unknown[]) => fetchMe(...a),
}));
vi.mock('@/features/hub', () => ({
  fetchHubMenu: (...a: unknown[]) => fetchHubMenu(...a),
}));
vi.mock('@/features/settings/lib/display-preference-api', () => ({
  fetchDisplayPreference: (...a: unknown[]) => fetchDisplayPreference(...a),
  applyDisplayPreference: (...a: unknown[]) => applyDisplayPreference(...a),
}));

const ACCOUNT = { id: 'u1', email: 'boss@example.com', name: '田中', role: Role.ADMIN };
const MENU = {
  items: [
    {
      key: 'reference',
      label: 'リファレンス',
      description: '',
      category: 'system',
      type: 'external',
      href: 'http://localhost:3000',
      available: true,
    },
  ],
};

function Probe() {
  const { user, loading, menuItems } = useSessionContext();
  const s = useSession();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.name ?? 'none'}</span>
      <span data-testid="menu">{menuItems.length}</span>
      <span data-testid="hook-user">{s.user?.name ?? 'none'}</span>
    </div>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMe.mockResolvedValue(ACCOUNT);
    fetchHubMenu.mockResolvedValue(MENU);
    // 未保存（null）＝ CSS 既定のまま。表示個人設定の反映内容自体は本テストの関心外（cmn-0420）。
    fetchDisplayPreference.mockResolvedValue(null);
  });

  it('起動時に /auth/me を 1 回だけ呼び、user を context / useSession の両方へ供給する', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));
    expect(fetchMe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('hook-user')).toHaveTextContent('田中');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('user 解決後に hub menu を 1 回取得し menuItems を供給する', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('menu')).toHaveTextContent('1'));
    expect(fetchHubMenu).toHaveBeenCalledTimes(1);
  });

  it('consumer が複数あっても session 取得は 1 回だけ（再マウントで再取得しない設計の核）', async () => {
    render(
      <SessionProvider>
        <Probe />
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId('user')[0]).toHaveTextContent('田中'));
    expect(fetchMe).toHaveBeenCalledTimes(1);
  });

  it('未ログイン（/auth/me が 200+null）なら user=null・menu は取得しない（rete-files-0024）', async () => {
    fetchMe.mockResolvedValue(null);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(fetchHubMenu).not.toHaveBeenCalled();
  });

  it('/auth/me が失敗（ネットワーク等）でも user=null へフォールバックする', async () => {
    fetchMe.mockRejectedValue(new Error('network'));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(fetchHubMenu).not.toHaveBeenCalled();
  });

  it('setUser でログイン後の user を反映でき、その時 hub menu 取得が走る（ログイン動線の回帰防止）', async () => {
    fetchMe.mockResolvedValue(null); // 起動時は未ログイン（200+null / rete-files-0024）

    function LoginProbe() {
      const { user, setUser } = useSessionContext();
      return (
        <button type="button" onClick={() => setUser(ACCOUNT)}>
          {user?.name ?? 'none'}
        </button>
      );
    }

    render(
      <SessionProvider>
        <LoginProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('none'));
    expect(fetchHubMenu).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('田中'));
    await waitFor(() => expect(fetchHubMenu).toHaveBeenCalledTimes(1));
  });

  it('setUser(null) で user をクリアできる（ログアウト動線の回帰防止）', async () => {
    function LogoutProbe() {
      const { user, setUser } = useSessionContext();
      return (
        <button type="button" onClick={() => setUser(null)}>
          {user?.name ?? 'none'}
        </button>
      );
    }

    render(
      <SessionProvider>
        <LogoutProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('田中'));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('none'));
  });

  // cmn-0382: 他タブから戻った時（visibilitychange → visible）の権限取り直し。
  describe('visibilitychange での /auth/me 取り直し（cmn-0382）', () => {
    // jsdom の document.visibilityState は 'visible' 固定のため、hidden を経ずに visible の
    // visibilitychange を直接 dispatch する（listener は visible 以外を無視する分岐を持つ）。
    function goVisible() {
      fireEvent(document, new Event('visibilitychange'));
    }
    function setVisibilityState(state: 'visible' | 'hidden') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    }

    it('visible へ戻ると /auth/me を取り直し、最新の user が反映される（criteria 1）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      fetchMe.mockResolvedValue({ ...ACCOUNT, name: '田中(更新後)' });
      nowSpy.mockReturnValue(1_000_000 + 61_000); // スロットル窓の外
      goVisible();

      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中(更新後)'));
      expect(fetchMe).toHaveBeenCalledTimes(2);
      nowSpy.mockRestore();
    });

    it('60 秒以内の再訪では取り直さない（criteria 3・連打抑止）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible(); // 1 回目（取り直しが走る）
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));

      nowSpy.mockReturnValue(1_000_000 + 61_000 + 30_000); // 窓内
      goVisible();
      goVisible();
      // 60 秒窓内は再取得しない
      expect(fetchMe).toHaveBeenCalledTimes(2);
      nowSpy.mockRestore();
    });

    it('取り直しに失敗してもログイン状態表示を失わない（criteria 2）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      fetchMe.mockRejectedValue(new Error('network'));
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible();

      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));
      // 失敗時は表示維持（null 化しない）
      expect(screen.getByTestId('user')).toHaveTextContent('田中');
      nowSpy.mockRestore();
    });

    it('hidden への遷移では取り直さない（visible のみ発火）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      setVisibilityState('hidden');
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible(); // イベントは飛ぶが visibilityState=hidden
      expect(fetchMe).toHaveBeenCalledTimes(1);
      setVisibilityState('visible'); // 後続テストのため戻す
      nowSpy.mockRestore();
    });

    // cmn-0410 LOW 2: 起動直後の初回 fetch がスロットル基準時刻を進めるため、
    // 起動直後 60 秒以内のタブ復帰で 2 リクエスト目が飛ばない。
    it('起動直後 60 秒以内のタブ復帰では取り直さない（criteria 3・cmn-0410）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));
      expect(fetchMe).toHaveBeenCalledTimes(1);

      nowSpy.mockReturnValue(1_000_000 + 30_000); // 起動直後 30 秒（60 秒窓の内側）
      goVisible();
      expect(fetchMe).toHaveBeenCalledTimes(1); // 2 リクエスト目は飛ばない
      nowSpy.mockRestore();
    });

    // cmn-0410 LOW 3: 再取得成功かつ null（セッション失効）→ user null 化。
    // 実装コメント（session-provider.tsx cmn-0382 注記）で意図している分岐を固定する。
    it('取り直しで null（セッション失効）が返ると user が null になる（criteria 4・cmn-0410）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      fetchMe.mockResolvedValue(null); // セッション失効
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible();

      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
      nowSpy.mockRestore();
    });

    // cmn-0410 MEDIUM 1: 世代カウンタにより、古い in-flight 応答が後着で新しい表示を上書きしない。
    // 初回 fetch を保留したまま取り直しを発射し、取り直しの応答を先に反映 → 古い初回応答が
    // 後着しても表示を上書きしないことを確認する。
    it('古い in-flight 応答が後着しても新しい表示を上書きしない（criteria 1・cmn-0410）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      let resolveInitial!: (u: unknown) => void;
      fetchMe.mockImplementationOnce(() => new Promise((r) => (resolveInitial = r)));

      render(
        <SessionProvider>
          <Probe />
        </SessionProvider>,
      );
      // 初回 fetch は保留中（user はまだ none）
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));

      // 取り直しを発射（先に解決させる）
      fetchMe.mockResolvedValueOnce({ ...ACCOUNT, name: '田中(更新後)' });
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible();
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中(更新後)'));
      expect(fetchMe).toHaveBeenCalledTimes(2);

      // 古い初回応答が後着 → 世代が古いため上書きしない
      resolveInitial(ACCOUNT);
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('user')).toHaveTextContent('田中(更新後)');
      nowSpy.mockRestore();
    });

    // cmn-0410 MEDIUM 1 本命: ログイン操作 vs in-flight 取り直し。取り直し応答（stale null）が
    // ログイン確定の後着で表示を上書きしない（commitUser の世代バンプで無効化される）。
    it('in-flight の取り直しがログイン確定の後着で表示を上書きしない（criteria 1・cmn-0410）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      function LoginProbe() {
        const { user, setUser } = useSessionContext();
        return (
          <div>
            <span data-testid="user">{user?.name ?? 'none'}</span>
            <button type="button" onClick={() => setUser(ACCOUNT)}>
              ログイン
            </button>
          </div>
        );
      }
      render(
        <SessionProvider>
          <LoginProbe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      // 取り直しを保留で発射（stale null を後で返す想定）
      let resolveRefetch!: (u: unknown) => void;
      fetchMe.mockImplementationOnce(() => new Promise((r) => (resolveRefetch = r)));
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible();
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));

      // ログイン確定（setUser(ACCOUNT)）→ commitUser が世代を進める
      fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));

      // 保留中の取り直し（stale null）が後着 → 世代不一致で無視され、ログイン後の表示を上書きしない
      resolveRefetch(null);
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('user')).toHaveTextContent('田中');
      nowSpy.mockRestore();
    });

    // cmn-0410 MEDIUM 1 本命（ログアウト側）: 取り直し応答（stale user）がログアウトの後着で
    // user を復活させない（commitUser の世代バンプで無効化される）。
    it('in-flight の取り直しがログアウト確定の後着で user を復活させない（criteria 1・cmn-0410）', async () => {
      const nowSpy = vi.spyOn(Date, 'now');
      nowSpy.mockReturnValue(1_000_000);
      function LogoutProbe() {
        const { user, setUser } = useSessionContext();
        return (
          <div>
            <span data-testid="user">{user?.name ?? 'none'}</span>
            <button type="button" onClick={() => setUser(null)}>
              ログアウト
            </button>
          </div>
        );
      }
      render(
        <SessionProvider>
          <LogoutProbe />
        </SessionProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('田中'));

      // 取り直しを保留で発射（stale user を後で返す想定）
      let resolveRefetch!: (u: unknown) => void;
      fetchMe.mockImplementationOnce(() => new Promise((r) => (resolveRefetch = r)));
      nowSpy.mockReturnValue(1_000_000 + 61_000);
      goVisible();
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));

      // ログアウト確定（setUser(null)）→ commitUser が世代を進める
      fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));

      // 保留中の取り直し（stale user）が後着 → 世代不一致で無視され、ログアウト後の none を維持
      resolveRefetch(ACCOUNT);
      await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('user')).toHaveTextContent('none');
      nowSpy.mockRestore();
    });
  });

  it('provider 外で useSessionContext を使うと例外を投げる', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow();
    spy.mockRestore();
  });
});
