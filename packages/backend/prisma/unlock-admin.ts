/**
 * 帯域外のログイン試行ロックアウト解除 CLI（set-0038）。
 *
 * 全 ADMIN がロックアウトされ Web UI（members の手動解除）から復旧できない事態でも、DB を直編集せず
 * ロックを解除できる最終手段。実行例:
 *   npm run unlock-admin -- admin@rete.local
 *   npm run unlock-admin -- <account id>
 *
 * - 対象は email / id のいずれでも指定可。
 * - 実際にロック中（lockedUntil が未来）の時のみ解除する。未ロック対象は no-op（書込しない＝監査汚染と同型の無駄書込を避ける）。
 *   解除内容は AuthService の自動リセット / members 手動解除と同一形（failedLoginAttempts=0 / lockedUntil=null）。
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: npm run unlock-admin -- <email または account id>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const account = await prisma.account.findFirst({
      where: { OR: [{ id: target }, { email: target }] },
    });
    if (!account) {
      console.error(`対象アカウントが見つかりません: ${target}`);
      process.exit(1);
    }

    const now = new Date();
    if (!account.lockedUntil || account.lockedUntil <= now) {
      console.log(`対象はロックされていません（no-op・解除不要）: ${account.email}`);
      return;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    console.log(`ログイン試行ロックアウトを解除しました: ${account.email} (role=${account.role})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
