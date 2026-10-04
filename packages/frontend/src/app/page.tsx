import { redirect } from 'next/navigation';

// ランディングは Hub。未ログインなら Hub 側が /login へ送る。
export default function Home() {
  redirect('/hub');
}
