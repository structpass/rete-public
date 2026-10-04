'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { SpaceKind, type SpaceDto } from '@rete/shared';
import { createSpace } from '../lib/api';
import { apiErrorMessage } from '../lib/api-error';

/**
 * 器（Space）作成導線の共有 hook（CM-2・グループ／関係者（1:1 DM）＝rete-desk-0144 / チャネル＝rete-desk-0143）。
 * グループ追加フォーム・メンバーピッカー・チャネル追加フォームから使う（§3 コピペ回避・作成結果のハンドリングを一元化）。
 *
 * 成功時は確定 SpaceDto を返し、呼び出し側が一覧 reload + 選択状態化を行う（reload は各 useSpaces / useProjectChannels が所有）。
 * 失敗時は backend の error.message を toast し null を返す（PERSONAL_DM の重複は backend が 409 +
 * 「この相手との DM は既に存在します」/ チャネル作成の権限不足は 403 を返すため、特別分岐なく同経路で利用者に伝わる）。
 */
export function useCreateSpace() {
  const [submitting, setSubmitting] = useState(false);

  const run = useCallback(
    async (
      input: Parameters<typeof createSpace>[0],
      fallbackMsg: string,
    ): Promise<SpaceDto | null> => {
      setSubmitting(true);
      try {
        const space = await createSpace(input);
        toast.success(`「${space.name}」を作成しました`);
        return space;
      } catch (e) {
        toast.error(apiErrorMessage(e, fallbackMsg));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const createGroup = useCallback(
    (name: string) => run({ kind: SpaceKind.GROUP, name }, 'グループの作成に失敗しました'),
    [run],
  );

  const createDm = useCallback(
    (peerAccountId: string) =>
      run({ kind: SpaceKind.PERSONAL_DM, peerAccountId }, '関係者の作成に失敗しました'),
    [run],
  );

  const createChannel = useCallback(
    (projectId: string, name: string) =>
      run({ kind: SpaceKind.CHANNEL, projectId, name }, 'チャネルの作成に失敗しました'),
    [run],
  );

  const createPersonalMemo = useCallback(
    (name: string) =>
      run({ kind: SpaceKind.PERSONAL_MEMO, name: name || undefined }, 'メモの作成に失敗しました'),
    [run],
  );

  return { createGroup, createDm, createChannel, createPersonalMemo, submitting };
}
