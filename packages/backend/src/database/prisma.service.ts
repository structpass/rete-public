import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** health ping のタイムアウト（ms）。DB 飽和時に readiness probe が無限待ちするのを防ぐ。 */
const HEALTH_PING_TIMEOUT_MS = 2000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * DB 到達性の liveness ping（観測性 H9 / healthcheck の DB readiness）。
   * `SELECT 1` が通れば up。接続不能・タイムアウト等の例外は握り潰して false を返し、
   * health endpoint 側で up/down 判定に倒す（例外を上位へ伝播させない）。
   * DB 飽和（pool 枯渇・ロック待ち）で query が stall した場合に readiness probe が
   * 無限待ちしないよう、HEALTH_PING_TIMEOUT_MS で打ち切って down 扱いにする。
   */
  async isHealthy(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('health check timeout')),
            HEALTH_PING_TIMEOUT_MS,
          );
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
