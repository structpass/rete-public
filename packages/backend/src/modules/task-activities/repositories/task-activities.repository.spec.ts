import { LIST_BY_TASK_LIMIT, TaskActivitiesRepository } from './task-activities.repository';

describe('TaskActivitiesRepository.listByTask', () => {
  let findMany: jest.Mock;
  let repo: TaskActivitiesRepository;

  beforeEach(() => {
    findMany = jest.fn();
    repo = new TaskActivitiesRepository({ taskActivity: { findMany } } as never);
  });

  /** id 昇順の行を n 件生成する（DB は desc で返す想定なので逆順にして渡す）。 */
  const descRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: n - i }));

  it('LIMIT+1 件の overfetch で取得する（truncated 判定用・createdAt desc, id desc）', async () => {
    findMany.mockResolvedValueOnce([]);

    await repo.listByTask(42);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { taskId: 42 },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_BY_TASK_LIMIT + 1,
    });
    expect(LIST_BY_TASK_LIMIT).toBe(200);
  });

  it('DB の降順取得を昇順へ反転して返す（履歴タブの時系列昇順表示を不変に保つ）', async () => {
    // DB は最新→古い（desc）で返すので、id=3,2,1 の順
    findMany.mockResolvedValueOnce([{ id: 3 }, { id: 2 }, { id: 1 }]);

    const { rows, truncated } = await repo.listByTask(7);

    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it('ちょうど LIMIT 件は truncated=false（「件数===LIMIT」の誤検知をしない・dsk-0228 境界）', async () => {
    findMany.mockResolvedValueOnce(descRows(LIST_BY_TASK_LIMIT));

    const { rows, truncated } = await repo.listByTask(7);

    expect(rows).toHaveLength(LIST_BY_TASK_LIMIT);
    expect(truncated).toBe(false);
  });

  it('LIMIT+1 件目が存在すれば truncated=true・返却は最新側 LIMIT 件のみ（古い側を切り落とす）', async () => {
    // DB desc: id=201..1。201 件目（最古 id=1）が切り落とされる。
    findMany.mockResolvedValueOnce(descRows(LIST_BY_TASK_LIMIT + 1));

    const { rows, truncated } = await repo.listByTask(7);

    expect(truncated).toBe(true);
    expect(rows).toHaveLength(LIST_BY_TASK_LIMIT);
    // 昇順反転後: 最古 id=1 は含まれず、id=2 始まり最新 id=201 終わり。
    expect(rows[0].id).toBe(2);
    expect(rows[rows.length - 1].id).toBe(LIST_BY_TASK_LIMIT + 1);
  });
});
