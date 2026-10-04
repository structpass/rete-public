import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ReferenceObjectTypesRepository } from './reference-object-types.repository';

describe('ReferenceObjectTypesRepository (hom-0067)', () => {
  let repo: ReferenceObjectTypesRepository;
  const realFetch = globalThis.fetch;

  function setToken(value: string | undefined) {
    if (value === undefined) delete process.env.INTEGRATION_SERVICE_TOKEN;
    else process.env.INTEGRATION_SERVICE_TOKEN = value;
  }

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.REFERENCE_INTEGRATION_API_URL;
    setToken(undefined);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReferenceObjectTypesRepository],
    }).compile();
    repo = module.get(ReferenceObjectTypesRepository);
  });

  it('credential 未設定は縮退（空配列）・フェッチしない（fail-closed・criteria【2】）', async () => {
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    setToken(undefined);
    expect(await repo.findAll()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reference から種別を取得し、DTO へ写して返す（criteria【1】）', async () => {
    const payload = {
      success: true,
      data: [
        { key: 'product', name: '商品', icon: 'package', isPreset: true },
        { key: 'supplier-score', name: '仕入先評価', icon: 'clipboard-check', isPreset: false },
      ],
    };
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => payload,
    })) as unknown as typeof fetch;
    setToken('a'.repeat(64));
    process.env.REFERENCE_INTEGRATION_API_URL = 'http://localhost:3001/api/v1';

    const result = await repo.findAll();
    expect(result).toEqual([
      { key: 'product', name: '商品', icon: 'package', isPreset: true },
      { key: 'supplier-score', name: '仕入先評価', icon: 'clipboard-check', isPreset: false },
    ]);
  });

  it('非 2xx は縮退（空配列）・エラー応答本文を返さない（token 非漏えい・criteria【6】）', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    })) as unknown as typeof fetch;
    setToken('a'.repeat(64));
    expect(await repo.findAll()).toEqual([]);
  });

  it('到達不能・タイムアウトは縮退（空配列）でお気に入り機能を止めない（criteria【5】）', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    setToken('a'.repeat(64));
    expect(await repo.findAll()).toEqual([]);
  });
});
