import { useState, useEffect } from 'react';
import { Cloud, Bot, MessageSquare, Network, Signal, Zap, Activity, ShieldCheck, RefreshCw, Sparkles } from 'lucide-react';
import { useHealthCheck, useGetSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

function StatusDot({ status = 'ok' }: { status?: 'ok' | 'warn' | 'off' }) {
  const color =
    status === 'ok'
      ? 'bg-[hsl(var(--sidebar-primary))]'
      : status === 'warn'
      ? 'bg-[hsl(var(--accent))]'
      : 'bg-[hsl(var(--muted-foreground))]';
  return <span className={`inline-block size-2 rounded-full ${color} ${status === 'ok' ? 'animate-pulse-soft' : ''}`} />;
}

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  status?: 'ok' | 'warn' | 'off';
  accent?: boolean;
}

function MetricCard({ label, value, detail, icon: Icon, status = 'ok', accent = false }: MetricCardProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-[var(--shadow)] transition-transform hover:-translate-y-0.5 ${
        accent
          ? 'border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
          : 'border-[hsl(var(--card-border))] bg-[hsl(var(--card))]'
      }`}
    >
      <div
        className={`mb-7 flex items-center justify-between ${
          accent ? 'text-[hsl(var(--primary-foreground)/.65)]' : 'text-[hsl(var(--muted-foreground))]'
        }`}
      >
        <span className="text-[11px] font-bold uppercase tracking-[.13em]">{label}</span>
        <Icon className="size-[17px]" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-extrabold tracking-[-.05em]">{value}</div>
          <div className={`mt-1.5 text-xs ${accent ? 'text-[hsl(var(--primary-foreground)/.65)]' : 'text-[hsl(var(--muted-foreground))]'}`}>
            {detail}
          </div>
        </div>
        <StatusDot status={status} />
      </div>
      {accent && <div className="absolute -bottom-10 -right-8 size-32 rounded-full border-[18px] border-[hsl(var(--primary-foreground)/.07)]" />}
    </div>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const health = useHealthCheck({ query: { queryKey: ['/api/healthz'], refetchInterval: 30_000 } });
  const settings = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), refetchInterval: 10_000 } });

  const [lastSync, setLastSync] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setLastSync(new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
    };
    updateTime();
    const interval = setInterval(updateTime, 60_000);
    return () => clearInterval(interval);
  }, []);

  const systemOnline = health.data?.status === 'ok';
  const botRunning = settings.data?.botRunning ?? false;
  const botError = settings.data?.botError ?? null;
  const botStatus = botRunning ? 'ok' : botError ? 'warn' : 'off';

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Xin chào, operator.</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-.055em] sm:text-3xl">Tín hiệu đang rõ nét.</h2>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
          <span className="size-1.5 rounded-full bg-[hsl(var(--primary))]" /> NODE VN-SG-01{' '}
          <span className="text-[hsl(var(--border))]">/</span> LIVE
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Hệ thống"
          value={health.isLoading ? '…' : systemOnline ? 'Ổn định' : 'Ngoại tuyến'}
          detail={systemOnline ? 'API phản hồi bình thường' : 'Đang chờ phản hồi'}
          icon={Cloud}
          status={systemOnline ? 'ok' : 'warn'}
        />
        <MetricCard
          label="Telegram bot"
          value={settings.isLoading ? '…' : botRunning ? 'Đang chạy' : 'Chưa chạy'}
          detail={botError || (botRunning ? 'Đã kết nối thành công' : 'Cần cấu hình token')}
          icon={Bot}
          status={botStatus}
        />
        <MetricCard
          label="Kênh phân tích"
          value={settings.isLoading ? '…' : settings.data?.txcChannel ? `@${settings.data.txcChannel}` : 'Chưa cấu hình'}
          detail="Nguồn dữ liệu Xúc Xắc"
          icon={MessageSquare}
          status={settings.data?.txcChannel ? 'ok' : 'off'}
        />
        <MetricCard label="Engine coverage" value="5.000" detail="Bộ máy độc lập đang sẵn sàng" icon={Network} status="ok" accent />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <section className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow)] sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                <Signal className="size-4 text-[hsl(var(--primary))]" /> Tín hiệu phân tích gần nhất
              </div>
              <h3 className="mt-4 text-2xl font-extrabold tracking-[-.05em]">Chờ phiên dữ liệu mới</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                Bot sẽ tự động phân tích khi phát hiện dữ liệu mới từ kênh Telegram.
              </p>
            </div>
            <div className="rounded-xl bg-[hsl(var(--muted))] p-3 text-[hsl(var(--muted-foreground))]">
              <Zap className="size-5" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-2 sm:max-w-md">
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-3">
              <div className="font-mono text-base text-[hsl(var(--muted-foreground))]">—</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground)/.7)]">Tài / Xỉu</div>
            </div>
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-3">
              <div className="font-mono text-base text-[hsl(var(--muted-foreground))]">—</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground)/.7)]">Độ tin cậy</div>
            </div>
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-3">
              <div className="font-mono text-base text-[hsl(var(--muted-foreground))]">—</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground)/.7)]">Phiên</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow)] sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
              <Activity className="size-4 text-[hsl(var(--accent))]" /> Hoạt động
            </div>
            <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground)/.7)]">REAL-TIME</span>
          </div>
          <div className="mt-7 space-y-5">
            <div className="flex gap-3">
              <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]">
                <ShieldCheck className="size-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">Phiên quản trị an toàn</div>
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Đã xác thực bằng access token</div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]">
                <RefreshCw className="size-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">Health check đang hoạt động</div>
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Tự động kiểm tra mỗi 30 giây</div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                <Sparkles className="size-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">5.000 engine độc lập</div>
                <div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Sẵn sàng khi có phiên mới</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
