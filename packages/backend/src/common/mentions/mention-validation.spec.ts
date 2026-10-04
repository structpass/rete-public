import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validateMentionAccountIds, toMentionBadRequest } from './mention-validation';
import { MAX_MENTION_IDS } from './max-mention-ids';

describe('validateMentionAccountIds', () => {
  it('undefined（未指定）はそのまま undefined を返し件数照合しないこと（据え置き）', async () => {
    const countFn = jest.fn();
    const result = await validateMentionAccountIds(undefined, countFn);
    expect(result).toBeUndefined();
    expect(countFn).not.toHaveBeenCalled();
  });

  it('空配列はそのまま空配列で返し件数照合しないこと（全クリア）', async () => {
    const countFn = jest.fn();
    const result = await validateMentionAccountIds([], countFn);
    expect(result).toEqual([]);
    expect(countFn).not.toHaveBeenCalled();
  });

  it('重複した id を排除してから件数照合すること', async () => {
    const countFn = jest.fn().mockResolvedValue(2);
    const result = await validateMentionAccountIds(['a', 'b', 'a'], countFn);
    expect(countFn).toHaveBeenCalledWith(['a', 'b']);
    expect(result).toEqual(['a', 'b']);
  });

  it('存在しない id が混ざると（件数不一致）BadRequestException をスローすること', async () => {
    const countFn = jest.fn().mockResolvedValue(1);
    await expect(validateMentionAccountIds(['a', 'b'], countFn)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('toMentionBadRequest', () => {
  it('P2003（FK 違反）は BadRequestException へ変換すること', () => {
    const err = new Prisma.PrismaClientKnownRequestError('FK constraint failed', {
      code: 'P2003',
      clientVersion: 'test',
    });
    expect(() => toMentionBadRequest(err)).toThrow(BadRequestException);
  });

  it('P2003 以外の Prisma エラーは握らず再 throw すること', () => {
    const err = new Prisma.PrismaClientKnownRequestError('other', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(() => toMentionBadRequest(err)).toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Prisma エラーでない例外はそのまま再 throw すること', () => {
    const err = new Error('unrelated');
    expect(() => toMentionBadRequest(err)).toThrow(err);
  });
});

describe('MAX_MENTION_IDS', () => {
  it('create-chat-message.dto の SSOT 値（100）を re-export すること', () => {
    expect(MAX_MENTION_IDS).toBe(100);
  });
});
