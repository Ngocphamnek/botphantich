/**
 * tournament.ts — Tournament-style meta-learning AI agent
 *
 * 28 chiến lược nhị phân thi đấu song song trên cửa sổ 10→100 phiên.
 * Vòng loại tại các mốc: 10, 20, 30, 50, 70, 85, 100 phiên.
 * Chiến lược thắng cuối cùng → dự đoán thực tế.
 *
 * 14 chiến lược mặt cho Xúc Xắc:
 *   3 tournament độc lập (XX1/XX2/XX3) → dự đoán mặt 1–6 chính xác nhất.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrategyStats {
  name: string;
  wins: number;
  losses: number;
  accuracy: number; // 0–1
  eliminated: boolean;
  eliminatedAtSession: number | null;
}

export interface TournamentResult {
  champion: string;          // tên chiến lược thắng
  prediction: string;        // dự đoán của champion
  accuracy: number;          // accuracy 0–1 của champion
  confidence: number;        // 0–100 mapped từ accuracy
  testedSessions: number;    // số phiên đã backtest
  roundsRun: number;         // số vòng loại đã chạy
  rankings: StrategyStats[]; // tất cả chiến lược xếp hạng
  action: "BET" | "SKIP";   // BET nếu champion accuracy >= 0.55
}

export interface DiceFaceTournamentResult {
  diePos: 0 | 1 | 2;        // vị trí xúc xắc
  champion: string;
  predictedFace: number;     // 1–6
  accuracy: number;
  testedSessions: number;
  roundsRun: number;
  rankings: Array<{ name: string; accuracy: number; wins: number; losses: number; eliminated: boolean }>;
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function countFreq<T>(arr: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

function mostFrequent<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const freq = countFreq(arr);
  let best: T = arr[0];
  let max = 0;
  for (const [k, v] of freq) if (v > max) { max = v; best = k; }
  return best;
}

function leastFrequent<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  const freq = countFreq(arr);
  let best: T = arr[0];
  let min = Infinity;
  for (const [k, v] of freq) if (v < min) { min = v; best = k; }
  return best;
}

// ─── 28 Chiến lược dự đoán nhị phân ──────────────────────────────────────────

type BinaryPredictor = (history: string[], opposites: Record<string, string>) => string;

// ══════════════════════════════════════════════════════════════════
// NHÓM 1: MARKOV (6 chiến lược)
// ══════════════════════════════════════════════════════════════════

/** Weighted Markov: ma trận chuyển trạng thái × gần nhất ×3 */
const stratWeightedMarkov: BinaryPredictor = (history, opposites) => {
  if (history.length < 5) return history[0] ?? Object.keys(opposites)[0];
  const allKeys = Object.keys(opposites);
  const trans: Record<string, Record<string, number>> = {};
  for (const k of allKeys) { trans[k] = {}; for (const k2 of allKeys) trans[k][k2] = 0; }
  for (let i = 0; i < history.length - 1; i++) {
    const from = history[i + 1]; const to = history[i];
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + 1;
  }
  const r30 = history.slice(0, Math.min(30, history.length));
  for (let i = 0; i < r30.length - 1; i++) {
    const from = r30[i + 1]; const to = r30[i];
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + 3;
  }
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  const row = trans[cur] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return cur;
  return (row[other] ?? 0) / total > 0.5 ? other : cur;
};

/** Pure 1st-order Markov: không trọng số thời gian */
const stratPureMarkov: BinaryPredictor = (history, opposites) => {
  if (history.length < 5) return history[0] ?? Object.keys(opposites)[0];
  const allKeys = Object.keys(opposites);
  const trans: Record<string, Record<string, number>> = {};
  for (const k of allKeys) { trans[k] = {}; for (const k2 of allKeys) trans[k][k2] = 0; }
  for (let i = 0; i < history.length - 1; i++) {
    const from = history[i + 1]; const to = history[i];
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + 1;
  }
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  const row = trans[cur] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return cur;
  return (row[other] ?? 0) > (row[cur] ?? 0) ? other : cur;
};

/**
 * 2nd-Order Markov: xét cặp (phiên-2, phiên-1) → dự đoán phiên kế tiếp.
 */
const stratSecondOrderMarkov: BinaryPredictor = (history, opposites) => {
  if (history.length < 8) return history[0] ?? Object.keys(opposites)[0];
  const chrono = [...history].reverse();
  const n = chrono.length;
  const trans: Record<string, Record<string, number>> = {};
  for (let i = 2; i < n; i++) {
    const state = `${chrono[i - 2]},${chrono[i - 1]}`;
    const next = chrono[i];
    if (!trans[state]) trans[state] = {};
    trans[state][next] = (trans[state][next] ?? 0) + 1;
  }
  const state = `${chrono[n - 2]},${chrono[n - 1]}`;
  const row = trans[state] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return history[0];
  let best = history[0]; let bestCnt = -1;
  for (const [k, v] of Object.entries(row)) {
    if (v > bestCnt) { bestCnt = v; best = k; }
  }
  return best;
};

/**
 * 3rd-Order Markov: xét bộ ba (phiên-3, phiên-2, phiên-1) → dự đoán.
 * Bắt pattern 3 bước, rất nhạy với chuỗi lặp dài.
 */
const stratThirdOrderMarkov: BinaryPredictor = (history, opposites) => {
  if (history.length < 12) return history[0] ?? Object.keys(opposites)[0];
  const chrono = [...history].reverse();
  const n = chrono.length;
  const trans: Record<string, Record<string, number>> = {};
  for (let i = 3; i < n; i++) {
    const state = `${chrono[i - 3]},${chrono[i - 2]},${chrono[i - 1]}`;
    const next = chrono[i];
    if (!trans[state]) trans[state] = {};
    trans[state][next] = (trans[state][next] ?? 0) + 1;
  }
  const state = `${chrono[n - 3]},${chrono[n - 2]},${chrono[n - 1]}`;
  const row = trans[state] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return history[0];
  let best = history[0]; let bestCnt = -1;
  for (const [k, v] of Object.entries(row)) {
    if (v > bestCnt) { bestCnt = v; best = k; }
  }
  return best;
};

/**
 * Exponential Decay Markov: phiên gần nhất có trọng số cao theo hàm mũ.
 * λ = 0.05 → phiên 1 ≈ 0.95, phiên 20 ≈ 0.37.
 */
const stratExponentialMarkov: BinaryPredictor = (history, opposites) => {
  if (history.length < 5) return history[0] ?? Object.keys(opposites)[0];
  const allKeys = Object.keys(opposites);
  const trans: Record<string, Record<string, number>> = {};
  for (const k of allKeys) { trans[k] = {}; for (const k2 of allKeys) trans[k][k2] = 0; }
  const lambda = 0.05;
  for (let i = 0; i < history.length - 1; i++) {
    const from = history[i + 1]; const to = history[i];
    const weight = Math.exp(-lambda * i);
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + weight;
  }
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  const row = trans[cur] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return cur;
  return (row[other] ?? 0) > (row[cur] ?? 0) ? other : cur;
};

/**
 * Bayesian Markov: Bayesian smoothing (Laplace +1) lên ma trận chuyển.
 * Tránh overfit khi dữ liệu ít.
 */
const stratBayesianMarkov: BinaryPredictor = (history, opposites) => {
  if (history.length < 5) return history[0] ?? Object.keys(opposites)[0];
  const allKeys = Object.keys(opposites);
  const alpha = 1; // Laplace smoothing
  const trans: Record<string, Record<string, number>> = {};
  for (const k of allKeys) {
    trans[k] = {};
    for (const k2 of allKeys) trans[k][k2] = alpha; // prior
  }
  for (let i = 0; i < history.length - 1; i++) {
    const from = history[i + 1]; const to = history[i];
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + 1;
  }
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  const row = trans[cur] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return cur;
  return (row[other] ?? 0) / total > 0.5 ? other : cur;
};

// ══════════════════════════════════════════════════════════════════
// NHÓM 2: CẦU / STREAK (6 chiến lược)
// ══════════════════════════════════════════════════════════════════

/** Anti-streak cố định: cầu >= 3 → đảo ngược */
const stratAntiStreak: BinaryPredictor = (history, opposites) => {
  const cur = history[0];
  const other = opposites[cur] ?? Object.keys(opposites).find(k => k !== cur) ?? cur;
  let count = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i] === cur) count++; else break;
  }
  return count >= 3 ? other : cur;
};

/** Follow-streak: luôn theo cầu hiện tại */
const stratFollowStreak: BinaryPredictor = (history) => history[0];

/** Alt detector: nếu 10 phiên xen kẽ > 70% → đảo, ngược lại theo */
const stratAltDetector: BinaryPredictor = (history, opposites) => {
  const cur = history[0];
  const other = opposites[cur] ?? Object.keys(opposites).find(k => k !== cur) ?? cur;
  const s10 = history.slice(0, Math.min(10, history.length));
  let alt = 0;
  for (let i = 0; i < s10.length - 1; i++) if (s10[i] !== s10[i + 1]) alt++;
  const altRate = (s10.length - 1) > 0 ? alt / (s10.length - 1) : 0;
  return altRate >= 0.7 ? other : cur;
};

/**
 * Adaptive Streak: ngưỡng đảo ngược thích nghi theo độ dài cầu trung bình trong lịch sử.
 * Nếu cầu trung bình = 2.5 → ngưỡng = 3; nếu = 4 → ngưỡng = 5.
 */
const stratAdaptiveStreak: BinaryPredictor = (history, opposites) => {
  const cur = history[0];
  const other = opposites[cur] ?? Object.keys(opposites).find(k => k !== cur) ?? cur;
  // Tính cầu trung bình trong lịch sử
  const streaks: number[] = [];
  let sc = 1;
  for (let i = 1; i < Math.min(50, history.length); i++) {
    if (history[i] === history[i - 1]) sc++;
    else { streaks.push(sc); sc = 1; }
  }
  streaks.push(sc);
  const avgStreak = streaks.reduce((a, b) => a + b, 0) / (streaks.length || 1);
  const threshold = Math.max(2, Math.round(avgStreak));
  // Cầu hiện tại
  let curStreak = 1;
  for (let i = 1; i < history.length; i++) {
    if (history[i] === cur) curStreak++; else break;
  }
  return curStreak >= threshold ? other : cur;
};

/**
 * Anti-Alternation: nếu phát hiện mẫu xen kẽ A-B-A trong 6 phiên gần nhất → giữ cur.
 * Tức là khi "người khác nghĩ đảo" thì ta theo.
 */
const stratAntiAlternation: BinaryPredictor = (history, opposites) => {
  const cur = history[0];
  const other = opposites[cur] ?? Object.keys(opposites).find(k => k !== cur) ?? cur;
  if (history.length < 4) return cur;
  // Đếm xen kẽ trong 6 phiên
  const s6 = history.slice(0, Math.min(6, history.length));
  let altCnt = 0;
  for (let i = 0; i < s6.length - 1; i++) if (s6[i] !== s6[i + 1]) altCnt++;
  const altRate = altCnt / (s6.length - 1);
  // Nếu xen kẽ cao → người ta sẽ đoán đảo → ta ngược lại (giữ cur)
  if (altRate >= 0.75) return cur;
  // Nếu xen kẽ thấp (cầu dài) → người ta đoán theo → ta đảo
  if (altRate <= 0.25) return other;
  return cur;
};

/**
 * Streak Momentum: theo dõi xu hướng độ dài cầu.
 * Nếu cầu gần nhất dài hơn trung bình → tiếp tục; nếu ngắn hơn → đảo.
 */
const stratStreakMomentum: BinaryPredictor = (history, opposites) => {
  const cur = history[0];
  const other = opposites[cur] ?? Object.keys(opposites).find(k => k !== cur) ?? cur;
  const streaks: number[] = [];
  let sc = 1;
  for (let i = 1; i < Math.min(40, history.length); i++) {
    if (history[i] === history[i - 1]) sc++;
    else { streaks.push(sc); sc = 1; }
  }
  streaks.push(sc);
  const avgStreak = streaks.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(streaks.length - 1, 1);
  const curStreak = streaks[streaks.length - 1];
  return curStreak >= avgStreak ? cur : other;
};

// ══════════════════════════════════════════════════════════════════
// NHÓM 3: PATTERN MATCHING (4 chiến lược)
// ══════════════════════════════════════════════════════════════════

/**
 * PatternMatch3: tìm chuỗi 3 phiên gần nhất trong 100 phiên history.
 */
const stratPatternMatch3: BinaryPredictor = (history, opposites) => {
  if (history.length < 6) return history[0] ?? Object.keys(opposites)[0];
  const cur = history[0]; const p1 = history[1]; const p2 = history[2];
  const limit = Math.min(100, history.length);
  for (let i = 3; i < limit; i++) {
    if (history[i] === p2 && history[i - 1] === p1 && history[i - 2] === cur) {
      if (i + 1 < history.length) return history[i + 1];
    }
  }
  return history[0];
};

/**
 * PatternMatch4: tìm chuỗi 4 phiên gần nhất trong lịch sử.
 * Bắt được pattern dài hơn PatternMatch3.
 */
const stratPatternMatch4: BinaryPredictor = (history, opposites) => {
  if (history.length < 8) return history[0] ?? Object.keys(opposites)[0];
  const p = history.slice(0, 4);
  const limit = Math.min(120, history.length);
  for (let i = 4; i < limit; i++) {
    if (history[i] === p[3] && history[i-1] === p[2] && history[i-2] === p[1] && history[i-3] === p[0]) {
      if (i + 1 < history.length) return history[i + 1];
    }
  }
  return history[0];
};

/**
 * PatternMatch5: tìm chuỗi 5 phiên — bắt pattern dài nhất.
 */
const stratPatternMatch5: BinaryPredictor = (history, opposites) => {
  if (history.length < 10) return history[0] ?? Object.keys(opposites)[0];
  const p = history.slice(0, 5);
  const limit = Math.min(150, history.length);
  for (let i = 5; i < limit; i++) {
    if (history[i] === p[4] && history[i-1] === p[3] && history[i-2] === p[2]
        && history[i-3] === p[1] && history[i-4] === p[0]) {
      if (i + 1 < history.length) return history[i + 1];
    }
  }
  return history[0];
};

/**
 * Cycle Detector: phát hiện chu kỳ lặp độ dài 2–8.
 * Ví dụ: T-X-T-X → chu kỳ 2, T-T-X-T-T-X → chu kỳ 3.
 */
const stratCycleDetector: BinaryPredictor = (history, opposites) => {
  if (history.length < 12) return history[0] ?? Object.keys(opposites)[0];
  for (let cycleLen = 2; cycleLen <= 8; cycleLen++) {
    // Kiểm tra xem 3 chu kỳ gần nhất có khớp không
    const needed = cycleLen * 3;
    if (history.length < needed) continue;
    let match = true;
    for (let j = 0; j < cycleLen * 2; j++) {
      if (history[j] !== history[j + cycleLen]) { match = false; break; }
    }
    if (match) {
      // Chu kỳ tìm thấy → dự đoán phần tử tiếp theo trong chu kỳ
      return history[cycleLen]; // phần tử tương ứng trong chu kỳ trước
    }
  }
  return history[0];
};

// ══════════════════════════════════════════════════════════════════
// NHÓM 4: TẦN SUẤT / THỐNG KÊ (6 chiến lược)
// ══════════════════════════════════════════════════════════════════

/** Frequency hot: label xuất hiện nhiều nhất trong 50 phiên */
const stratFrequencyHot: BinaryPredictor = (history) =>
  mostFrequent(history.slice(0, Math.min(50, history.length))) ?? history[0];

/** Anti-frequency: label xuất hiện ÍT nhất trong 50 phiên */
const stratAntiFrequency: BinaryPredictor = (history, opposites) => {
  const least = leastFrequent(history.slice(0, Math.min(50, history.length)));
  return least ?? (opposites[history[0]] ?? history[0]);
};

/** Recent majority: kết quả chiếm đa số trong 7 phiên gần nhất */
const stratRecentMajority: BinaryPredictor = (history) =>
  mostFrequent(history.slice(0, Math.min(7, history.length))) ?? history[0];

/** Micro majority: đa số trong 3 phiên gần nhất */
const stratMicroMajority: BinaryPredictor = (history) =>
  mostFrequent(history.slice(0, Math.min(3, history.length))) ?? history[0];

/** Long frequency: hot label trong 100 phiên xa nhất (xu hướng dài hạn) */
const stratLongFrequency: BinaryPredictor = (history) =>
  mostFrequent(history.slice(0, Math.min(100, history.length))) ?? history[0];

/**
 * Regression to Mean: nếu label nào đó < 38% trong 20 phiên → bet vào nó.
 */
const stratRegressionMean: BinaryPredictor = (history, opposites) => {
  const s20 = history.slice(0, Math.min(20, history.length));
  if (s20.length < 8) return history[0];
  const allKeys = Object.keys(opposites);
  const freq: Record<string, number> = {};
  for (const k of allKeys) freq[k] = 0;
  for (const l of s20) freq[l] = (freq[l] ?? 0) + 1;
  for (const k of allKeys) {
    if ((freq[k] ?? 0) / s20.length < 0.38) return k;
  }
  return history[0];
};

// ══════════════════════════════════════════════════════════════════
// NHÓM 5: MOMENTUM & TREND (4 chiến lược)
// ══════════════════════════════════════════════════════════════════

/**
 * Window Momentum: so sánh tỷ lệ 5 phiên vs 20 phiên.
 * Nếu 5p > 20p + 0.15 → "đà tăng" → theo.
 */
const stratWindowMomentum: BinaryPredictor = (history, opposites) => {
  if (history.length < 20) return history[0];
  const allKeys = Object.keys(opposites);
  const s5  = history.slice(0, 5);
  const s20 = history.slice(0, 20);
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  const rate5  = s5.filter(l => l === cur).length / 5;
  const rate20 = s20.filter(l => l === cur).length / 20;
  if (rate5 > rate20 + 0.15) return cur;
  if (rate5 < rate20 - 0.15) return other;
  return history[0];
};

/**
 * Local Momentum: so sánh 3 phiên vs 10 phiên.
 * Nhạy hơn Window Momentum vì cửa sổ ngắn hơn.
 */
const stratLocalMomentum: BinaryPredictor = (history, opposites) => {
  if (history.length < 10) return history[0];
  const allKeys = Object.keys(opposites);
  const s3  = history.slice(0, 3);
  const s10 = history.slice(0, 10);
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  const rate3  = s3.filter(l => l === cur).length / 3;
  const rate10 = s10.filter(l => l === cur).length / 10;
  if (rate3 > rate10 + 0.2) return cur;
  if (rate3 < rate10 - 0.2) return other;
  return history[0];
};

/**
 * Velocity Trend: tính "vận tốc thay đổi" tần suất.
 * Nếu frequency tăng nhanh trong 5 phiên gần → dự đoán tiếp tục tăng.
 */
const stratVelocityTrend: BinaryPredictor = (history, opposites) => {
  if (history.length < 15) return history[0];
  const allKeys = Object.keys(opposites);
  const cur = history[0];
  const other = opposites[cur] ?? allKeys.find(k => k !== cur) ?? cur;
  // Tần suất trong cửa sổ [0,5) và [5,10)
  const w1 = history.slice(0, 5).filter(l => l === cur).length / 5;
  const w2 = history.slice(5, 10).filter(l => l === cur).length / 5;
  const velocity = w1 - w2; // dương = tần suất tăng
  if (velocity > 0.2) return cur;    // đang tăng → tiếp tục
  if (velocity < -0.2) return other; // đang giảm → đảo
  return history[0];
};

/**
 * Mean Reversion Strong: nếu label nào < 30% trong 15 phiên → bet mạnh vào nó.
 * Ngưỡng chặt hơn RegressionMean (30% vs 38%).
 */
const stratMeanReversionStrong: BinaryPredictor = (history, opposites) => {
  const s15 = history.slice(0, Math.min(15, history.length));
  if (s15.length < 6) return history[0];
  const allKeys = Object.keys(opposites);
  const freq: Record<string, number> = {};
  for (const k of allKeys) freq[k] = 0;
  for (const l of s15) freq[l] = (freq[l] ?? 0) + 1;
  for (const k of allKeys) {
    if ((freq[k] ?? 0) / s15.length < 0.30) return k;
  }
  return history[0];
};

// ══════════════════════════════════════════════════════════════════
// NHÓM 6: META / ENSEMBLE (2 chiến lược)
// ══════════════════════════════════════════════════════════════════

/**
 * Ensemble Vote: meta-chiến lược bỏ phiếu đa số từ 4 chiến lược cốt lõi:
 * WeightedMarkov + AntiStreak + AltDetector + RecentMajority.
 */
const stratEnsembleVote: BinaryPredictor = (history, opposites) => {
  const votes = [
    stratWeightedMarkov(history, opposites),
    stratAntiStreak(history, opposites),
    stratAltDetector(history, opposites),
    stratRecentMajority(history, opposites),
  ];
  const freq = countFreq(votes);
  let best = votes[0]; let max = 0;
  for (const [k, v] of freq) if (v > max) { max = v; best = k; }
  return best;
};

/**
 * Super Ensemble: bỏ phiếu từ 8 chiến lược đa dạng (Markov + Pattern + Freq + Streak).
 * Giảm variance bằng cách tập hợp nhiều quan điểm.
 */
const stratSuperEnsemble: BinaryPredictor = (history, opposites) => {
  const votes = [
    stratWeightedMarkov(history, opposites),
    stratSecondOrderMarkov(history, opposites),
    stratExponentialMarkov(history, opposites),
    stratAntiStreak(history, opposites),
    stratAltDetector(history, opposites),
    stratPatternMatch3(history, opposites),
    stratRecentMajority(history, opposites),
    stratWindowMomentum(history, opposites),
  ];
  const freq = countFreq(votes);
  let best = votes[0]; let max = 0;
  for (const [k, v] of freq) if (v > max) { max = v; best = k; }
  return best;
};

// ─── Danh sách 28 chiến lược ──────────────────────────────────────────────────

const STRATEGIES: Array<{ name: string; fn: BinaryPredictor }> = [
  // Nhóm 1: Markov (6)
  { name: "WeightedMarkov",    fn: stratWeightedMarkov    },
  { name: "PureMarkov",        fn: stratPureMarkov        },
  { name: "2ndOrderMarkov",    fn: stratSecondOrderMarkov },
  { name: "3rdOrderMarkov",    fn: stratThirdOrderMarkov  },
  { name: "ExponentialMarkov", fn: stratExponentialMarkov },
  { name: "BayesianMarkov",    fn: stratBayesianMarkov    },
  // Nhóm 2: Streak (6)
  { name: "AntiStreak",        fn: stratAntiStreak        },
  { name: "FollowStreak",      fn: stratFollowStreak      },
  { name: "AltDetector",       fn: stratAltDetector       },
  { name: "AdaptiveStreak",    fn: stratAdaptiveStreak    },
  { name: "AntiAlternation",   fn: stratAntiAlternation   },
  { name: "StreakMomentum",    fn: stratStreakMomentum    },
  // Nhóm 3: Pattern (4)
  { name: "PatternMatch3",     fn: stratPatternMatch3     },
  { name: "PatternMatch4",     fn: stratPatternMatch4     },
  { name: "PatternMatch5",     fn: stratPatternMatch5     },
  { name: "CycleDetector",     fn: stratCycleDetector     },
  // Nhóm 4: Tần suất (6)
  { name: "FrequencyHot",      fn: stratFrequencyHot      },
  { name: "AntiFrequency",     fn: stratAntiFrequency     },
  { name: "RecentMajority",    fn: stratRecentMajority    },
  { name: "MicroMajority",     fn: stratMicroMajority     },
  { name: "LongFrequency",     fn: stratLongFrequency     },
  { name: "RegressionMean",    fn: stratRegressionMean    },
  // Nhóm 5: Momentum (4)
  { name: "WindowMomentum",    fn: stratWindowMomentum    },
  { name: "LocalMomentum",     fn: stratLocalMomentum     },
  { name: "VelocityTrend",     fn: stratVelocityTrend     },
  { name: "MeanRevStrong",     fn: stratMeanReversionStrong },
  // Nhóm 6: Meta (2)
  { name: "EnsembleVote",      fn: stratEnsembleVote      },
  { name: "SuperEnsemble",     fn: stratSuperEnsemble     },
];

// ─── Vòng loại tournament (28 chiến lược → 7 vòng) ───────────────────────────

/**
 * Lịch vòng loại — từ 28 → 1 champion qua 7 vòng loại.
 */
const ELIMINATION_ROUNDS: Array<{ atSession: number; keepTop: number }> = [
  { atSession: 10,  keepTop: 20 },  // loại 8 yếu nhất sau 10 phiên
  { atSession: 20,  keepTop: 15 },  // loại 5
  { atSession: 30,  keepTop: 10 },  // loại 5
  { atSession: 50,  keepTop: 7  },  // loại 3
  { atSession: 70,  keepTop: 4  },  // loại 3 → bán kết
  { atSession: 85,  keepTop: 2  },  // loại 2 → chung kết
  { atSession: 100, keepTop: 1  },  // champion
];

function sortByAccuracy(
  names: string[],
  stats: Map<string, { w: number; l: number }>,
): string[] {
  return [...names].sort((a, b) => {
    const sa = stats.get(a)!; const sb = stats.get(b)!;
    const ra = sa.w / (sa.w + sa.l || 1);
    const rb = sb.w / (sb.w + sb.l || 1);
    if (rb !== ra) return rb - ra;
    return (sb.w + sb.l) - (sa.w + sa.l);
  });
}

// ─── runTournament ────────────────────────────────────────────────────────────

/**
 * Chạy tournament với mảng label theo thứ tự newest-first.
 * Backtest từ phiên 10 đến min(100, total-10).
 * Trả về champion + prediction cho phiên kế tiếp.
 */
export function runTournament(
  labels: string[],
  opposites: Record<string, string>,
): TournamentResult {
  const fallback = (): TournamentResult => ({
    champion: "WeightedMarkov",
    prediction: labels[0] ?? Object.keys(opposites)[0],
    accuracy: 0.5,
    confidence: 50,
    testedSessions: 0,
    roundsRun: 0,
    rankings: [],
    action: "SKIP",
  });

  // Cần ít nhất 25 phiên (15 history + 10 test)
  if (labels.length < 25) return fallback();

  // Đổi sang chronological để backtest
  const chrono = [...labels].reverse();
  const testableEnd = Math.min(chrono.length - 1, 110);

  const stats = new Map<string, { w: number; l: number; elim: boolean; elimAt: number | null }>();
  for (const s of STRATEGIES) stats.set(s.name, { w: 0, l: 0, elim: false, elimAt: null });

  let activeNames = STRATEGIES.map(s => s.name);
  let roundIdx = 0;
  let tested = 0;

  for (let i = 10; i < testableEnd; i++) {
    const histNewest = chrono.slice(0, i).reverse();
    const actual = chrono[i];

    for (const name of activeNames) {
      const s = STRATEGIES.find(x => x.name === name)!;
      const pred = s.fn(histNewest, opposites);
      const st = stats.get(name)!;
      if (pred === actual) st.w++; else st.l++;
    }

    tested++;

    if (
      roundIdx < ELIMINATION_ROUNDS.length &&
      tested >= ELIMINATION_ROUNDS[roundIdx].atSession
    ) {
      const keepN = ELIMINATION_ROUNDS[roundIdx].keepTop;
      const sorted = sortByAccuracy(activeNames, stats as Map<string, { w: number; l: number }>);
      for (let k = keepN; k < sorted.length; k++) {
        const st = stats.get(sorted[k])!;
        st.elim = true;
        st.elimAt = tested;
      }
      activeNames = sorted.slice(0, keepN);
      roundIdx++;
    }
  }

  if (!activeNames.length) return fallback();

  const ranked = sortByAccuracy(activeNames, stats as Map<string, { w: number; l: number }>);
  const champName = ranked[0];
  const champFn = STRATEGIES.find(s => s.name === champName)!.fn;
  const champPrediction = champFn(labels, opposites);

  const champSt = stats.get(champName)!;
  const champAcc = champSt.w / (champSt.w + champSt.l || 1);
  const confidence = Math.round(champAcc * 100);

  const rankings: StrategyStats[] = STRATEGIES.map(({ name }) => {
    const st = stats.get(name)!;
    const total = st.w + st.l;
    return {
      name,
      wins: st.w,
      losses: st.l,
      accuracy: total > 0 ? st.w / total : 0,
      eliminated: st.elim,
      eliminatedAtSession: st.elimAt,
    };
  }).sort((a, b) => b.accuracy - a.accuracy);

  return {
    champion: champName,
    prediction: champPrediction,
    accuracy: champAcc,
    confidence,
    testedSessions: tested,
    roundsRun: roundIdx,
    rankings,
    action: champAcc >= 0.55 ? "BET" : "SKIP",
  };
}

// ─── Format section cho Telegram ─────────────────────────────────────────────

const MEDAL = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const STRATEGY_EMOJI: Record<string, string> = {
  WeightedMarkov:    "🧮",
  PureMarkov:        "📊",
  "2ndOrderMarkov":  "🔢",
  "3rdOrderMarkov":  "🎯",
  ExponentialMarkov: "📉",
  BayesianMarkov:    "🔭",
  AntiStreak:        "🔄",
  FollowStreak:      "➡️",
  AltDetector:       "↔️",
  AdaptiveStreak:    "🎚️",
  AntiAlternation:   "🔀",
  StreakMomentum:    "💨",
  PatternMatch3:     "🔬",
  PatternMatch4:     "🧩",
  PatternMatch5:     "🗺️",
  CycleDetector:     "🔁",
  FrequencyHot:      "🔥",
  AntiFrequency:     "❄️",
  RecentMajority:    "📈",
  MicroMajority:     "⚡",
  LongFrequency:     "🏔️",
  RegressionMean:    "⚖️",
  WindowMomentum:    "🌊",
  LocalMomentum:     "🏃",
  VelocityTrend:     "🚀",
  MeanRevStrong:     "🧲",
  EnsembleVote:      "🗳️",
  SuperEnsemble:     "👑",
};

export function formatTournamentSection(
  result: TournamentResult,
  predictionLabel: string,
  predictionEmoji: string,
): string {
  if (!result.rankings.length) return "";

  const top3 = result.rankings.slice(0, 3);
  const rankLines = top3.map((r, i) => {
    const acc = `${(r.accuracy * 100).toFixed(1)}%`;
    const wl  = `${r.wins}/${r.wins + r.losses}`;
    const emoji = STRATEGY_EMOJI[r.name] ?? "🤖";
    return `${MEDAL[i]} ${emoji} <b>${r.name}</b>  <b>${acc}</b>  (${wl})`;
  });

  const eliminated = result.rankings.filter(r => r.eliminated).length;
  const champEmoji = STRATEGY_EMOJI[result.champion] ?? "🤖";

  return [
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🏆 <b>AI TOURNAMENT — 28 CHIẾN LƯỢC ĐẤU LOẠI</b>`,
    `<i>28 chiến lược · ${result.testedSessions} phiên backtest · ${result.roundsRun} vòng loại · loại ${eliminated} kẻ thua</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ...rankLines,
    ``,
    `🤖 <b>Champion:</b> ${champEmoji} <b>${result.champion}</b>`,
    `🎯 <b>Dự đoán:</b> ${predictionEmoji} <b>${predictionLabel}</b>`,
    `📊 <b>Độ chính xác thực tế:</b> <b>${(result.accuracy * 100).toFixed(1)}%</b>  ${result.action === "BET" ? "✅ ĐỦ ĐỘ TIN CẬY" : "⚠️ CHƯA ĐỦ — CÂN NHẮC THÊM"}`,
  ].join("\n");
}

// ─── Dice face tournament (Xúc Xắc exact) — 14 chiến lược ───────────────────

type FacePredictor = (faceHistory: number[]) => number; // newest-first, returns 1–6

// ── Nhóm Markov mặt (5) ──

/** Hot face: mặt ra nhiều nhất trong 30 phiên */
const facePredHot: FacePredictor = (h) =>
  mostFrequent(h.slice(0, Math.min(30, h.length))) ?? h[0];

/** Cold face: mặt ra ÍT nhất trong 30 phiên */
const facePredCold: FacePredictor = (h) =>
  leastFrequent(h.slice(0, Math.min(30, h.length))) ?? h[0];

/** Markov face: 1st-order Markov cho 6 trạng thái */
const facePredMarkov: FacePredictor = (h) => {
  if (h.length < 5) return h[0];
  const trans: Record<number, Record<number, number>> = {};
  for (let f = 1; f <= 6; f++) { trans[f] = {}; for (let g = 1; g <= 6; g++) trans[f][g] = 0; }
  for (let i = 0; i < h.length - 1; i++) {
    const from = h[i + 1]; const to = h[i];
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + 1;
  }
  const cur = h[0];
  const row = trans[cur] ?? {};
  let bestFace = cur, bestCnt = -1;
  for (let f = 1; f <= 6; f++) {
    if ((row[f] ?? 0) > bestCnt) { bestCnt = row[f] ?? 0; bestFace = f; }
  }
  return bestFace;
};

/** 2nd-Order Markov Face: xét cặp (face_2, face_1) → dự đoán face kế tiếp */
const facePred2ndOrderMarkov: FacePredictor = (h) => {
  if (h.length < 8) return h[0];
  const chrono = [...h].reverse();
  const n = chrono.length;
  const trans: Record<string, Record<number, number>> = {};
  for (let i = 2; i < n; i++) {
    const state = `${chrono[i - 2]},${chrono[i - 1]}`;
    const next = chrono[i];
    if (!trans[state]) trans[state] = {};
    trans[state][next] = (trans[state][next] ?? 0) + 1;
  }
  const state = `${chrono[n - 2]},${chrono[n - 1]}`;
  const row = trans[state] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return h[0];
  let best = h[0]; let bestCnt = -1;
  for (const [k, v] of Object.entries(row)) {
    if (v > bestCnt) { bestCnt = v; best = Number(k); }
  }
  return best;
};

/** 3rd-Order Markov Face: xét bộ ba (face_3, face_2, face_1) */
const facePred3rdOrderMarkov: FacePredictor = (h) => {
  if (h.length < 12) return h[0];
  const chrono = [...h].reverse();
  const n = chrono.length;
  const trans: Record<string, Record<number, number>> = {};
  for (let i = 3; i < n; i++) {
    const state = `${chrono[i - 3]},${chrono[i - 2]},${chrono[i - 1]}`;
    const next = chrono[i];
    if (!trans[state]) trans[state] = {};
    trans[state][next] = (trans[state][next] ?? 0) + 1;
  }
  const state = `${chrono[n - 3]},${chrono[n - 2]},${chrono[n - 1]}`;
  const row = trans[state] ?? {};
  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return h[0];
  let best = h[0]; let bestCnt = -1;
  for (const [k, v] of Object.entries(row)) {
    if (v > bestCnt) { bestCnt = v; best = Number(k); }
  }
  return best;
};

// ── Nhóm Pattern mặt (3) ──

/** Pattern face: tìm cur trong 50 phiên, predict giá trị TRƯỚC phiên đó */
const facePredPattern: FacePredictor = (h) => {
  if (h.length < 3) return h[0];
  const cur = h[0];
  const hist = h.slice(1, Math.min(51, h.length));
  for (let i = 0; i < hist.length; i++) {
    if (hist[i] === cur && i + 1 < hist.length) return hist[i + 1];
  }
  return h[0];
};

/** Pattern pair face: tìm cặp (h[1], h[0]) trong lịch sử → predict kế */
const facePredPatternPair: FacePredictor = (h) => {
  if (h.length < 5) return h[0];
  const p0 = h[0]; const p1 = h[1];
  for (let i = 2; i < Math.min(80, h.length); i++) {
    if (h[i] === p1 && h[i - 1] === p0 && i + 1 < h.length) return h[i + 1];
  }
  return h[0];
};

/** Cycle face: detect chu kỳ 2–5 trong dãy mặt xúc xắc */
const facePredCycle: FacePredictor = (h) => {
  if (h.length < 10) return h[0];
  for (let cycleLen = 2; cycleLen <= 5; cycleLen++) {
    const needed = cycleLen * 3;
    if (h.length < needed) continue;
    let match = true;
    for (let j = 0; j < cycleLen * 2; j++) {
      if (h[j] !== h[j + cycleLen]) { match = false; break; }
    }
    if (match) return h[cycleLen];
  }
  return h[0];
};

// ── Nhóm tần suất mặt (3) ──

/** Exponential Face: trọng số giảm dần theo thời gian */
const facePredExponential: FacePredictor = (h) => {
  if (h.length < 5) return h[0];
  const trans: Record<number, Record<number, number>> = {};
  for (let f = 1; f <= 6; f++) { trans[f] = {}; for (let g = 1; g <= 6; g++) trans[f][g] = 0; }
  const lambda = 0.05;
  for (let i = 0; i < h.length - 1; i++) {
    const from = h[i + 1]; const to = h[i];
    const weight = Math.exp(-lambda * i);
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + weight;
  }
  const cur = h[0];
  const row = trans[cur] ?? {};
  let bestFace = cur, bestCnt = -1;
  for (let f = 1; f <= 6; f++) {
    if ((row[f] ?? 0) > bestCnt) { bestCnt = row[f] ?? 0; bestFace = f; }
  }
  return bestFace;
};

/** Recent Hot Face: mặt ra nhiều nhất trong 10 phiên gần nhất */
const facePredRecentMajority: FacePredictor = (h) =>
  mostFrequent(h.slice(0, Math.min(10, h.length))) ?? h[0];

/** Cold Recent Face: mặt ra ÍT nhất trong 10 phiên gần nhất (hồi quy) */
const facePredColdRecent: FacePredictor = (h) =>
  leastFrequent(h.slice(0, Math.min(10, h.length))) ?? h[0];

// ── Nhóm ensemble mặt (3) ──

/** Long Hot Face: mặt xuất hiện nhiều nhất trong 50 phiên (dài hạn) */
const facePredLongHot: FacePredictor = (h) =>
  mostFrequent(h.slice(0, Math.min(50, h.length))) ?? h[0];

/** Bayesian Face: Markov với Laplace smoothing */
const facePredBayesian: FacePredictor = (h) => {
  if (h.length < 5) return h[0];
  const alpha = 0.5; // Laplace
  const trans: Record<number, Record<number, number>> = {};
  for (let f = 1; f <= 6; f++) {
    trans[f] = {};
    for (let g = 1; g <= 6; g++) trans[f][g] = alpha;
  }
  for (let i = 0; i < h.length - 1; i++) {
    const from = h[i + 1]; const to = h[i];
    if (trans[from]) trans[from][to] = (trans[from][to] ?? 0) + 1;
  }
  const cur = h[0];
  const row = trans[cur] ?? {};
  let bestFace = cur, bestCnt = -1;
  for (let f = 1; f <= 6; f++) {
    if ((row[f] ?? 0) > bestCnt) { bestCnt = row[f] ?? 0; bestFace = f; }
  }
  return bestFace;
};

/** Face Ensemble: bỏ phiếu từ 4 chiến lược mặt cốt lõi */
const facePredEnsemble: FacePredictor = (h) => {
  const votes = [
    facePredHot(h),
    facePredMarkov(h),
    facePredPattern(h),
    facePredRecentMajority(h),
  ];
  return mostFrequent(votes) ?? h[0];
};

// ─── 14 chiến lược mặt ────────────────────────────────────────────────────────

const FACE_STRATEGIES: Array<{ name: string; fn: FacePredictor }> = [
  { name: "HotFace",           fn: facePredHot              },
  { name: "ColdFace",          fn: facePredCold             },
  { name: "MarkovFace",        fn: facePredMarkov           },
  { name: "2ndOrderFace",      fn: facePred2ndOrderMarkov   },
  { name: "3rdOrderFace",      fn: facePred3rdOrderMarkov   },
  { name: "PatternFace",       fn: facePredPattern          },
  { name: "PatternPairFace",   fn: facePredPatternPair      },
  { name: "CycleFace",         fn: facePredCycle            },
  { name: "ExponentialFace",   fn: facePredExponential      },
  { name: "RecentHotFace",     fn: facePredRecentMajority   },
  { name: "ColdRecentFace",    fn: facePredColdRecent       },
  { name: "LongHotFace",       fn: facePredLongHot          },
  { name: "BayesianFace",      fn: facePredBayesian         },
  { name: "FaceEnsemble",      fn: facePredEnsemble         },
];

/** Vòng loại cho 14 chiến lược mặt — 5 vòng */
const FACE_ELIMINATION_ROUNDS: Array<{ atSession: number; keepTop: number }> = [
  { atSession: 15,  keepTop: 10 },  // loại 4 yếu nhất sau 15 phiên
  { atSession: 30,  keepTop: 7  },  // loại 3
  { atSession: 50,  keepTop: 4  },  // loại 3 → bán kết
  { atSession: 70,  keepTop: 2  },  // chung kết
  { atSession: 100, keepTop: 1  },  // champion
];

/**
 * Chạy tournament cho một vị trí xúc xắc (0/1/2).
 */
export function runDiceFaceTournament(
  faceHistory: number[],
  diePos: 0 | 1 | 2,
): DiceFaceTournamentResult {
  const fallback = (): DiceFaceTournamentResult => ({
    diePos, champion: "HotFace",
    predictedFace: faceHistory[0] ?? 1,
    accuracy: 1 / 6,
    testedSessions: 0,
    roundsRun: 0,
    rankings: [],
  });

  if (faceHistory.length < 20) return fallback();

  const chrono = [...faceHistory].reverse();
  const testableEnd = Math.min(chrono.length - 1, 110);

  const stats = new Map<string, { w: number; l: number; elim: boolean; elimAt: number | null }>();
  for (const s of FACE_STRATEGIES) stats.set(s.name, { w: 0, l: 0, elim: false, elimAt: null });

  let activeNames = FACE_STRATEGIES.map(s => s.name);
  let roundIdx = 0;
  let tested = 0;

  for (let i = 10; i < testableEnd; i++) {
    const histNewest = chrono.slice(0, i).reverse();
    const actual = chrono[i];

    for (const name of activeNames) {
      const s = FACE_STRATEGIES.find(x => x.name === name)!;
      const pred = s.fn(histNewest);
      const st = stats.get(name)!;
      if (pred === actual) st.w++; else st.l++;
    }

    tested++;

    if (
      roundIdx < FACE_ELIMINATION_ROUNDS.length &&
      tested >= FACE_ELIMINATION_ROUNDS[roundIdx].atSession
    ) {
      const keepN = FACE_ELIMINATION_ROUNDS[roundIdx].keepTop;
      const sorted = [...activeNames].sort((a, b) => {
        const sa = stats.get(a)!; const sb = stats.get(b)!;
        return (sb.w / (sb.w + sb.l || 1)) - (sa.w / (sa.w + sa.l || 1));
      });
      for (let k = keepN; k < sorted.length; k++) {
        const st = stats.get(sorted[k])!;
        st.elim = true;
        st.elimAt = tested;
      }
      activeNames = sorted.slice(0, keepN);
      roundIdx++;
    }
  }

  if (!activeNames.length) return fallback();

  const champion = activeNames.sort((a, b) => {
    const sa = stats.get(a)!; const sb = stats.get(b)!;
    return (sb.w / (sb.w + sb.l || 1)) - (sa.w / (sa.w + sa.l || 1));
  })[0];

  const champFn = FACE_STRATEGIES.find(s => s.name === champion)!.fn;
  const predictedFace = champFn(faceHistory);
  const st = stats.get(champion)!;
  const accuracy = st.w / (st.w + st.l || 1);

  const rankings = FACE_STRATEGIES.map(({ name }) => {
    const s = stats.get(name)!;
    const total = s.w + s.l;
    return {
      name,
      accuracy: total > 0 ? s.w / total : 0,
      wins: s.w,
      losses: s.l,
      eliminated: s.elim,
    };
  }).sort((a, b) => b.accuracy - a.accuracy);

  return { diePos, champion, predictedFace, accuracy, testedSessions: tested, roundsRun: roundIdx, rankings };
}

/**
 * Chạy 3 face tournament (XX1/XX2/XX3) cùng lúc.
 */
export function runAllDiceTournaments(
  sessions: Array<{ dice: [number, number, number] }>,
): [DiceFaceTournamentResult, DiceFaceTournamentResult, DiceFaceTournamentResult] {
  const faceHist = (pos: 0 | 1 | 2): number[] => sessions.map(s => s.dice[pos]);
  return [
    runDiceFaceTournament(faceHist(0), 0),
    runDiceFaceTournament(faceHist(1), 1),
    runDiceFaceTournament(faceHist(2), 2),
  ];
}

const FACE_STRAT_EMOJI: Record<string, string> = {
  HotFace:         "🔥",
  ColdFace:        "❄️",
  MarkovFace:      "🧮",
  "2ndOrderFace":  "🔢",
  "3rdOrderFace":  "🎯",
  PatternFace:     "🔬",
  PatternPairFace: "🧩",
  CycleFace:       "🔁",
  ExponentialFace: "📉",
  RecentHotFace:   "📈",
  ColdRecentFace:  "🌡️",
  LongHotFace:     "🏔️",
  BayesianFace:    "🔭",
  FaceEnsemble:    "👑",
};

/**
 * Format phần dự đoán mặt xúc xắc theo tournament cho Telegram.
 */
export function formatDiceFaceTournamentSection(
  results: [DiceFaceTournamentResult, DiceFaceTournamentResult, DiceFaceTournamentResult],
): string {
  const DICE_ICON = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

  const lines: string[] = [
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `🎲 <b>DỰ ĐOÁN MẶT XÚC XẮC — 14 CHIẾN LƯỢC ĐẤU LOẠI</b>`,
    `<i>14 chiến lược · 5 vòng loại/con · tìm mặt chính xác nhất</i>`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];

  const diceValues: number[] = [];
  for (const r of results) {
    const f = r.predictedFace;
    diceValues.push(f);
    const icon = DICE_ICON[f] ?? String(f);
    const strEmoji = FACE_STRAT_EMOJI[r.champion] ?? "🤖";
    const accStr = `${(r.accuracy * 100).toFixed(1)}%`;
    const top2 = r.rankings.slice(0, 2).map(x =>
      `${FACE_STRAT_EMOJI[x.name] ?? "🤖"}${x.name}(${(x.accuracy*100).toFixed(0)}%)`
    ).join(" vs ");
    lines.push(
      `  XX${r.diePos + 1}: ${icon} <b>Mặt ${f}</b>  —  ${strEmoji} <b>${r.champion}</b>  <b>${accStr}</b> · ${r.testedSessions}p`,
      `    <i>⚡ Top: ${top2}</i>`,
    );
  }

  const totalFace = diceValues.reduce((a, b) => a + b, 0);
  const txResult = totalFace >= 11 ? "🔴 TÀI" : "🔵 XỈU";
  const clResult = totalFace % 2 === 0 ? "🟡 CHẴN" : "🟢 LẺ";

  lines.push(
    ``,
    `📌 <b>Tổng mặt dự đoán: ${totalFace}</b>  →  ${txResult}  /  ${clResult}`,
    `<i>(Tài ≥ 11 · Xỉu ≤ 10 · Chẵn = tổng chẵn · Lẻ = tổng lẻ)</i>`,
  );

  return lines.join("\n");
}
