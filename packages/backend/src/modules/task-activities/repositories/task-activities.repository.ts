import { Injectable } from '@nestjs/common';
import type { TaskActivityField } from '@rete/shared';
import { PrismaService } from '../../../database/prisma.service';

// 操作者は表示名 + id のみ取得（email 等の個人情報をクエリに乗せない・task-comments.repository と同方針）。
const actorSelect = { select: { id: true, name: true } } as const;

/**
 * listByTask の取得上限（dsk-0226）。1 タスクの監査ログを無制限取得すると、変更回数の多い
 * タスクで応答サイズ・DB 負荷が制御外になる（毎分 30 回 throttle は重いクエリの歯止めにならない）。
 * 最新側 N 件に絞ることで上限をかける。N に達するタスクは稀なため履歴タブの体感は不変。
 * N 超の続き読み込みが要れば cursor pagination へ移行可（本上限方式から無理なく拡張できる）。
 *
 * dsk-0289: この窓は commentAdd/commentEdit（dsk-0269）も含む全 field 共通のため、活発なスレッドでは
 * コメント活動が属性変更履歴を窓外へ押し出し truncated 発火頻度が上がりうる。単一ユーザー MVP の現状の
 * 使い方では実害化条件（1スレッドに commentAdd/commentEdit の履歴が200件級積む）に達しないため、
 * LIMIT を増やす対処は不採用（根治でなく先送りのため）。マルチユーザー化/本番運用開始などで実害化条件に
 * 近づいたら、「属性変更」と「コメント」を別枠で読む field 別ページング・フィルタを UX 設計込みで
 * 別チケット化する（docs/architecture/operational-policy.md §11 参照）。
 */
export const LIST_BY_TASK_LIMIT = 200;

/**
 * 監査ログの変更フィールド種別。定義の SSOT は @rete/shared の TaskActivityField（cmn-0211 で集約）。
 * 値を追加する時に揃える箇所は shared 側の JSDoc に集約済み（本ファイルは別名の再公開のみ）。
 * 従来この union はここに直書きされ、frontend 側にも 6 種で止まった別定義があった。
 */
export type { TaskActivityField };

/** record() が受け取る 1 変更（field 種別とスナップショット済みの from/to 表示ラベル）。 */
export interface TaskActivityChange {
  field: TaskActivityField;
  fromLabel: string | null;
  toLabel: string | null;
}

/**
 * タスク監査ログのデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * 認可（Space 可視性）に必要な親タスクの spaceId 解決もここで担い、Service が tasks モジュールへ依存しないようにする。
 * task-comments.repository を雛形に逐語的に踏襲（findTaskForActivity ≒ findTaskForComment）。
 */
@Injectable()
export class TaskActivitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 親タスクの存在確認 + 認可用の spaceId を 1 クエリで解決する（監査ログの可視性は親タスクの器に従う）。
   * tasks モジュールへ依存せず、本 repository が直接 Task を引く（task-comments.findTaskForComment と同パターン）。
   */
  async findTaskForActivity(taskId: number) {
    return this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, spaceId: true },
    });
  }

  /**
   * 当該タスクの監査ログを時系列昇順で取得（@@index([taskId, createdAt, id]) に整合）。actor を id+name で同梱。
   * 取得は最新側 {@link LIST_BY_TASK_LIMIT} 件を上限とする（dsk-0226）。DB では desc で最新側を切り出し、
   * 返却前に昇順へ反転して履歴タブの「時系列昇順」表示を不変に保つ。createdAt はバッチ insert（createMany）で
   * 同値になりうるため id を第2キーに添え、200 件境界での取りこぼし／重複を決定的にする。
   *
   * truncated（dsk-0228）: 上限で古い側が切り落とされたかを LIMIT+1 件の overfetch で判定する。
   * 「取得件数 === LIMIT」判定だと「ちょうど LIMIT 件で 1 件も切れていない」場合を誤検知するため、
   * 1 行余分に取り LIMIT+1 件目が存在した時のみ true とする（追加コストは 1 行分のみ）。
   */
  async listByTask(taskId: number) {
    const rows = await this.prisma.taskActivity.findMany({
      where: { taskId },
      include: { actor: actorSelect },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_BY_TASK_LIMIT + 1,
    });
    const truncated = rows.length > LIST_BY_TASK_LIMIT;
    return { rows: rows.slice(0, LIST_BY_TASK_LIMIT).reverse(), truncated };
  }

  /**
   * 複数の変更を一括 insert する（タスク更新 1 回で複数属性が変わりうるため）。
   * 空配列なら DB を打たず即 return（無変更 update でゴミ行を作らない）。
   * actorAccountId は内部経路で null 許容。fromLabel/toLabel は呼び出し側で解決済みの前提。
   *
   * 【不変条件・dsk-0224】fromLabel/toLabel はスナップショット時点の正規名（タイトル / 分類名 / 担当者名）を
   * 生文字列のまま保存する＝ここで strip / sanitize / エスケープしない。保存値を加工すると "R&D" や
   * 記号入りの正規名が壊れデータ破損になるため、SSOT は生のラベル。XSS 防御は保存値の加工ではなく
   * 「表示側が必ずエスケープ描画する」不変条件で担保する（toTaskActivityResponse のコメント参照）。
   * なお「正規名の生文字列」には、呼び出し側で意図的に加工済みの文字列（commentAdd/commentEdit の
   * 本文抜粋＝タグ除去+140字切り詰め / dsk-0269）も含む＝加工は呼び出し側の責務で、本層は受け取った
   * 文字列に一切手を加えず保存するという不変条件は変わらない。
   */
  async createMany(taskId: number, actorAccountId: string | null, changes: TaskActivityChange[]) {
    if (changes.length === 0) return;
    await this.prisma.taskActivity.createMany({
      data: changes.map((c) => ({
        taskId,
        actorAccountId,
        field: c.field,
        fromLabel: c.fromLabel,
        toLabel: c.toLabel,
      })),
    });
  }
}
