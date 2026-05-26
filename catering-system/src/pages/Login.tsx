import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ChefHat, LogIn } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('帳號或密碼錯誤，請重新輸入。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-background p-8 shadow-sm">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ChefHat size={24} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">餐飲管理系統</h1>
          <p className="text-sm text-muted-foreground">請登入以繼續</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">電子郵件</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              autoComplete="email"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">密碼</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            <LogIn size={14} />
            {loading ? '登入中…' : '登入'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          帳號由管理員在 Firebase Console 建立
        </p>
      </div>
    </div>
  );
}
