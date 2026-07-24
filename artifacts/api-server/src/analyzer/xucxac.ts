// ─── Xúc Xắc: đọc lịch sử từ nhóm Telegram @lichsuphienclmmgg ───────────────

import { getMainClient } from "../mtproto/client";
import { runTournament, runAllDiceTournaments, formatDiceFaceTournamentSection } from "./tournament";
import { runXucXacEnsemble, formatEnsembleSection } from "./xucxac-ensemble";

const CHANNEL = "lichsuphienclmmgg";

export interface XucXacSession {
  sessionId: number;
  dice: [number, number, number];
  label: "Tài" | "Xỉu";
  parity: "Chẵn" | "Lẻ";
}

/**
 * Parse 1 tin nhắn Telegram thành session.
 * Format:
 *   🎲 Kết quả phiên 107678 🎲
 *    4  3  5 👉 TÀI CHẴN 🔵 ⚪️
 */
function parseMessage(text: string): XucXacSession | null {
  // Session ID
  const sessionMatch = text.match(/phiên\s+(\d+)/i);
  if (!sessionMatch) return null;

  // 3 số xúc xắc ngay trước 👉
  const diceMatch = text.match(/(\d+)\s+(\d+)\s+(\d+)\s*👉/);
  if (!diceMatch) return null;

  const d1 = parseInt(diceMatch[1]);
  const d2 = parseInt(diceMatch[2]);
  const d3 = parseInt(diceMatch[3]);

  // Xúc xắc chỉ có giá trị 1–6
  if ([d1, d2, d3].some(d => d < 1 || d > 6)) return null;

  const label: "Tài" | "Xỉu" = /TÀI/i.test(text) ? "Tài" : "Xỉu";
  const parity: "Chẵn" | "Lẻ" = /CHẴN/i.test(text) ? "Chẵn" : "Lẻ";

  return {
    sessionId: parseInt(sessionMatch[1]),
    dice: [d1, d2, d3],
    label,
    parity,
  };
}

/**
 * Lấy tối đa `limit` phiên từ nhóm Telegram (fetch trực tiếp).
 * Mặc định 1000 phiên — dùng cho khởi tạo cache.
 */
export async function fetchXucXacSessions(limit = 1000): Promise<XucXacSession[]> {
  const client = await getMainClient();
  if (!client) throw new Error("no_session");

  // Mỗi phiên thường có 1–3 tin nhắn → buffer × 2.5, tối đa 4000
  const fetchLimit = Math.min(Math.ceil(limit * 2.5), 4000);
  const messages = await client.getMessages(CHANNEL, { limit: fetchLimit });

  const sessions: XucXacSession[] = [];
  for (const msg of messages) {
    const text = (msg as any).message as string | undefined;
    if (!text) continue;
    const parsed = parseMessage(text);
    if (parsed) {
      sessions.push(parsed);
      if (sessions.length >= limit) break;
    }
  }

  return sessions;
}

// ─── In-memory session cache (tối đa 1000 phiên) ─────────────────────────────

const CACHE_MAX = 1000;
let _cachedSessions: XucXacSession[] = [];
let _cacheReady    = false;
let _cachePromise: Promise<void> | null = null;

/**
 * Thêm phiên mới vào đầu cache (watcher real-time gọi khi nhận session mới).
 * Dedup theo sessionId; trim về CACHE_MAX.
 */
export function prependToXucXacCache(session: XucXacSession): void {
  if (_cachedSessions[0]?.sessionId === session.sessionId) return;
  _cachedSessions = [session, ..._cachedSessions].slice(0, CACHE_MAX);
  _cacheReady = true; // đánh dấu có dữ liệu dù chưa init đầy đủ
}

/** Khởi tạo cache lần đầu từ Telegram (fetch 1000 phiên). */
async function initXucXacCache(): Promise<void> {
  if (_cacheReady && _cachedSessions.length >= 10) return;
  if (_cachePromise) return _cachePromise;
  _cachePromise = (async () => {
    try {
      const sessions = await fetchXucXacSessions(CACHE_MAX);
      if (sessions.length > 0) { _cachedSessions = sessions; _cacheReady = true; }
    } catch {
      // Giữ nguyên nếu lỗi — sẽ retry lần sau
      _cachePromise = null;
    }
  })();
  return _cachePromise;
}

/**
 * Trả về sessions đã cache.
 * Tự động khởi tạo nếu chưa có dữ liệu (fetch 1000 phiên lần đầu).
 */
export async function getCachedXucXacSessions(): Promise<XucXacSession[]> {
  if (!_cacheReady || _cachedSessions.length < 5) await initXucXacCache();
  return _cachedSessions;
}

/** Lấy sessionId mới nhất — dùng cho auto-poller */
export async function fetchLatestXucXacId(): Promise<number | null> {
  try {
    const sessions = await fetchXucXacSessions(1);
    return sessions[0]?.sessionId ?? null;
  } catch {
    return null;
  }
}

// ─── Real-time watcher — đăng ký event handler MTProto ───────────────────────

let _watcherRegistered = false;

/**
 * Đăng ký event handler trên MTProto client.
 * Khi nhóm @lichsuphienclmmgg có tin nhắn mới hợp lệ, gọi ngay callback.
 * Idempotent — chỉ đăng ký 1 lần dù gọi nhiều lần.
 */
export async function startXucXacWatcher(
  onNewSession: (session: XucXacSession) => void,
): Promise<boolean> {
  if (_watcherRegistered) return true;

  const client = await getMainClient();
  if (!client) return false;

  try {
    // gramjs dynamic import để tránh lỗi ESM khi chưa cần
    const { NewMessage } = await import("telegram/events/index.js" as string);

    client.addEventHandler((event: any) => {
      const text: string | undefined = event.message?.message;
      if (!text) return;
      const parsed = parseMessage(text);
      if (parsed) onNewSession(parsed);
    }, new NewMessage({ chats: [CHANNEL] }));

    _watcherRegistered = true;
    return true;
  } catch {
    return false;
  }
}

/** Reset flag khi client disconnect/logout — cho phép đăng ký lại */
export function resetXucXacWatcher(): void {
  _watcherRegistered = false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
}

function bar(n: number, total: number, w = 10): string {
  const f = total ? Math.round((n / total) * w) : 0;
  return "▓".repeat(f) + "░".repeat(w - f);
}

// ─── In-memory Cầu accuracy counters (TX & CL riêng) ────────────────────────

interface CauCounter {
  lastSessionId: number;
  lastTxPred: string;               // "Tài" | "Xỉu" | ""
  lastClPred: string;               // "Chẵn" | "Lẻ" | ""
  txWins:  number;                  // tổng thắng cộng dồn (Tài/Xỉu)
  txLoses: number;                  // tổng thua  cộng dồn (Tài/Xỉu)
  clWins:  number;                  // tổng thắng cộng dồn (Chẵn/Lẻ)
  clLoses: number;                  // tổng thua  cộng dồn (Chẵn/Lẻ)
  txResult: "win" | "lose" | null;  // kết quả phiên vừa rồi
  clResult: "win" | "lose" | null;
}

const _cau: CauCounter = {
  lastSessionId: -1,
  lastTxPred: "", lastClPred: "",
  txWins: 0, txLoses: 0,
  clWins: 0, clLoses: 0,
  txResult: null, clResult: null,
};

/** Xoá toàn bộ state in-memory — gọi khi refresh thủ công. */
export function resetXucXacState(): void {
  _cau.lastSessionId = -1;
  _cau.lastTxPred    = "";
  _cau.lastClPred    = "";
  _cau.txWins        = 0;
  _cau.txLoses       = 0;
  _cau.clWins        = 0;
  _cau.clLoses       = 0;
  _cau.txResult      = null;
  _cau.clResult      = null;
}

// ─── Phân tích cầu ────────────────────────────────────────────────────────────

interface CauResult {
  type: string;
  currentLabel: string;
  currentCount: number;
  longestLabel: string;
  longestCount: number;
  predictedLabel: string;   // raw label: "Tài" | "Xỉu" | "Chẵn" | "Lẻ"
  prediction: string;       // display text
  confidence: string;
}

function analyzeCau(labels: string[], opposites: Record<string, string>): CauResult {
  const empty: CauResult = {
    type: "—", currentLabel: "—", currentCount: 0,
    longestLabel: "—", longestCount: 0,
    predictedLabel: "—", prediction: "—", confidence: "—",
  };
  if (!labels.length) return empty;

  const currentLabel = labels[0];
  let currentCount = 1;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] === currentLabel) currentCount++;
    else break;
  }

  let longestLabel = labels[0], longestCount = 1, tmp = 1;
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] === labels[i - 1]) { tmp++; if (tmp > longestCount) { longestCount = tmp; longestLabel = labels[i]; } }
    else tmp = 1;
  }

  const slice = labels.slice(0, Math.min(10, labels.length));
  let alt = 0;
  for (let i = 0; i < slice.length - 1; i++) if (slice[i] !== slice[i + 1]) alt++;
  const altRate = (slice.length - 1) > 0 ? alt / (slice.length - 1) : 0;

  let type: string;
  if (currentCount >= 3)   type = "Cầu thẳng";
  else if (altRate >= 0.7) type = "Cầu 1-1 (xen kẽ)";
  else if (altRate <= 0.3) type = "Cầu liên tiếp";
  else                     type = "Cầu gãy";

  const other = opposites[currentLabel] ?? currentLabel;
  let predictedLabel: string;
  let prediction: string;
  let confidence: string;

  if (currentCount >= 5) {
    predictedLabel = other;
    prediction     = `Cảnh báo đảo → ${other}`;
    confidence     = "⚠️ Rủi ro cao";
  } else if (altRate >= 0.7) {
    predictedLabel = other;
    prediction     = `Đang 1-1 → ${other}`;
    confidence     = "🟡 Trung bình";
  } else if (currentCount >= 3) {
    predictedLabel = currentLabel;
    prediction     = `Theo cầu → ${currentLabel}`;
    confidence     = "🟡 Trung bình";
  } else {
    predictedLabel = currentLabel;
    prediction     = `Theo cầu → ${currentLabel}`;
    confidence     = "🔴 Thấp";
  }

  return { type, currentLabel, currentCount, longestLabel, longestCount, predictedLabel, prediction, confidence };
}

// ─── Phân tích & format kết quả ──────────────────────────────────────────────

export function buildXucXacAnalysis(sessions: XucXacSession[]): string {
  const total      = sessions.length;
  const totalRolls = total * 3;

  const faces: Record<number, number> = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  for (const s of sessions) for (const d of s.dice) faces[d]++;

  const expected  = totalRolls / 6;
  const DICE_ICON = ["","⚀","⚁","⚂","⚃","⚄","⚅"];

  const faceLines = ([1,2,3,4,5,6] as const).map(f => {
    const c   = faces[f] ?? 0;
    const p   = pct(c, totalRolls);
    const diff = c - expected;
    const tag  = diff > expected * 0.12 ? " 🔥" : diff < -expected * 0.12 ? " ❄️" : "";
    return `${DICE_ICON[f]} Mặt <b>${f}</b>: <b>${c}</b>x  (<b>${p}</b>)  ${bar(c, totalRolls, 10)}${tag}`;
  });

  const sortedF = ([1,2,3,4,5,6] as number[]).sort((a,b) => (faces[b]??0) - (faces[a]??0));
  const most  = sortedF[0];
  const least = sortedF[5];

  const chanFaces = [2,4,6].reduce((s,f) => s + (faces[f]??0), 0);
  const leFaces   = [1,3,5].reduce((s,f) => s + (faces[f]??0), 0);

  const txLabels = sessions.map(s => s.label);
  const txCau    = analyzeCau(txLabels, { "Tài": "Xỉu", "Xỉu": "Tài" });
  const txEmoji  = (l: string) => l === "Tài" ? "🔵" : "🔴";

  const clLabels = sessions.map(s => s.parity);
  const clCau    = analyzeCau(clLabels, { "Chẵn": "Lẻ", "Lẻ": "Chẵn" });
  const clEmoji  = (l: string) => l === "Chẵn" ? "⚪" : "⚫";

  const txPat = sessions.slice(0, 20).map(s => txEmoji(s.label)).join("");
  const clPat = sessions.slice(0, 20).map(s => clEmoji(s.parity)).join("");

  const recentLines = sessions.slice(0, 5).map(s =>
    `  <code>#${s.sessionId}</code> [${s.dice.join("-")}]=${s.dice.reduce((a,b)=>a+b,0)} → <b>${txEmoji(s.label)} ${s.label} ${clEmoji(s.parity)} ${s.parity}</b>`
  ).join("\n");

  // ─── Verify Cầu predictions from last session ───────────────────────────────
  const currentSessionId = sessions[0]?.sessionId ?? -1;
  if (_cau.lastSessionId > 0 && currentSessionId > _cau.lastSessionId && sessions[0]) {
    // New session arrived → check if last predictions were correct
    if (_cau.lastTxPred) {
      const newTxResult: "win" | "lose" = sessions[0].label === _cau.lastTxPred ? "win" : "lose";
      if (newTxResult === "win") _cau.txWins++; else _cau.txLoses++;
      _cau.txResult = newTxResult;
    }
    if (_cau.lastClPred) {
      const newClResult: "win" | "lose" = sessions[0].parity === _cau.lastClPred ? "win" : "lose";
      if (newClResult === "win") _cau.clWins++; else _cau.clLoses++;
      _cau.clResult = newClResult;
    }
  } else if (_cau.lastSessionId < 0 && currentSessionId > 0) {
    _cau.lastSessionId = currentSessionId;
  }

  // Store new predictions for next verification
  if (currentSessionId > 0) {
    _cau.lastSessionId = currentSessionId;
    _cau.lastTxPred    = txCau.predictedLabel;
    _cau.lastClPred    = clCau.predictedLabel;
  }

  // ─── Build prediction display ─────────────────────────────────────────────
  const txPredLabel = txCau.predictedLabel;
  const clPredLabel = clCau.predictedLabel;

  const txPredEmoji = txPredLabel === "Tài" ? "🔵" : txPredLabel === "Xỉu" ? "🔴" : "❓";
  const clPredEmoji = clPredLabel === "Chẵn" ? "⚪" : clPredLabel === "Lẻ" ? "⚫" : "❓";

  // (thống kê thắng/thua gửi riêng qua buildXucXacStatsMsg)

  // ── Face tournament: 3 tournament độc lập cho từng con xúc xắc ──────────────
  const diceTournaments = runAllDiceTournaments(sessions);
  const faceTourSection = formatDiceFaceTournamentSection(diceTournaments);

  // ── Ensemble AI (1000+ AI song song) ─────────────────────────────────────────
  const ensembleResult  = runXucXacEnsemble(sessions);
  const ensembleSection = ensembleResult ? formatEnsembleSection(ensembleResult) : "";

  return [
    `🎲 <b>Xúc Xắc CLMM.GG — Phân tích trực tiếp</b>`,
    `<i>📡 Nguồn: nhóm Telegram @lichsuphienclmmgg · ${total} phiên gần nhất</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `📊 <b>20 phiên gần nhất:</b>`,
    `Tài/Xỉu: ${txPat}`,
    `Chẵn/Lẻ: ${clPat}`,
    ``,
    `🎲 <b>Tỷ lệ từng mặt (${totalRolls} lượt tung):</b>`,
    `<i>Lý thuyết: 16.67% mỗi mặt</i>`,
    ...faceLines,
    ``,
    `🔵 Mặt chẵn (2/4/6): <b>${chanFaces}</b>x (<b>${pct(chanFaces, totalRolls)}</b>)  ${bar(chanFaces, totalRolls)}`,
    `🔴 Mặt lẻ  (1/3/5): <b>${leFaces}</b>x  (<b>${pct(leFaces, totalRolls)}</b>)  ${bar(leFaces, totalRolls)}`,
    `🔥 Mặt ra nhiều nhất: ${DICE_ICON[most]} Mặt <b>${most}</b> (${faces[most]}x · ${pct(faces[most]??0, totalRolls)})`,
    `❄️ Mặt ra ít nhất:   ${DICE_ICON[least]} Mặt <b>${least}</b> (${faces[least]}x · ${pct(faces[least]??0, totalRolls)})`,
    ``,
    `📋 <b>5 phiên chi tiết:</b>`,
    recentLines,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🤖 <b>DỰ ĐOÁN THEO CẦU</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>Tài/Xỉu:</b> ${txPredEmoji} <b>${txPredLabel.toUpperCase()}</b>  <i>(${txCau.prediction})</i>`,
    `🎯 <b>Chẵn/Lẻ:</b> ${clPredEmoji} <b>${clPredLabel.toUpperCase()}</b>  <i>(${clCau.prediction})</i>`,
    `📊 <b>Độ tin cậy:</b> ${txCau.confidence}`,
    faceTourSection,
    ensembleSection,
  ].join("\n");
}

/**
 * Trả về dự đoán thô (không cần format) — dùng bởi autoplay engine.
 * Ưu tiên tournament nếu đủ dữ liệu, fallback sang cầu nếu không.
 * null nếu chưa đủ dữ liệu.
 */
export function computeRawPredictions(
  sessions: XucXacSession[],
): { tx: "Tài" | "Xỉu"; cl: "Chẵn" | "Lẻ" } | null {
  if (sessions.length < 3) return null;

  // ── Ưu tiên 1: Ensemble AI (nếu đủ dữ liệu) ─────────────────────────────
  if (sessions.length >= 10) {
    const ensemble = runXucXacEnsemble(sessions);
    if (ensemble) {
      return { tx: ensemble.txLabel, cl: ensemble.clLabel };
    }
  }

  // ── Ưu tiên 2: Tournament AI (nếu đủ phiên) ─────────────────────────────
  let txLabel: "Tài" | "Xỉu";
  if (sessions.length >= 25) {
    const txTour = runTournament(sessions.map(s => s.label), { "Tài": "Xỉu", "Xỉu": "Tài" });
    txLabel = txTour.prediction as "Tài" | "Xỉu";
  } else {
    const txCau = analyzeCau(sessions.map(s => s.label), { "Tài": "Xỉu", "Xỉu": "Tài" });
    if (txCau.predictedLabel === "—") return null;
    txLabel = txCau.predictedLabel as "Tài" | "Xỉu";
  }

  // ── Chẵn/Lẻ: dùng face tournament → tổng → parity, fallback sang cầu ─────
  let clLabel: "Chẵn" | "Lẻ";
  if (sessions.length >= 25) {
    const diceRes = runAllDiceTournaments(sessions);
    const sum = diceRes[0].predictedFace + diceRes[1].predictedFace + diceRes[2].predictedFace;
    clLabel = sum % 2 === 0 ? "Chẵn" : "Lẻ";
  } else {
    const clCau = analyzeCau(sessions.map(s => s.parity), { "Chẵn": "Lẻ", "Lẻ": "Chẵn" });
    if (clCau.predictedLabel === "—") return null;
    clLabel = clCau.predictedLabel as "Chẵn" | "Lẻ";
  }

  return { tx: txLabel, cl: clLabel };
}

/**
 * Xây dựng tin nhắn thống kê thắng/thua cộng dồn — gửi riêng sau tin phân tích.
 * Trả về null nếu chưa có phiên nào được theo dõi.
 */
export function buildXucXacStatsMsg(): string | null {
  const txTotal = _cau.txWins + _cau.txLoses;
  const clTotal = _cau.clWins + _cau.clLoses;
  if (txTotal === 0 && clTotal === 0) return null;

  const txRate = txTotal > 0 ? Math.round((_cau.txWins / txTotal) * 100) : 0;
  const clRate = clTotal > 0 ? Math.round((_cau.clWins / clTotal) * 100) : 0;

  const lastTx = _cau.txResult === "win" ? "✅ Thắng" : _cau.txResult === "lose" ? "❌ Thua" : "—";
  const lastCl = _cau.clResult === "win" ? "✅ Thắng" : _cau.clResult === "lose" ? "❌ Thua" : "—";

  return [
    `📊 <b>THỐNG KÊ CẦU — XÚC XẮC</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>Tài / Xỉu</b>`,
    `   ✅ Thắng: <b>${_cau.txWins}</b>   ❌ Thua: <b>${_cau.txLoses}</b>`,
    `   📈 ${txTotal} phiên · <b>${txRate}%</b> thắng`,
    ``,
    `🎯 <b>Chẵn / Lẻ</b>`,
    `   ✅ Thắng: <b>${_cau.clWins}</b>   ❌ Thua: <b>${_cau.clLoses}</b>`,
    `   📈 ${clTotal} phiên · <b>${clRate}%</b> thắng`,
    ``,
    `🔄 <b>Phiên vừa rồi:</b>  TX ${lastTx}  ·  CL ${lastCl}`,
  ].join("\n");
}
