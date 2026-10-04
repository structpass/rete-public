import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { TenantInfo } from '@/features/settings/lib/sample/tenant-settings';

// settings API をモックし、Provider のモジュールレベルキャッシュ挙動（mdl-0038）を検証する。
// cmn-0143: vi.hoisted 化（factory クロージャ参照を構造的に hoist）
const { fetchTenantInfo } = vi.hoisted(() => ({
  fetchTenantInfo: vi.fn(),
}));

vi.mock('@/features/settings/lib/api', () => ({
  fetchTenantInfo: (...a: unknown[]) => fetchTenantInfo(...a),
}));

import {
  TenantInfoProvider,
  useTenantInfoContext,
  resetTenantInfoCache,
} from '../tenant-info-context';

function info(name: string): TenantInfo {
  return { name, badgeColor: 'green' };
}

function Badge() {
  const { tenantInfo } = useTenantInfoContext();
  return <div data-testid="badge">{tenantInfo?.name ?? '(none)'}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTenantInfoCache();
  fetchTenantInfo.mockResolvedValue(info('テナントA'));
});

describe('TenantInfoProvider のモジュールレベルキャッシュ（mdl-0038）', () => {
  it('初回マウントは fetch 完了まで null、完了後に表示される', async () => {
    render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('(none)');
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('テナントA'));
  });

  it('再マウント（タブ遷移相当）ではキャッシュから初回フレームで表示される', async () => {
    const first = render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('テナントA'));
    first.unmount();

    // 2 回目の fetch を未解決のまま留め、キャッシュだけで初回描画されることを確認する
    fetchTenantInfo.mockReturnValue(new Promise(() => {}));
    render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('テナントA');
  });

  it('再取得が失敗してもキャッシュ済み表示を維持する（バッジ明滅の回帰防止）', async () => {
    const first = render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('テナントA'));
    first.unmount();

    fetchTenantInfo.mockRejectedValue(new Error('network'));
    render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('テナントA');
    await waitFor(() => expect(fetchTenantInfo).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('badge')).toHaveTextContent('テナントA');
  });

  it('resetTenantInfoCache（ログアウト相当）後の再マウントは null から始まる', async () => {
    const first = render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('テナントA'));
    first.unmount();

    resetTenantInfoCache();
    fetchTenantInfo.mockReturnValue(new Promise(() => {}));
    render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    // 前テナント名が漏れない
    expect(screen.getByTestId('badge')).toHaveTextContent('(none)');
  });

  it('reset をまたいで解決した in-flight fetch はキャッシュへ書き戻らない（前テナント漏れ防止）', async () => {
    // fetch を保留にしたまま mount → reset → その後に前テナントの結果が解決するレースを再現
    let resolveFetch: (v: TenantInfo) => void = () => {};
    fetchTenantInfo.mockReturnValue(new Promise<TenantInfo>((r) => (resolveFetch = r)));
    const first = render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    first.unmount();

    resetTenantInfoCache();
    resolveFetch(info('前テナント'));
    // マイクロタスクを流し切ってから再マウント。書き戻りがあればここで前テナント名が出る
    await Promise.resolve();
    fetchTenantInfo.mockReturnValue(new Promise(() => {}));
    render(
      <TenantInfoProvider>
        <Badge />
      </TenantInfoProvider>,
    );
    expect(screen.getByTestId('badge')).toHaveTextContent('(none)');
  });

  it('Provider 外で useTenantInfoContext を使うと throw する', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Badge />)).toThrow();
    spy.mockRestore();
  });
});
