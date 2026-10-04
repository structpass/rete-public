import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let appService: { getHealth: jest.Mock };

  const mockRes = (): Response => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    appService = { getHealth: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('DB 正常時は health を返し 200 を設定すること', async () => {
    appService.getHealth.mockResolvedValue({ status: 'ok', db: 'up', timestamp: 't' });
    const res = mockRes();

    const result = await controller.getHealth(res);

    expect(result).toEqual({ status: 'ok', db: 'up', timestamp: 't' });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('DB 異常時は 503 を設定すること（readiness シグナル / H9）', async () => {
    appService.getHealth.mockResolvedValue({ status: 'error', db: 'down', timestamp: 't' });
    const res = mockRes();

    const result = await controller.getHealth(res);

    expect(result.db).toBe('down');
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
