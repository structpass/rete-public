export const DEFAULT_ADMIN_PASSWORD = 'ReteAdmin1234!';
export const DEFAULT_DEMO_PASSWORD = 'ReteDemo1234!';

/** Only local evaluation may use public credentials. Never include values in errors. */
export function validateSeedEnvironment(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return;
  if (env.ALLOW_SEED !== '1') {
    throw new Error('Refusing to seed outside development/test without ALLOW_SEED=1.');
  }
  for (const key of ['SEED_ADMIN_PASSWORD', 'SEED_DEMO_PASSWORD'] as const) {
    const value = env[key];
    if (!value?.trim() || value === DEFAULT_ADMIN_PASSWORD || value === DEFAULT_DEMO_PASSWORD) {
      throw new Error(
        `${key} must be nonempty and different from both public evaluation passwords.`,
      );
    }
  }
}
