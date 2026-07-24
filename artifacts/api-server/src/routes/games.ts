import { Router } from "express";
import { fetchXucXacSessions, resetXucXacState } from "../analyzer/xucxac";
import { invalidateSessionCache } from "../analyzer/games";

const router = Router();

const ADMIN_PASSWORD = "19112007vV";

function requireAdmin(req: any, res: any, next: any) {
  const token = req.headers["x-admin-token"] as string | undefined;
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

router.post("/xucxac/refresh", requireAdmin, async (_req, res) => {
  try {
    resetXucXacState();
    invalidateSessionCache("xucxac");
    const sessions = await fetchXucXacSessions(100);

    return res.json({
      success: true,
      count: sessions.length,
      message: `Đã tải ${sessions.length} phiên mới.`,
    });
  } catch (e: any) {
    const msg: string = e?.message ?? "Lỗi không xác định";
    if (msg === "no_session") {
      return res.status(503).json({
        success: false,
        message: "MTProto chưa đăng nhập. Cần kết nối tài khoản Telegram trước.",
      });
    }
    return res.status(500).json({ success: false, message: msg });
  }
});

export default router;
