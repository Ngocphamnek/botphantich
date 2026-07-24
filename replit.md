# HARU Control

Bot phân tích xúc xắc (Tài Xỉu / Chẵn Lẻ) trên Telegram, kèm hệ thống ngân hàng tự động và bảng điều khiển admin.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — chạy API server (port 8080)
- `pnpm --filter @workspace/admin-panel run dev` — chạy admin panel (port 20130)
- `pnpm run typecheck` — kiểm tra toàn bộ TypeScript
- `pnpm run build` — build tất cả packages
- `pnpm --filter @workspace/api-spec run codegen` — tái tạo hooks và Zod schemas từ OpenAPI spec
- `pnpm --filter @workspace/db run push` — áp dụng DB schema (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Telegram Bot: Telegraf + GramJS (MTProto)
- AI: onnxruntime-node (mô hình ONNX dự đoán)
- Banking: MB Bank integration (WASM + OCR)
- Admin UI: React + Vite + shadcn/ui + Tailwind CSS
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/` — Express server, bot logic, analyzer, bank integration
- `artifacts/api-server/src/analyzer/` — Engine dự đoán xúc xắc (ensemble, tournament)
- `artifacts/api-server/src/bot/` — Telegram bot handlers (Telegraf)
- `artifacts/api-server/src/bank/` — MB Bank integration (OCR, WASM)
- `artifacts/api-server/src/mtproto/` — GramJS client scraping game channels
- `artifacts/admin-panel/src/pages/` — Login + Dashboard UI
- `lib/db/src/schema/` — DB schema (users, keys, transactions, settings, predictionLogs)
- `lib/api-spec/openapi.yaml` — API contract (source of truth)

## Architecture decisions

- Bot token có thể set qua DB (Admin Panel > Cài đặt) hoặc env `TELEGRAM_BOT_TOKEN`
- Admin token mặc định: `19112007vV` (hardcoded trong routes/auth.ts — nên đổi thành secret)
- MTProto session cần đăng nhập Telegram account riêng để scrape dữ liệu game
- Mô hình ONNX (`model.onnx`) dùng cho ensemble prediction

## Product

- Telegram bot gửi dự đoán Tài/Xỉu cho người dùng có key hợp lệ
- Admin panel quản lý keys, settings bot và xem trạng thái server
- Hệ thống key theo tier: TEST / PHOT / VIPX / SVIP / SSVIP / SSSV

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `TELEGRAM_BOT_TOKEN` phải set trước khi bot khởi động
- MTProto cần session riêng — xem `src/mtproto/client.ts`
- `onnxruntime-node` cần postinstall script — đã thêm vào `onlyBuiltDependencies`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
