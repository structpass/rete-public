import { z } from 'zod';

/** ログインフォームのバリデーション。backend LoginDto（IsEmail / 非空 password）に合わせる。 */
export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスは必須です')
    .email('メールアドレスの形式が正しくありません'),
  password: z.string().min(1, 'パスワードは必須です'),
});

export type LoginFormData = z.infer<typeof loginFormSchema>;
