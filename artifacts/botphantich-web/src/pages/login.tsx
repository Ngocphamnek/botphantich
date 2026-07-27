import { useState } from 'react';
import { useLocation } from 'wouter';
import { Command, KeyRound, ArrowUpRight, AlertTriangle, CircleHelp, ShieldCheck } from 'lucide-react';
import { useVerifyToken } from '@workspace/api-client-react';

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar))] shadow-[0_8px_18px_-8px_hsl(var(--sidebar-primary))]">
        <Command className="size-5" strokeWidth={2.5} />
        <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[hsl(var(--accent))] ring-4 ring-[hsl(var(--sidebar))]" />
      </div>
      {!compact && (
        <div>
          <div className="text-[15px] font-extrabold tracking-[-.03em] text-[hsl(var(--sidebar-foreground))]">Bot Phân Tích</div>
          <div className="font-mono text-[9px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.48)]">operator console</div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const verifyTokenMutation = useVerifyToken();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('Vui lòng nhập access token.');
      return;
    }

    setError('');
    verifyTokenMutation.mutate(
      { data: { token: token.trim() } },
      {
        onSuccess: (response) => {
          if (response.success) {
            localStorage.setItem('admin_token', token.trim());
            setLocation('/');
          } else {
            setError(response.message || 'Token không hợp lệ.');
          }
        },
        onError: (err) => {
          setError(err.message || 'Xác thực thất bại.');
        },
      }
    );
  }

  return (
    <main className="noise relative flex min-h-[100dvh] overflow-hidden bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
      <div className="pointer-events-none absolute -left-32 -top-32 size-[32rem] rounded-full bg-[hsl(var(--sidebar-primary)/.08)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 right-[-8rem] size-[34rem] rounded-full bg-[hsl(var(--accent)/.08)] blur-3xl" />
      <section className="relative hidden w-[47%] flex-col justify-between border-r border-[hsl(var(--sidebar-border))] p-10 lg:flex xl:p-14">
        <BrandMark />
        <div className="max-w-lg animate-rise">
          <div className="mb-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-primary))]">
            <span className="size-1.5 rounded-full bg-[hsl(var(--sidebar-primary))]" /> hệ thống vận hành
          </div>
          <h1 className="max-w-xl text-5xl font-extrabold leading-[1.03] tracking-[-.065em] xl:text-6xl">
            Nhìn xuyên qua<br /><span className="text-[hsl(var(--sidebar-primary))]">nhiễu tín hiệu.</span>
          </h1>
          <p className="mt-7 max-w-md text-[15px] leading-7 text-[hsl(var(--sidebar-foreground)/.58)]">
            Bảng điều khiển tập trung cho hạ tầng phân tích Xúc Xắc. Một tín hiệu rõ ràng từ 5.000 bộ máy độc lập.
          </p>
          <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-[hsl(var(--sidebar-border))] pt-6">
            {[
              ['5.000', 'AI engines'],
              ['24/7', 'giám sát'],
              ['< 1s', 'phản hồi'],
            ].map(([value, label]) => (
              <div key={label}>
                <div className="font-mono text-lg text-[hsl(var(--sidebar-primary))]">{value}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/.4)]">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-[hsl(var(--sidebar-foreground)/.34)]">
          <ShieldCheck className="size-3.5" /> Kết nối được mã hóa · phiên quản trị riêng
        </div>
      </section>
      <section className="relative flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[390px] animate-rise [animation-delay:100ms]">
          <div className="mb-12 lg:hidden">
            <BrandMark />
          </div>
          <div className="mb-9">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]">
              <KeyRound className="size-5" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-[-.05em]">Chào mừng trở lại.</h2>
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--sidebar-foreground)/.5)]">
              Nhập access token để mở bảng điều khiển vận hành.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2.5 block text-xs font-semibold text-[hsl(var(--sidebar-foreground)/.72)]">Access token</span>
              <div
                className={`flex items-center rounded-xl border bg-[hsl(var(--sidebar-accent)/.65)] transition-colors focus-within:border-[hsl(var(--sidebar-primary))] ${
                  error ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--sidebar-border))]'
                }`}
              >
                <KeyRound className="ml-4 size-4 text-[hsl(var(--sidebar-foreground)/.35)]" />
                <input
                  data-testid="input-admin-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  type="password"
                  placeholder="••••••••••••••••"
                  className="w-full bg-transparent px-3 py-3.5 font-mono text-sm outline-none placeholder:text-[hsl(var(--sidebar-foreground)/.2)]"
                  autoComplete="current-password"
                />
              </div>
            </label>
            {error && (
              <div
                data-testid="status-auth-error"
                className="flex items-start gap-2 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-3 py-2.5 text-xs text-[hsl(var(--destructive))]"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </div>
            )}
            <button
              data-testid="button-sign-in"
              disabled={verifyTokenMutation.isPending}
              className="group flex w-full items-center justify-between rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-3.5 text-sm font-bold text-[hsl(var(--sidebar))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              <span>{verifyTokenMutation.isPending ? 'Đang xác thực…' : 'Mở bảng điều khiển'}</span>
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </form>
          <div className="mt-9 flex items-center gap-2 text-[11px] text-[hsl(var(--sidebar-foreground)/.32)]">
            <CircleHelp className="size-3.5" /> Token được lưu trong phiên trình duyệt hiện tại.
          </div>
        </div>
      </section>
    </main>
  );
}
