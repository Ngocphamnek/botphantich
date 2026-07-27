import { useState } from 'react';
import { Plus, Copy, Check, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useListKeys, useGenerateKeys, getListKeysQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const PRODUCT_NAMES: Record<number, string> = {
  1: 'TEST',
  2: 'PHOT',
  3: 'VIPX',
  4: 'SVIP',
  5: 'SSVP',
  6: 'SSSV',
};

function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'muted' }) {
  const styles = {
    default: 'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]',
    success: 'bg-[hsl(var(--primary)/.15)] text-[hsl(var(--primary))]',
    muted: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[variant]}`}>
      {children}
    </span>
  );
}

export default function KeysPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productId, setProductId] = useState('1');
  const [count, setCount] = useState('10');
  const [copiedKeys, setCopiedKeys] = useState<string[]>([]);

  const limit = 20;
  const { data, isLoading, error } = useListKeys({ page, limit }, { query: { queryKey: getListKeysQueryKey({ page, limit }) } });
  const generateKeysMutation = useGenerateKeys();

  function handleGenerateKeys(e: React.FormEvent) {
    e.preventDefault();
    const countNum = Number(count);
    if (countNum < 1 || countNum > 100) {
      toast({ title: 'Lỗi', description: 'Số lượng phải từ 1 đến 100', variant: 'destructive' });
      return;
    }

    generateKeysMutation.mutate(
      { data: { productId: Number(productId), count: countNum } },
      {
        onSuccess: (result) => {
          if (result.success) {
            setCopiedKeys(result.keys);
            queryClient.invalidateQueries({ queryKey: ['/api/keys'] });
            toast({ title: 'Thành công', description: `Đã tạo ${result.keys.length} key mới` });
          } else {
            toast({ title: 'Lỗi', description: result.message || 'Không thể tạo key', variant: 'destructive' });
          }
        },
        onError: (err) => {
          toast({ title: 'Lỗi', description: err.message || 'Không thể tạo key', variant: 'destructive' });
        },
      }
    );
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: 'Đã sao chép', description: 'Key đã được sao chép vào clipboard' });
  }

  function copyAllKeys() {
    if (copiedKeys.length > 0) {
      navigator.clipboard.writeText(copiedKeys.join('\n'));
      toast({ title: 'Đã sao chép', description: `${copiedKeys.length} key đã được sao chép` });
    }
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Quản lý license</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-.055em] sm:text-3xl">Danh sách Key</h2>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button
              data-testid="button-open-generate-dialog"
              className="flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5"
            >
              <Plus className="size-4" /> Tạo Key mới
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Tạo Key mới</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGenerateKeys} className="space-y-5 pt-4">
              <div>
                <label className="mb-2 block text-xs font-bold">Loại sản phẩm</label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger data-testid="select-product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRODUCT_NAMES).map(([id, name]) => (
                      <SelectItem key={id} value={id} data-testid={`option-product-${id}`}>
                        {id} - {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold">Số lượng (1-100)</label>
                <input
                  data-testid="input-count"
                  type="number"
                  min="1"
                  max="100"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-3 text-sm outline-none transition-colors focus:border-[hsl(var(--primary))]"
                />
              </div>
              <button
                data-testid="button-generate-keys"
                type="submit"
                disabled={generateKeysMutation.isPending}
                className="w-full rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {generateKeysMutation.isPending ? 'Đang tạo…' : 'Tạo Key'}
              </button>

              {copiedKeys.length > 0 && (
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-bold">Key đã tạo ({copiedKeys.length})</span>
                    <button
                      data-testid="button-copy-all"
                      type="button"
                      onClick={copyAllKeys}
                      className="flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline"
                    >
                      <Copy className="size-3" /> Sao chép tất cả
                    </button>
                  </div>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto font-mono text-[11px]">
                    {copiedKeys.map((key, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded bg-[hsl(var(--background))] px-2 py-1.5">
                        <span className="truncate">{key}</span>
                        <button
                          data-testid={`button-copy-key-${i}`}
                          type="button"
                          onClick={() => copyToClipboard(key)}
                          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-8">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[hsl(var(--muted)/.3)]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.08)] p-8">
          <div className="flex items-center gap-3 text-[hsl(var(--destructive))]">
            <AlertTriangle className="size-5" />
            <span>Không thể tải danh sách key: {error.message}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[var(--shadow)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/.3)]">
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                      Key Code
                    </th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                      Sản phẩm
                    </th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                      Trạng thái
                    </th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                      Telegram ID
                    </th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                      Hết hạn
                    </th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">
                      Ngày tạo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data?.keys.map((key) => (
                    <tr
                      key={key.keyCode}
                      data-testid={`row-key-${key.keyCode}`}
                      className="border-b border-[hsl(var(--border))] transition-colors hover:bg-[hsl(var(--muted)/.15)]"
                    >
                      <td className="px-5 py-4">
                        <button
                          onClick={() => copyToClipboard(key.keyCode)}
                          className="group flex items-center gap-2 font-mono text-sm hover:text-[hsl(var(--primary))]"
                          data-testid={`button-copy-${key.keyCode}`}
                        >
                          <span>{key.keyCode}</span>
                          <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm font-bold">{PRODUCT_NAMES[key.productId] || `ID ${key.productId}`}</span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={key.isUsed ? 'success' : 'muted'}>{key.isUsed ? 'Đã dùng' : 'Chưa dùng'}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-sm text-[hsl(var(--muted-foreground))]">
                          {key.usedByTelegramId || '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">
                          {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString('vi-VN') : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-[hsl(var(--muted-foreground))]">
                          {key.createdAt ? new Date(key.createdAt).toLocaleDateString('vi-VN') : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Trang {page} / {totalPages} · Tổng {data?.total} key
              </p>
              <div className="flex gap-2">
                <button
                  data-testid="button-prev-page"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold transition-colors hover:border-[hsl(var(--primary)/.5)] disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5" /> Trước
                </button>
                <button
                  data-testid="button-next-page"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold transition-colors hover:border-[hsl(var(--primary)/.5)] disabled:opacity-40"
                >
                  Sau <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
