import type { Task, Category } from '@prisma/client';
import { TaskStatus } from '@prisma/client';
import { makeTaskEntity, makeCategoryEntity } from '../../__tests__/factories';
import { toTaskResponse, toTaskTreeResponse } from './tasks.mapper';
import type { TaskWithCategory } from './repositories/tasks.repository';

describe('tasks.mapper', () => {
  describe('toTaskResponse', () => {
    it('Task の主要フィールドを DTO に写すこと', () => {
      const dto = toTaskResponse(makeTaskEntity());
      expect(dto.id).toBe(1);
      expect(dto.title).toBe('入荷データ取込');
      expect(dto.description).toBe('当日分の入荷 CSV を取り込む');
      expect(dto.status).toBe(TaskStatus.IN_PROGRESS);
      expect(dto.categoryId).toBe(1);
      expect(dto.assigneeName).toBe('山田太郎');
    });

    it('status enum 値をそのまま透過すること', () => {
      const dto = toTaskResponse(makeTaskEntity({ status: TaskStatus.DONE }));
      expect(dto.status).toBe('DONE');
    });

    it('Date 系フィールドを ISO 8601 文字列に変換すること（startDate / dueDate / createdAt / updatedAt）', () => {
      const dto = toTaskResponse(
        makeTaskEntity({
          startDate: new Date('2026-05-01T00:00:00.000Z'),
          dueDate: new Date('2026-05-10T00:00:00.000Z'),
          createdAt: new Date('2026-05-29T01:23:45.000Z'),
          updatedAt: new Date('2026-05-29T09:00:00.000Z'),
        }),
      );
      expect(dto.startDate).toBe('2026-05-01T00:00:00.000Z');
      expect(dto.dueDate).toBe('2026-05-10T00:00:00.000Z');
      expect(dto.createdAt).toBe('2026-05-29T01:23:45.000Z');
      expect(dto.updatedAt).toBe('2026-05-29T09:00:00.000Z');
      expect(typeof dto.createdAt).toBe('string');
    });

    it('null の startDate / dueDate を null のまま保持すること', () => {
      const dto = toTaskResponse(makeTaskEntity({ startDate: null, dueDate: null }));
      expect(dto.startDate).toBeNull();
      expect(dto.dueDate).toBeNull();
    });

    it('null の description / parentTaskId / assigneeName を null のまま保持すること', () => {
      const dto = toTaskResponse(
        makeTaskEntity({ description: null, parentTaskId: null, assigneeName: null }),
      );
      expect(dto.description).toBeNull();
      expect(dto.parentTaskId).toBeNull();
      expect(dto.assigneeName).toBeNull();
    });

    it('parentTaskId が数値の場合はその値を保持すること', () => {
      const dto = toTaskResponse(makeTaskEntity({ parentTaskId: 42 }));
      expect(dto.parentTaskId).toBe(42);
    });

    it('sortOrder を DTO に写すこと', () => {
      const dto = toTaskResponse(makeTaskEntity({ sortOrder: 5 }));
      expect(dto.sortOrder).toBe(5);
    });

    it('hasMentionToMe は未指定なら false（未集約経路の既定 / dsk-0203）', () => {
      const dto = toTaskResponse(makeTaskEntity());
      expect(dto.hasMentionToMe).toBe(false);
    });

    it('hasMentionToMe に true を渡すとそのまま DTO へ畳むこと（dsk-0203）', () => {
      const dto = toTaskResponse(makeTaskEntity(), true);
      expect(dto.hasMentionToMe).toBe(true);
    });

    it('reactions は未指定（reactions フィールドなし）なら空配列（dsk-0297・findAll/create/update/move 等の未集約経路の既定）', () => {
      const dto = toTaskResponse(makeTaskEntity());
      expect(dto.reactions).toEqual([]);
    });

    it('reactions を emoji ごとに集計し、currentUserId 指定時は reactedByMe を畳むこと（dsk-0297・chat.mapper.aggregateReactions を再利用）', () => {
      const entity = {
        ...makeTaskEntity(),
        reactions: [
          { emoji: '👍', authorId: 'acc-1' },
          { emoji: '👍', authorId: 'acc-2' },
          { emoji: '🎉', authorId: 'acc-2' },
        ],
      };
      const dto = toTaskResponse(entity, false, 'acc-1');
      expect(dto.reactions).toEqual([
        { emoji: '👍', count: 2, reactedByMe: true },
        { emoji: '🎉', count: 1, reactedByMe: false },
      ]);
    });

    it('顛末（tenmatsu）を DTO に写すこと（null / 文字列）', () => {
      expect(toTaskResponse(makeTaskEntity({ tenmatsu: null })).tenmatsu).toBeNull();
      expect(toTaskResponse(makeTaskEntity({ tenmatsu: '結論を記録' })).tenmatsu).toBe(
        '結論を記録',
      );
    });

    it('sourceThemeId（null / 文字列）をそのまま保持すること', () => {
      expect(toTaskResponse(makeTaskEntity({ sourceThemeId: null })).sourceThemeId).toBeNull();
      const themed = toTaskResponse(makeTaskEntity({ sourceThemeId: 'theme-uuid-1' }));
      expect(themed.sourceThemeId).toBe('theme-uuid-1');
    });

    it('sourceTheme relation が無ければ sourceTheme を null にすること', () => {
      const dto = toTaskResponse(makeTaskEntity({ sourceThemeId: null }));
      expect(dto.sourceTheme).toBeNull();
    });

    it('sourceTheme relation を { id, title } に写すこと', () => {
      const dto = toTaskResponse({
        ...makeTaskEntity({ sourceThemeId: 'theme-uuid-1' }),
        sourceTheme: { id: 'theme-uuid-1', title: '入荷遅延の相談' },
      });
      expect(dto.sourceTheme).toEqual({ id: 'theme-uuid-1', title: '入荷遅延の相談' });
    });

    it('assignee relation が無ければ assignee を null にすること', () => {
      const dto = toTaskResponse(makeTaskEntity({ assigneeId: null }));
      expect(dto.assignee).toBeNull();
    });

    it('assignee relation を { id, name } に写すこと（assigneeName と併存）', () => {
      const dto = toTaskResponse({
        ...makeTaskEntity({ assigneeId: 'acc-1', assigneeName: '旧名' }),
        assignee: { id: 'acc-1', name: '田中 太郎' },
      });
      expect(dto.assignee).toEqual({ id: 'acc-1', name: '田中 太郎' });
      // 移行期データ温存: assigneeName も保持する（表示は assignee?.name ?? assigneeName）。
      expect(dto.assigneeName).toBe('旧名');
    });

    it('ownerId フィールドが DTO に含まれること（HIGH-2: §1 DTO 境界）', () => {
      const dto = toTaskResponse(makeTaskEntity({ ownerId: 'acc-owner-1' }));
      expect(dto.ownerId).toBe('acc-owner-1');
    });

    it('ownerId=null の場合は null のまま保持すること', () => {
      const dto = toTaskResponse(makeTaskEntity({ ownerId: null }));
      expect(dto.ownerId).toBeNull();
    });

    it('owner relation が無ければ owner を null にすること（dsk-0235・作成者サマリ）', () => {
      const dto = toTaskResponse(makeTaskEntity({ ownerId: 'acc-owner-1' }));
      expect(dto.owner).toBeNull();
    });

    it('owner relation を { id, name } に写すこと（担当者と独立・dsk-0235）', () => {
      const dto = toTaskResponse({
        ...makeTaskEntity({ ownerId: 'acc-owner-1', assigneeId: 'acc-1' }),
        owner: { id: 'acc-owner-1', name: '作成 太郎' },
        assignee: { id: 'acc-1', name: '担当 花子' },
      });
      // 作成者サマリは担当者と独立して載る（履歴の「作成」行 actor 用）。
      expect(dto.owner).toEqual({ id: 'acc-owner-1', name: '作成 太郎' });
      expect(dto.assignee).toEqual({ id: 'acc-1', name: '担当 花子' });
    });
  });

  describe('toTaskTreeResponse', () => {
    const wc = (over: Partial<Task>, category: Category): TaskWithCategory =>
      ({ ...makeTaskEntity(over), category }) as TaskWithCategory;
    const c1 = makeCategoryEntity({ id: 1, name: '入荷管理', sortOrder: 0 });
    const c2 = makeCategoryEntity({ id: 2, name: '出荷管理', sortOrder: 1 });

    it('トップレベルタスクをカテゴリ別グループへ束ね、入力順を保持すること', () => {
      const res = toTaskTreeResponse([
        wc({ id: 1, parentTaskId: null, categoryId: 1 }, c1),
        wc({ id: 2, parentTaskId: null, categoryId: 2 }, c2),
      ]);
      expect(res.categories.map((c) => c.id)).toEqual([1, 2]);
      expect(res.categories[0].name).toBe('入荷管理');
      expect(res.categories[0].tasks.map((t) => t.id)).toEqual([1]);
      expect(res.categories[1].tasks.map((t) => t.id)).toEqual([2]);
    });

    it('parentTaskId で子を親の children にネストすること（多階層）', () => {
      const res = toTaskTreeResponse([
        wc({ id: 1, parentTaskId: null, categoryId: 1 }, c1),
        wc({ id: 2, parentTaskId: 1, categoryId: 1 }, c1),
        wc({ id: 3, parentTaskId: 2, categoryId: 1 }, c1),
      ]);
      expect(res.categories).toHaveLength(1);
      const roots = res.categories[0].tasks;
      expect(roots.map((t) => t.id)).toEqual([1]);
      expect(roots[0].children.map((t) => t.id)).toEqual([2]);
      expect(roots[0].children[0].children.map((t) => t.id)).toEqual([3]);
    });

    it('ノードが TaskResponseDto 形（Date は ISO 文字列・children 配列付き）であること', () => {
      const res = toTaskTreeResponse([wc({ id: 1, parentTaskId: null, categoryId: 1 }, c1)]);
      const node = res.categories[0].tasks[0];
      expect(typeof node.createdAt).toBe('string');
      expect(Array.isArray(node.children)).toBe(true);
    });

    it('ノードに sortOrder / sourceThemeId / sourceTheme が載ること（tree も DTO shape 一貫）', () => {
      const themed: TaskWithCategory = {
        ...makeTaskEntity({
          id: 1,
          parentTaskId: null,
          categoryId: 1,
          sortOrder: 3,
          sourceThemeId: 'theme-uuid-1',
        }),
        category: c1,
        sourceTheme: { id: 'theme-uuid-1', title: '入荷遅延の相談' },
      } as TaskWithCategory;
      const res = toTaskTreeResponse([themed]);
      const node = res.categories[0].tasks[0];
      expect(node.sortOrder).toBe(3);
      expect(node.sourceThemeId).toBe('theme-uuid-1');
      expect(node.sourceTheme).toEqual({ id: 'theme-uuid-1', title: '入荷遅延の相談' });
    });

    it('親が集合外のタスクをトップレベル扱いにすること（防御的）', () => {
      const res = toTaskTreeResponse([wc({ id: 5, parentTaskId: 999, categoryId: 1 }, c1)]);
      expect(res.categories[0].tasks.map((t) => t.id)).toEqual([5]);
    });

    it('空配列で categories 空を返すこと', () => {
      expect(toTaskTreeResponse([]).categories).toEqual([]);
    });

    it('categoryId=null のタスクを「未分類」バケット（id=null）へ束ね、末尾に並べること（rete-desk-0158）', () => {
      // category relation が null（未分類）のトップレベルタスクを「未分類」へ集約する。
      const uncat = {
        ...makeTaskEntity({ id: 9, parentTaskId: null, categoryId: null }),
        category: null,
      } as TaskWithCategory;
      const res = toTaskTreeResponse([wc({ id: 1, parentTaskId: null, categoryId: 1 }, c1), uncat]);
      // 名前付き分類が先、未分類が末尾。
      expect(res.categories.map((c) => c.id)).toEqual([1, null]);
      const bucket = res.categories[res.categories.length - 1];
      expect(bucket.id).toBeNull();
      expect(bucket.name).toBe('（未分類）');
      expect(bucket.tasks.map((t) => t.id)).toEqual([9]);
    });

    it('未分類のみのツリーでも「未分類」バケット 1 件を返すこと（空 Space + 未分類タスク / rete-desk-0158）', () => {
      const uncat = {
        ...makeTaskEntity({ id: 9, parentTaskId: null, categoryId: null }),
        category: null,
      } as TaskWithCategory;
      const res = toTaskTreeResponse([uncat]);
      expect(res.categories).toHaveLength(1);
      expect(res.categories[0].id).toBeNull();
      expect(res.categories[0].tasks.map((t) => t.id)).toEqual([9]);
    });
  });
});
