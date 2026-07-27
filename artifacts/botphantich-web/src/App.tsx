import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Link } from 'wouter';
import { Command, Gauge, KeyRound, Settings2, LogOut, Menu, X, ChevronRight } from 'lucide-react';
import { setCustomHeadersGetter } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';

import LoginPage from '@/pages/login';
import DashboardPage from '@/pages/dashboard';
import KeysPage from '@/pages/keys';
import SettingsPage from '@/pages/settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Configure custom header injection for admin token
setCustomHeadersGetter(() => {
  const token = localStorage.getItem('admin_token');
  return token ? { 'x-admin-token': token } : null;
});

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

function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileMenu, setMobileMenu] = useState(false);

  function handleLogout() {
    localStorage.removeItem('admin_token');
    queryClient.clear();
    setLocation('/login');
  }

  const nav = [
    { path: '/', label: 'Tổng quan', icon: Gauge },
    { path: '/keys', label: 'Quản lý Key', icon: KeyRound },
    { path: '/settings', label: 'Cài đặt', icon: Settings2 },
  ];

  return (
    <div className="noise flex min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col bg-[hsl(var(--sidebar))] px-5 py-6 transition-transform lg:static lg:translate-x-0 ${
          mobileMenu ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <BrandMark />
          <button
            data-testid="button-close-menu"
            onClick={() => setMobileMenu(false)}
            className="rounded-lg p-2 text-[hsl(var(--sidebar-foreground)/.5)] lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-14 font-mono text-[9px] uppercase tracking-[.2em] text-[hsl(var(--sidebar-foreground)/.32)]">
          Không gian làm việc
        </div>
        <nav className="mt-3 space-y-1">
          {nav.map(({ path, label, icon: Icon }) => {
            const active = location === path;
            return (
              <Link
                key={path}
                href={path}
                data-testid={`nav-${path}`}
                onClick={() => setMobileMenu(false)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${
                  active
                    ? 'bg-[hsl(var(--sidebar-accent))] font-bold text-[hsl(var(--sidebar-foreground))]'
                    : 'text-[hsl(var(--sidebar-foreground)/.48)] hover:bg-[hsl(var(--sidebar-accent)/.65)] hover:text-[hsl(var(--sidebar-foreground))]'
                }`}
              >
                <Icon className={`size-[17px] ${active ? 'text-[hsl(var(--sidebar-primary))]' : ''}`} />
                {label}
                {active && <ChevronRight className="ml-auto size-3.5 text-[hsl(var(--sidebar-foreground)/.3)]" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent)/.6)] p-4">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="size-1.5 rounded-full bg-[hsl(var(--sidebar-primary))] animate-pulse-soft" />
              Hệ thống ổn định
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[hsl(var(--sidebar-foreground)/.4)]">
              5.000 AI engines sẵn sàng phân tích.
            </p>
          </div>
          <button
            data-testid="button-logout"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 text-xs font-semibold text-[hsl(var(--sidebar-foreground)/.4)] transition-colors hover:text-[hsl(var(--sidebar-foreground))]"
          >
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      {mobileMenu && (
        <button
          aria-label="Đóng menu"
          onClick={() => setMobileMenu(false)}
          className="fixed inset-0 z-20 bg-[hsl(var(--sidebar)/.45)] lg:hidden"
        />
      )}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.88)] px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              data-testid="button-open-menu"
              onClick={() => setMobileMenu(true)}
              className="rounded-lg p-2 hover:bg-[hsl(var(--muted))] lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">
                Workspace / {nav.find((n) => n.path === location)?.label || 'Overview'}
              </div>
              <h1 className="mt-1 text-lg font-extrabold tracking-[-.04em]">
                {nav.find((n) => n.path === location)?.label || 'Tổng quan vận hành'}
              </h1>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      setLocation('/login');
    }
  }, [setLocation]);

  const token = localStorage.getItem('admin_token');
  if (!token) {
    return null;
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setLocation('/');
    }
  }, [setLocation]);

  return <Component />;
}

function NotFound() {
  return (
    <div className="noise flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-6">
      <div className="text-center">
        <div className="mb-6 font-mono text-7xl font-extrabold tracking-tighter text-[hsl(var(--primary))]">404</div>
        <h1 className="mb-3 text-2xl font-extrabold tracking-[-.05em]">Không tìm thấy trang</h1>
        <p className="mb-8 text-sm text-[hsl(var(--muted-foreground))]">
          URL bạn truy cập không tồn tại trong hệ thống.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5"
        >
          Quay về trang chủ
        </Link>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/login" component={() => <PublicRoute component={LoginPage} />} />
        <Route path="/" component={() => <ProtectedRoute component={DashboardPage} />} />
        <Route path="/keys" component={() => <ProtectedRoute component={KeysPage} />} />
        <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
