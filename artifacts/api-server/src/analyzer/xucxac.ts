// ─── Xúc Xắc: đọc lịch sử từ nhóm Telegram @lichsuphienclmmgg ───────────────

import { getMainClient } from "../mtproto/client";
import { runAllDiceTournaments, formatDiceFaceTournamentSection } from "./tournament";

// ─── Độc Thủ: Dự đoán 1 mặt độc thủ xác suất nổ cao nhất ───────────────────

export interface DocThuResult {
  face: number;           // mặt được chọn (1–6)
  confidence: number;     // độ tin cậy tổng hợp (0–100)
  reason: string;         // lý do ngắn gọn
  prevKey: string;        // bộ 3 mặt phiên trước dùng để tra Markov (vd "2-4-5")
  markovSamples: number;  // số mẫu Markov tìm được trong lịch sử
  allScores: Record<number, number>; // điểm % từng mặt 1–6
  dispersed: boolean;     // true = tín hiệu phân tán, không nên bắt
}

/**
 * Tính điểm Độc Thủ cho từng mặt (1–6):
 *   Điểm = (Markov 3-viên * 50%) + (Trọng số 20 phiên gần nhất * 30%) + (Nhịp lặn/nổ * 20%)
 *
 * sessions[0] = phiên mới nhất (newest-first).
 * Chúng ta dùng sessions[0].dice làm "bộ t-1" để tra ma trận chuyển giao,
 * dự đoán cho phiên kế tiếp chưa xảy ra.
 */
export function computeDocThu(sessions: XucXacSession[]): DocThuResult | null {
  if (sessions.length < 20) return null;

  const FACES = [1, 2, 3, 4, 5, 6] as const;

  // Bộ 3 mặt phiên mới nhất (t-1) — sắp xếp tăng dần để làm key tra Markov
  const prevDice = sessions[0].dice;
  const prevKey  = [...prevDice].sort((a, b) => a - b).join("-");

  // ────────────────────────────────────────────────────────────────────────────
  // 1. SET COVERAGE MARKOV (trọng số 50%)
  //    Duyệt lịch sử: khi phiên (j+1) có bộ 3 mặt == prevKey,
  //    ghi lại mặt nào xuất hiện trong phiên j (phiên "kế tiếp").
  //    Đây chính là "xác suất xuất hiện mặt f trong bộ 3 viên tiếp theo".
  // ────────────────────────────────────────────────────────────────────────────
  const markovHit: Record<number, number> = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  let markovSamples = 0;

  for (let j = 0; j + 1 < sessions.length; j++) {
    const histKey = [...sessions[j + 1].dice].sort((a, b) => a - b).join("-");
    if (histKey !== prevKey) continue;
    // Phiên j là "kết quả tiếp theo" sau bộ prevKey — ghi nhận từng mặt
    for (const d of sessions[j].dice) {
      markovHit[d] = (markovHit[d] ?? 0) + 1;
    }
    markovSamples++;
  }

  // Markov frequency mỗi mặt: P(mặt f xuất hiện trong bộ 3 viên tiếp theo | prev = prevKey)
  // Random baseline: P(1 mặt f xuất hiện ít nhất 1 lần trong 3 viên) = 1-(5/6)^3 ≈ 0.421
  const RANDOM_BASELINE = 1 - Math.pow(5 / 6, 3); // ≈ 0.421

  const markovFreq: Record<number, number> = {};
  for (const f of FACES) {
    markovFreq[f] = markovSamples > 0
      ? markovHit[f] / markovSamples
      : RANDOM_BASELINE; // fallback: xác suất ngẫu nhiên
  }

  // Chuẩn hoá markov về [0, 1] (max → 1)
  const maxMk = Math.max(...FACES.map(f => markovFreq[f]));
  const markovNorm: Record<number, number> = {};
  for (const f of FACES) {
    markovNorm[f] = maxMk > 0 ? markovFreq[f] / maxMk : 1;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. TRỌNG SỐ 20 PHIÊN GẦN NHẤT (trọng số 30%)
  //    sessions[1..20]: phiên gần nhất weight cao hơn (tuyến tính giảm dần).
  //    Đếm số lần mặt f xuất hiện, nhân weight theo vị trí.
  // ────────────────────────────────────────────────────────────────────────────
  const recentHit: Record<number, number> = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  let recentWeightSum = 0;
  const recentWindow = sessions.slice(1, Math.min(21, sessions.length));

  for (let i = 0; i < recentWindow.length; i++) {
    const w = recentWindow.length - i; // gần nhất = weight cao nhất
    for (const d of recentWindow[i].dice) {
      recentHit[d] = (recentHit[d] ?? 0) + w;
    }
    recentWeightSum += w * 3; // mỗi phiên có 3 mặt
  }

  const recentFreq: Record<number, number> = {};
  for (const f of FACES) {
    recentFreq[f] = recentWeightSum > 0
      ? recentHit[f] / recentWeightSum
      : 1 / 6;
  }

  const maxRec = Math.max(...FACES.map(f => recentFreq[f]));
  const recentNorm: Record<number, number> = {};
  for (const f of FACES) {
    recentNorm[f] = maxRec > 0 ? recentFreq[f] / maxRec : 1;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. NHỊP CHUỖI LẶN/NỔ (trọng số 20%)
  //    Đếm "drought" mỗi mặt: số phiên liên tiếp gần nhất mà mặt f KHÔNG xuất hiện.
  //    Drought dài → mặt đang "lặn sâu" → xác suất "nổ" tăng.
  //    Dùng sessions[1..16] để tính (bỏ sessions[0] vì đó là prevKey đầu vào).
  // ────────────────────────────────────────────────────────────────────────────
  const droughtScore: Record<number, number> = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };

  for (const f of FACES) {
    let drought = 0;
    for (let i = 1; i < Math.min(17, sessions.length); i++) {
      if (sessions[i].dice.includes(f)) break;
      drought++;
    }
    // drought=0 → vừa xuất hiện → bonus thấp
    // drought=8+ → lặn rất sâu → bonus tối đa
    droughtScore[f] = Math.min(drought / 8, 1.0);
  }

  const maxDr = Math.max(...FACES.map(f => droughtScore[f]));
  const droughtNorm: Record<number, number> = {};
  for (const f of FACES) {
    droughtNorm[f] = maxDr > 0 ? droughtScore[f] / maxDr : 1;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Tổng hợp điểm Độc Thủ cho từng mặt
  // ────────────────────────────────────────────────────────────────────────────
  const rawScore: Record<number, number> = {};
  for (const f of FACES) {
    rawScore[f] =
      markovNorm[f]  * 0.50 +
      recentNorm[f]  * 0.30 +
      droughtNorm[f] * 0.20;
  }

  // Chuẩn hoá sang % (tổng 6 mặt = 100%)
  const scoreSum = FACES.reduce((s, f) => s + rawScore[f], 0);
  const allScores: Record<number, number> = {};
  for (const f of FACES) {
    allScores[f] = scoreSum > 0 ? Math.round((rawScore[f] / scoreSum) * 100) : 16;
  }

  // Tìm mặt có điểm cao nhất (Top 1)
  let topFace = 1;
  let topScore = allScores[1];
  for (const f of FACES) {
    if (allScores[f] > topScore) { topScore = allScores[f]; topFace = f; }
  }

  // ── Kiểm tra phân tán ──────────────────────────────────────────────────────
  // Nếu top score <= 20% (xấp xỉ ngẫu nhiên 16.67% +3.33% biên độ) → phân tán
  // Hoặc nếu Markov frequency của mặt đó không vượt được baseline ngẫu nhiên
  const sortedScores = FACES.map(f => allScores[f]).sort((a, b) => b - a);
  const gapToSecond   = sortedScores[0] - sortedScores[1]; // khoảng cách top1 vs top2

  const markovAboveBase = markovSamples >= 5
    ? markovFreq[topFace] > RANDOM_BASELINE + 0.05  // vượt baseline ≥ 5%
    : true; // ít mẫu → không kiểm được, cho qua

  const dispersed = topScore <= 19 || gapToSecond <= 2 || !markovAboveBase;

  // ── Tính confidence ────────────────────────────────────────────────────────
  // Dựa chủ yếu vào Markov frequency so với random baseline
  let confidence: number;
  if (markovSamples >= 5) {
    // Khoảng [baseline, 1.0] → ánh xạ sang [50, 95]
    const excess = Math.max(0, markovFreq[topFace] - RANDOM_BASELINE);
    const maxExcess = 1.0 - RANDOM_BASELINE; // ≈ 0.579
    confidence = Math.round(50 + (excess / maxExcess) * 45);
    confidence = Math.min(95, Math.max(35, confidence));
  } else {
    // Ít/không có mẫu Markov → dùng combined score
    confidence = Math.min(topScore + 32, 68);
  }

  // Nếu phân tán → confidence giảm thêm
  if (dispersed) confidence = Math.min(confidence, 45);

  // ── Lý do ngắn gọn ────────────────────────────────────────────────────────
  let reason: string;
  if (markovSamples >= 5) {
    const pct = Math.round(markovFreq[topFace] * 100);
    reason = `Bắt nhịp Markov từ bộ [${prevKey}] phiên trước (${pct}% · ${markovSamples} mẫu)`;
  } else if (markovSamples > 0) {
    reason = `Bộ [${prevKey}] chỉ có ${markovSamples} mẫu Markov, ưu tiên tần suất 20 phiên gần nhất`;
  } else {
    reason = `Bộ [${prevKey}] chưa có tiền lệ Markov, dựa hoàn toàn vào tần suất & nhịp lặn/nổ`;
  }

  return {
    face: topFace,
    confidence,
    reason,
    prevKey,
    markovSamples,
    allScores,
    dispersed,
  };
}

/** Format block Độc Thủ để gắn vào cuối message phân tích Xúc Xắc. */
export function formatDocThuSection(result: DocThuResult): string {
  const DICE_ICON: Record<number, string> = { 1:"⚀", 2:"⚁", 3:"⚂", 4:"⚃", 5:"⚄", 6:"⚅" };

  const header = [
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>DỰ ĐOÁN ĐỘC THỦ MẶT</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];

  if (result.dispersed) {
    return [
      ...header,
      `⚠️ <b>Cầu phân tán — Không nên bắt Độc thủ mặt</b>`,
      `<i>Các mặt xúc xắc tiệm cận mức ngẫu nhiên (~42%), tín hiệu không đủ mạnh để chọn 1 mặt độc thủ.</i>`,
    ].join("\n");
  }

  // Điểm bar nhỏ cho từng mặt
  const faceLines = ([1,2,3,4,5,6] as const).map(f => {
    const sc = result.allScores[f] ?? 0;
    const filled = Math.round(sc / 10);
    const bar = "▓".repeat(filled) + "░".repeat(10 - filled);
    const tag = f === result.face ? " ← 🎯" : "";
    return `  ${DICE_ICON[f]} Mặt <b>${f}</b>: ${bar} <b>${sc}%</b>${tag}`;
  });

  return [
    ...header,
    `🎲 <b>Mặt chọn:</b> ${DICE_ICON[result.face]} <b>Mặt ${result.face}</b> 🎯`,
    `📊 <b>Tỷ lệ tin cậy:</b> <b>${result.confidence}%</b>`,
    `💡 <b>Lý do:</b> <i>${result.reason}</i>`,
    ``,
    `<b>Điểm từng mặt:</b>`,
    ...faceLines,
  ].join("\n");
}

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

  // ── Độc Thủ Mặt ──────────────────────────────────────────────────────────────
  const docThu    = computeDocThu(sessions);
  const docThuSec = docThu ? formatDocThuSection(docThu) : "";

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
    docThuSec,
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

  // ── Tài/Xỉu: dùng face tournament nếu đủ phiên, fallback sang cầu ─────────
  let txLabel: "Tài" | "Xỉu";
  const txCau = analyzeCau(sessions.map(s => s.label), { "Tài": "Xỉu", "Xỉu": "Tài" });
  if (txCau.predictedLabel === "—") return null;
  txLabel = txCau.predictedLabel as "Tài" | "Xỉu";

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
