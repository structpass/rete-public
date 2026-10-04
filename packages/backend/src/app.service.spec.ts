import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from './database';

describe('AppService', () => {
  let service: AppService;
  let prisma: { isHealthy: jest.Mock };

  beforeEach(async () => {
    prisma = { isHealthy: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('getHealth', () => {
    it('DB 到達可能なら status=ok / db=up（観測性 H9 readiness）', async () => {
      prisma.isHealthy.mockResolvedValue(true);
      const result = await service.getHealth();
      expect(result.status).toBe('ok');
      expect(result.db).toBe('up');
    });

    it('DB 到達不可なら status=error / db=down（観測性 H9 readiness）', async () => {
      prisma.isHealthy.mockResolvedValue(false);
      const result = await service.getHealth();
      expect(result.status).toBe('error');
      expect(result.db).toBe('down');
    });

    it('タイムスタンプが ISO 8601 形式であること', async () => {
      prisma.isHealthy.mockResolvedValue(true);
      const result = await service.getHealth();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('status / db / timestamp の 3 プロパティを持つこと', async () => {
      prisma.isHealthy.mockResolvedValue(true);
      const result = await service.getHealth();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('db');
      expect(result).toHaveProperty('timestamp');
    });
  });
});
