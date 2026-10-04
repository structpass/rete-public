import { Suspense } from 'react';
import { LoginView } from '@/features/auth';

// LoginForm が useSearchParams を使うため Suspense 境界が必要（Next 15 app router）。
export default function Page() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
