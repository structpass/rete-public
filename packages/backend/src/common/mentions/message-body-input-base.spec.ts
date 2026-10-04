import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateChatMessageDto } from '../../modules/chat/dto/create-chat-message.dto';
import { CreateTaskCommentDto } from '../../modules/task-comments/dto/create-task-comment.dto';
import { MAX_MENTION_IDS } from './max-mention-ids';

/**
 * 共通基底 MessageBodyInputBase の継承経由検証テスト（cmn-0289）。
 * chat / task-comments の Create 系 DTO が基底を継承しても、デコレータの検証規則が
 * そのまま効くこと（挙動不変）を固定する。判定は基底の「継承で伝播しない」懸念（cmn-0281 で
 * 誤断定された TS 5.9.3 module resolution 制限）が実在しないことの再検証を兼ねる。
 */
describe.each([
  ['CreateChatMessageDto', CreateChatMessageDto],
  ['CreateTaskCommentDto', CreateTaskCommentDto],
] as const)('MessageBodyInputBase 継承（%s）', (_name, Dto) => {
  async function errorsFor(input: Record<string, unknown>) {
    return validate(plainToInstance(Dto, input));
  }

  it('body 必須・空文字不可・5000 字上限が効くこと', async () => {
    expect((await errorsFor({})).some((e) => e.property === 'body')).toBe(true);
    expect((await errorsFor({ body: '' })).some((e) => e.property === 'body')).toBe(true);
    expect((await errorsFor({ body: 'a'.repeat(5000) })).some((e) => e.property === 'body')).toBe(
      false,
    );
    expect((await errorsFor({ body: 'a'.repeat(5001) })).some((e) => e.property === 'body')).toBe(
      true,
    );
  });

  it('mentionAccountIds は任意・配列・UUID 形式・件数上限が効くこと', async () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    expect((await errorsFor({ body: 'ok' })).some((e) => e.property === 'mentionAccountIds')).toBe(
      false,
    );
    expect(
      (await errorsFor({ body: 'ok', mentionAccountIds: [uuid] })).some(
        (e) => e.property === 'mentionAccountIds',
      ),
    ).toBe(false);
    expect(
      (await errorsFor({ body: 'ok', mentionAccountIds: 'not-an-array' })).some(
        (e) => e.property === 'mentionAccountIds',
      ),
    ).toBe(true);
    expect(
      (await errorsFor({ body: 'ok', mentionAccountIds: ['not-a-uuid'] })).some(
        (e) => e.property === 'mentionAccountIds',
      ),
    ).toBe(true);
    expect(
      (await errorsFor({ body: 'ok', mentionAccountIds: Array(MAX_MENTION_IDS).fill(uuid) })).some(
        (e) => e.property === 'mentionAccountIds',
      ),
    ).toBe(false);
    expect(
      (
        await errorsFor({
          body: 'ok',
          mentionAccountIds: Array(MAX_MENTION_IDS + 1).fill(uuid),
        })
      ).some((e) => e.property === 'mentionAccountIds'),
    ).toBe(true);
  });
});
