import { useState, useEffect } from 'react';
import { Settings2, KeyRound, Save, Check, AlertTriangle, Bot } from 'lucide-react';
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

function StatusDot({ status = 'ok' }: { status?: 'ok' | 'warn' | 'off' }) {
  const color =
    status === 'ok'
      ? 'bg-[hsl(var(--sidebar-primary))]'
      : status === 'warn'
      ? 'bg-[hsl(var(--accent))]'
      : 'bg-[hsl(var(--muted-foreground))]';
  return <span className={`inline-block size-2 rounded-full ${color} ${status === 'ok' ? 'animate-pulse-soft' : ''}`} />;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading, error } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettingsMutation = useUpdateSettings();

  const [txcChannel, setTxcChannel] = useState('');
  const [botToken, setBotToken] = useState('');

  useEffect(() => {
    if (settings) {
      setTxcChannel(settings.txcChannel || '');
    }
  }, [settings]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: { txcChannel?: string; botToken?: string } = {};
    if (txcChannel.trim()) {
      payload.txcChannel = txcChannel.trim();
    }
    if (botToken.trim()) {
      payload.botToken = botToken.trim();
    }

    updateSettingsMutation.mutate(
      { data: payload },
      {
        onSuccess: (result) => {
          if (result.success) {
            setBotToken('');
            queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
            toast({ title: 'Thành công', description: result.message || 'Cấu hình đã được cập nhật' });
          } else {
            toast({ title: 'Lỗi', description: result.message || 'Không thể lưu cấu hình', variant: 'destructive' });
          }
        },
        onError: (err) => {
          toast({ title: 'Lỗi', description: err.message || 'Không thể lưu cấu hình', variant: 'destructive' });
        },
      }
    );
  }

  const botRunning = settings?.botRunning ?? false;
  const botError = settings?.botError ?? null;
  const botStatus = botRunning ? 'ok' : botError ? 'warn' : 'off';

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
      <div className="mb-8">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Cấu hình hệ thống</p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-[-.055em] sm:text-3xl">Cài đặt Bot</h2>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-8">
          <div className="space-y-4">
            <div className="h-10 animate-pulse rounded-lg bg-[hsl(var(--muted)/.3)]" />
            <div className="h-10 animate-pulse rounded-lg bg-[hsl(var(--muted)/.3)]" />
            <div className="h-10 animate-pulse rounded-lg bg-[hsl(var(--muted)/.3)]" />
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-8">
          <div className="flex items-center gap-3 text-[hsl(var(--destructive))]">
            <AlertTriangle className="size-5" />
            <span>Không thể tải cấu hình: {error.message}</span>
          </div>
        </div>
      ) : (
        <>
          <section className="mb-5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow)] sm:p-6">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
              <Bot className="size-4 text-[hsl(var(--primary))]" /> Trạng thái Bot
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <StatusDot status={botStatus} />
                  Trạng thái hoạt động
                </div>
                <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                  {botRunning ? 'Bot đang chạy và kết nối thành công' : 'Bot chưa được khởi động'}
                </p>
              </div>
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <StatusDot status={settings?.botTokenSet ? 'ok' : 'off'} />
                  Token cấu hình
                </div>
                <p className="mt-2 font-mono text-sm text-[hsl(var(--muted-foreground))]">
                  {settings?.botTokenSet ? settings.botTokenMasked : 'Chưa có token'}
                </p>
              </div>
            </div>
            {botError && (
              <div className="mt-4 rounded-lg border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] px-3 py-2.5 text-xs text-[hsl(var(--destructive))]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <strong>Lỗi bot:</strong> {botError}
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow)] sm:p-6">
            <div className="flex flex-col justify-between gap-3 border-b border-[hsl(var(--border))] pb-5 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                  <Settings2 className="size-4 text-[hsl(var(--primary))]" /> Cấu hình kết nối
                </div>
                <h3 className="mt-2 text-lg font-extrabold tracking-[-.04em]">Bot & kênh dữ liệu</h3>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Thay đổi được áp dụng trực tiếp cho dịch vụ vận hành.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-5 pt-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-bold">Kênh Telegram</span>
                <div className="flex items-center rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] transition-colors focus-within:border-[hsl(var(--primary))]">
                  <span className="pl-3 text-sm text-[hsl(var(--muted-foreground))]">@</span>
                  <input
                    data-testid="input-channel"
                    value={txcChannel}
                    onChange={(e) => setTxcChannel(e.target.value)}
                    className="w-full bg-transparent px-2 py-3 text-sm outline-none"
                    placeholder="tenkenhphan_tich"
                  />
                </div>
                <span className="mt-2 block text-[11px] text-[hsl(var(--muted-foreground))]">Không cần nhập ký tự @ ở đầu.</span>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold">
                  Bot token <span className="font-normal text-[hsl(var(--muted-foreground))]">(để trống nếu không đổi)</span>
                </span>
                <div className="flex items-center rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] transition-colors focus-within:border-[hsl(var(--primary))]">
                  <KeyRound className="ml-3 size-4 text-[hsl(var(--muted-foreground))]" />
                  <input
                    data-testid="input-bot-token"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    type="password"
                    className="w-full bg-transparent px-3 py-3 text-sm outline-none"
                    placeholder={settings?.botTokenSet ? '••••••••••••' : 'Nhập token từ BotFather'}
                  />
                </div>
                <span className="mt-2 block text-[11px] text-[hsl(var(--muted-foreground))]">
                  Token được lưu bảo mật trên máy chủ.
                </span>
              </label>

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center md:col-span-2">
                <button
                  data-testid="button-save-settings"
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  <Save className="size-3.5" />
                  {updateSettingsMutation.isPending ? 'Đang lưu…' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
