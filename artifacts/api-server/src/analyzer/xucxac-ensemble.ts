/**
 * xucxac-ensemble.ts — Hệ thống đa AI cho Xúc Xắc
 *
 * Chạy 5.274 AI song song, mỗi AI dùng thuật toán & tham số khác nhau.
 * Mỗi AI cho một vị trí xúc xắc (pos 0/1/2) sản xuất FaceProbs [p1..p6].
 * Tất cả kết quả được tổng hợp (weighted average) thành dự đoán cuối.
 *
 * TỔNG SỐ AI = 5.274 (tính trên 3 vị trí × số biến thể mỗi family)
 * ────────────────────────────────────────────────────────────────────
 * F1  Tần suất            32W × 3 =   96
 * F2  Hồi quy            24W×24S × 3 = 1.728
 * F3  Markov-1            20W × 3 =   60
 * F4  Markov-1 Exp-decay  20λ × 3 =   60
 * F5  Markov-2            12W × 3 =   36
 * F6  Bayesian Markov     15W×25α × 3 = 1.125
 * F7  Phân tích cầu       8 × 3   =   24
 * F8  Momentum            15P × 3 =   45
 * F9  Pattern Matching    8L × 3  =   24
 * F10 Hot/Cold            14W × 3 =   84
 * F11 Velocity Trend      12P × 3 =   36
 * F12 Phát hiện chu kỳ   7L × 3  =   21
 * F13 Recency Weighted    20λ × 3 =   60
 * F14 Meta Ensemble       8 × 3   =   24
 * F15 Markov-3            10W × 3 =   30
 * F16 Window+Exp Markov   15W×12λ × 3 = 540
 * F17 Gaussian Weighted   12σ × 3 =   36
 * F18 ETS Smoothing       15α × 3 =   45
 * F19 Phân tích chẵn/lẻ  12W × 3 =   36
 * F20 Zigzag Detector     8 × 3   =   24
 * F21 Entropy             10W × 3 =   30
 * F22 Variance            10W × 3 =   30
 * F23 Fibonacci Weighted  8S × 3  =   24
 * F24 Adaptive Regression 8 × 3   =   24
 * F25 Super Meta          12 × 3  =   36
 * F26 Seasonal Pattern    8P × 3  =   24
 * F27 Delta Frequency     8 × 3   =   24
 * F28 Markov-1+2 Blend    12α × 3 =   36
 * F29 Bayesian Markov-2   12W×12α × 3 = 432
 * F30 Polynomial Regr     20W×8M × 3  = 480
 * ────────────────────────────────────────────────────────────────────
 *                              TỔNG: 5.274 AI
 */

import type { XucXacSession } from "./xucxac";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FaceProbs = [number, number, number, number, number, number];

export interface FamilyResult {
  name:     string;
  aiCount:  number;
  topFaces: [number, number, number];
  txVote:   "Tài" | "Xỉu";
  clVote:   "Chẵn" | "Lẻ";
}

export interface EnsembleResult {
  diceProbs:      [FaceProbs, FaceProbs, FaceProbs];
  predictedFaces: [number, number, number];
  predictedSum:   number;
  sumDistrib:     number[];   // index = sum value (3..18)
  txLabel:  "Tài" | "Xỉu";
  txProb:   number;           // 0–100
  clLabel:  "Chẵn" | "Lẻ";
  clProb:   number;           // 0–100
  faceConsensus: number;      // % AI đồng thuận mặt (avg 3 pos)
  txConsensus:   number;      // % AI đồng thuận TX
  totalAIs:      number;
  families:      FamilyResult[];
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function uniform(): FaceProbs { return [1/6,1/6,1/6,1/6,1/6,1/6]; }

function normalize(fp: FaceProbs): FaceProbs {
  const s = fp[0]+fp[1]+fp[2]+fp[3]+fp[4]+fp[5];
  if (s < 1e-12) return uniform();
  return [fp[0]/s,fp[1]/s,fp[2]/s,fp[3]/s,fp[4]/s,fp[5]/s];
}

function topFace(fp: FaceProbs): number {
  let best = 0;
  for (let i = 1; i < 6; i++) if (fp[i] > fp[best]) best = i;
  return best + 1;
}

// Tổng hợp mảng FaceProbs thành 1 (trung bình)
function mergeProbs(arr: FaceProbs[]): FaceProbs {
  if (!arr.length) return uniform();
  const r: FaceProbs = [0,0,0,0,0,0];
  for (const fp of arr) for (let i = 0; i < 6; i++) r[i] += fp[i];
  const n = arr.length;
  return normalize([r[0]/n,r[1]/n,r[2]/n,r[3]/n,r[4]/n,r[5]/n]);
}

// Tính phân phối tổng 3 xúc xắc (index = giá trị tổng 3..18)
function computeSumDistrib(d: [FaceProbs, FaceProbs, FaceProbs]): number[] {
  const s = new Array(19).fill(0);
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 6; b++)
      for (let c = 0; c < 6; c++)
        s[a+b+c+3] += d[0][a]*d[1][b]*d[2][c];
  return s;
}

// ─── F1: Frequency Analysis ───────────────────────────────────────────────────
// 32 windows × 3 = 96 AI

const F1_W = [4,5,6,7,8,9,10,11,12,14,16,18,20,23,25,28,30,35,40,45,50,60,75,100,125,150,200,250,300,400,500,1000];

function freqAI(f: number[], w: number): FaceProbs {
  const s = Math.min(w, f.length), fp: FaceProbs = [0,0,0,0,0,0];
  for (let i = 0; i < s; i++) fp[f[i]-1]++;
  return normalize(fp);
}

// ─── F2: Regression to Mean ───────────────────────────────────────────────────
// 24W × 24S × 3 = 1.728 AI

const F2_W = [8,10,12,15,18,20,25,30,35,40,50,60,75,100,125,150,200,250,300,400,500,750,1000,2000];
const F2_S = [0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.5,0.6,0.7,0.8,0.9,1.0,1.2,1.4,1.6,1.8,2.0,2.5,3.0,3.5,4.0,5.0,7.0];

function regrAI(f: number[], w: number, s: number): FaceProbs {
  const sl = f.slice(0, Math.min(w, f.length));
  if (sl.length < 4) return uniform();
  const c: FaceProbs = [0,0,0,0,0,0];
  for (const v of sl) c[v-1]++;
  const n = sl.length, exp = n/6;
  const r: FaceProbs = [0,0,0,0,0,0];
  for (let i = 0; i < 6; i++) r[i] = Math.max(1e-6, 1/6 + ((exp-c[i])/n)*s);
  return normalize(r);
}

// ─── F3: Markov 1st-order ─────────────────────────────────────────────────────
// 20W × 3 = 60 AI

const F3_W = [6,8,10,12,15,18,20,25,30,35,40,50,60,75,100,125,150,200,500,1000];

function markov1AI(f: number[], w: number): FaceProbs {
  const sl = f.slice(0, Math.min(w, f.length));
  if (sl.length < 4) return uniform();
  const cur = sl[0];
  const t: FaceProbs = [0,0,0,0,0,0]; let tot = 0;
  for (let i = 0; i < sl.length-1; i++) if (sl[i+1] === cur) { t[sl[i]-1]++; tot++; }
  if (tot < 2) return uniform();
  return normalize(t.map(v => v/tot) as FaceProbs);
}

// ─── F4: Exponential-decay Markov ────────────────────────────────────────────
// 20λ × 3 = 60 AI

const F4_L = [0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08,0.10,0.12,0.15,0.18,0.20,0.25,0.30,0.35,0.40,0.50,0.60,0.80];

function expMarkovAI(f: number[], lam: number): FaceProbs {
  if (f.length < 4) return uniform();
  const cur = f[0];
  const t: FaceProbs = [0,0,0,0,0,0]; let tot = 0;
  for (let i = 0; i < f.length-1; i++) {
    if (f[i+1] === cur) { const w = Math.exp(-lam*i); t[f[i]-1] += w; tot += w; }
  }
  if (tot < 0.01) return uniform();
  return normalize(t.map(v => v/tot) as FaceProbs);
}

// ─── F5: Markov 2nd-order ────────────────────────────────────────────────────
// 12W × 3 = 36 AI

const F5_W = [10,12,15,20,25,30,40,50,75,100,200,1000];

function markov2AI(f: number[], w: number): FaceProbs {
  const sl = f.slice(0, Math.min(w, f.length));
  if (sl.length < 6) return markov1AI(f, w);
  const c = sl[0], p = sl[1];
  const t: FaceProbs = [0,0,0,0,0,0]; let tot = 0;
  for (let i = 0; i < sl.length-2; i++) {
    if (sl[i+1] === c && sl[i+2] === p) { t[sl[i]-1]++; tot++; }
  }
  if (tot < 2) return markov1AI(f, w);
  return normalize(t.map(v => v/tot) as FaceProbs);
}

// ─── F6: Bayesian Markov ──────────────────────────────────────────────────────
// 15W × 25α × 3 = 1.125 AI

const F6_W = [8,10,12,15,20,25,30,40,50,75,100,150,200,500,1000];
const F6_A = [0.01,0.05,0.1,0.15,0.2,0.3,0.5,0.7,1.0,1.5,2.0,3.0,5.0,7.0,10.0,15.0,20.0,30.0,50.0,75.0,100.0,150.0,200.0,500.0,1000.0];

function bayesMarkovAI(f: number[], w: number, a: number): FaceProbs {
  const sl = f.slice(0, Math.min(w, f.length));
  if (sl.length < 4) return uniform();
  const cur = sl[0];
  const t: FaceProbs = [a,a,a,a,a,a]; let tot = 6*a;
  for (let i = 0; i < sl.length-1; i++) if (sl[i+1] === cur) { t[sl[i]-1]++; tot++; }
  return normalize(t.map(v => v/tot) as FaceProbs);
}

// ─── F7: Streak Analysis ─────────────────────────────────────────────────────
// 8 modes × 3 = 24 AI

function streakAI(f: number[], mode: number): FaceProbs {
  if (f.length < 3) return uniform();
  const cur = f[0]; let streak = 1;
  for (let i = 1; i < f.length; i++) { if (f[i] === cur) streak++; else break; }
  const follow: FaceProbs = [0.03,0.03,0.03,0.03,0.03,0.03];
  follow[cur-1] = 0.85;
  const anti: FaceProbs  = [0.19,0.19,0.19,0.19,0.19,0.19];
  anti[cur-1] = 0.05;
  const flat = uniform();
  switch (mode) {
    case 0: return normalize(streak>=2 ? follow : flat); // follow any streak
    case 1: return normalize(streak>=3 ? anti  : flat); // anti streak≥3
    case 2: return normalize(streak>=4 ? anti  : flat); // anti streak≥4
    case 3: return normalize(streak>=5 ? anti  : follow); // strong anti
    case 4: return normalize(streak>=2 ? follow : anti); // follow or anti
    case 5: { // adaptive threshold from avg streak length
      const lens: number[] = []; let s2=1;
      for (let i=1;i<Math.min(80,f.length);i++){if(f[i]===f[i-1])s2++;else{lens.push(s2);s2=1;}}
      lens.push(s2);
      const avg = lens.reduce((a,b)=>a+b,0)/Math.max(lens.length,1);
      return normalize(streak >= Math.max(2,Math.round(avg)) ? anti : follow);
    }
    case 6: { // momentum: follow if short streak vs avg
      const lens2: number[] = []; let s3=1;
      for (let i=1;i<Math.min(80,f.length);i++){if(f[i]===f[i-1])s3++;else{lens2.push(s3);s3=1;}}
      lens2.push(s3);
      const avg2 = lens2.slice(0,-1).reduce((a,b)=>a+b,0)/Math.max(lens2.length-1,1);
      return normalize(streak < avg2 ? follow : flat);
    }
    default: return normalize(streak>=6 ? anti : flat); // very-long anti
  }
}

// ─── F8: Momentum ────────────────────────────────────────────────────────────
// 15 pairs × 3 = 45 AI

const F8_P: [number,number][] = [[3,10],[3,15],[3,20],[5,15],[5,20],[5,30],[5,50],[8,25],[8,40],[10,30],[10,50],[10,100],[15,50],[15,100],[20,100]];

function momentumAI(f: number[], sw: number, lw: number): FaceProbs {
  const s1 = f.slice(0,Math.min(sw,f.length));
  const s2 = f.slice(0,Math.min(lw,f.length));
  if (s1.length < 2 || s2.length < 5) return uniform();
  const fs: FaceProbs=[0,0,0,0,0,0], fl: FaceProbs=[0,0,0,0,0,0];
  for (const v of s1) fs[v-1]++; for (const v of s2) fl[v-1]++;
  const fsN = normalize(fs), flN = normalize(fl);
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) r[i]=Math.max(1e-6, 1/6+(fsN[i]-flN[i])*2.0);
  return normalize(r);
}

// ─── F9: Pattern Matching ────────────────────────────────────────────────────
// 8 lengths × 3 = 24 AI

const F9_L = [2,3,4,5,6,7,8,9];

function patternAI(f: number[], len: number): FaceProbs {
  if (f.length < len+3) return uniform();
  const fp: FaceProbs=[0,0,0,0,0,0]; let hits=0;
  const lim = Math.min(500, f.length);
  for (let start=1; start<=lim-len; start++) {
    let ok=true;
    for (let j=0;j<len;j++) if (f[start+j]!==f[j]) { ok=false; break; }
    if (ok) { fp[f[start-1]-1]++; hits++; }
  }
  return hits ? normalize(fp) : uniform();
}

// ─── F10: Hot/Cold Detection ─────────────────────────────────────────────────
// 14W × 2modes × 3 = 84 AI

const F10_W = [4,5,6,7,8,10,12,15,20,25,30,50,75,100];

function hotColdAI(f: number[], w: number, hot: boolean): FaceProbs {
  const sl = f.slice(0,Math.min(w,f.length));
  if (sl.length<3) return uniform();
  const c: FaceProbs=[0,0,0,0,0,0]; for (const v of sl) c[v-1]++;
  if (hot) return normalize(c.map(v=>Math.max(1e-6,v/sl.length)) as FaceProbs);
  const exp = sl.length/6;
  return normalize(c.map(v=>Math.max(1e-6,1/6+(exp-v)/sl.length*2)) as FaceProbs);
}

// ─── F11: Velocity Trend ────────────────────────────────────────────────────
// 12 pairs × 3 = 36 AI

const F11_P: [number,number][] = [[3,8],[3,10],[4,10],[5,10],[5,15],[5,20],[8,20],[8,30],[10,25],[10,40],[15,35],[15,50]];

function velocityAI(f: number[], sw: number, lw: number): FaceProbs {
  if (f.length < lw+1) return uniform();
  const s1=f.slice(0,sw), s2=f.slice(sw,lw);
  if (s1.length<2||s2.length<2) return uniform();
  const f1: FaceProbs=[0,0,0,0,0,0], f2: FaceProbs=[0,0,0,0,0,0];
  for (const v of s1) f1[v-1]++; for (const v of s2) f2[v-1]++;
  const f1N=normalize(f1), f2N=normalize(f2);
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) r[i]=Math.max(1e-6,1/6+(f1N[i]-f2N[i])*1.5);
  return normalize(r);
}

// ─── F12: Cycle Detection ────────────────────────────────────────────────────
// 7 lengths × 3 = 21 AI

const F12_L = [2,3,4,5,6,7,8];

function cycleAI(f: number[], maxLen: number): FaceProbs {
  if (f.length < maxLen*3+1) return uniform();
  for (let len=2; len<=maxLen; len++) {
    if (f.length < len*3+1) continue;
    let ok=true;
    for (let j=0; j<len*2; j++) if (f[j]!==f[j+len]) { ok=false; break; }
    if (ok) {
      const next = f[len-1];
      const fp: FaceProbs=[0.03,0.03,0.03,0.03,0.03,0.03];
      fp[next-1]=0.85; return normalize(fp);
    }
  }
  return uniform();
}

// ─── F13: Recency-Weighted Frequency ─────────────────────────────────────────
// 20λ × 3 = 60 AI

const F13_L = [0.01,0.02,0.03,0.04,0.05,0.06,0.07,0.08,0.10,0.12,0.15,0.18,0.20,0.25,0.30,0.40,0.50,0.65,0.80,1.00];

function recencyAI(f: number[], lam: number): FaceProbs {
  if (f.length<2) return uniform();
  const fp: FaceProbs=[0,0,0,0,0,0]; let tot=0;
  const lim=Math.min(1000,f.length);
  for (let i=0;i<lim;i++) { const w=Math.exp(-lam*i); fp[f[i]-1]+=w; tot+=w; }
  return normalize(fp.map(v=>v/tot) as FaceProbs);
}

// ─── F14: Meta Ensemble ──────────────────────────────────────────────────────
// 8 combos × 3 = 24 AI

function metaAI(f: number[], mode: number): FaceProbs {
  const blend = (a: FaceProbs, b: FaceProbs, wa: number): FaceProbs =>
    normalize([0,1,2,3,4,5].map(i=>a[i]*wa+b[i]*(1-wa)) as FaceProbs);
  switch (mode) {
    case 0: return blend(markov1AI(f,20), freqAI(f,30), 0.6);
    case 1: return blend(regrAI(f,30,1.0), velocityAI(f,5,20), 0.5);
    case 2: return blend(bayesMarkovAI(f,25,1.0), patternAI(f,3), 0.6);
    case 3: return blend(hotColdAI(f,20,true), momentumAI(f,5,20), 0.45);
    case 4: return blend(markov2AI(f,30), expMarkovAI(f,0.08), 0.55);
    case 5: return blend(regrAI(f,50,1.5), markov1AI(f,40), 0.4);
    case 6: return blend(recencyAI(f,0.10), hotColdAI(f,15,false), 0.5);
    default: return blend(bayesMarkovAI(f,50,0.5), velocityAI(f,8,30), 0.5);
  }
}

// ─── F15: Markov 3rd-order ────────────────────────────────────────────────────
// 10W × 3 = 30 AI

const F15_W = [15,20,25,30,40,50,75,100,200,500];

function markov3AI(f: number[], w: number): FaceProbs {
  const sl = f.slice(0,Math.min(w,f.length));
  if (sl.length < 8) return markov1AI(f,w);
  const c=sl[0],p1=sl[1],p2=sl[2];
  const t: FaceProbs=[0,0,0,0,0,0]; let tot=0;
  for (let i=0;i<sl.length-3;i++) {
    if (sl[i+1]===c&&sl[i+2]===p1&&sl[i+3]===p2) { t[sl[i]-1]++; tot++; }
  }
  if (tot<2) return markov2AI(f,w);
  return normalize(t.map(v=>v/tot) as FaceProbs);
}

// ─── F16: Windowed Exponential Markov ────────────────────────────────────────
// 15W × 12λ × 3 = 540 AI

const F16_W = [8,10,15,20,25,30,40,50,75,100,150,200,500,750,1000];
const F16_L = [0.02,0.04,0.06,0.08,0.10,0.14,0.18,0.24,0.30,0.40,0.55,0.75];

function winExpMarkovAI(f: number[], w: number, lam: number): FaceProbs {
  const sl = f.slice(0,Math.min(w,f.length));
  if (sl.length<4) return uniform();
  const cur=sl[0];
  const t: FaceProbs=[0,0,0,0,0,0]; let tot=0;
  for (let i=0;i<sl.length-1;i++) {
    if (sl[i+1]===cur) { const wt=Math.exp(-lam*i); t[sl[i]-1]+=wt; tot+=wt; }
  }
  if (tot<0.01) return uniform();
  return normalize(t.map(v=>v/tot) as FaceProbs);
}

// ─── F17: Gaussian-Weighted Frequency ────────────────────────────────────────
// 12σ × 3 = 36 AI

const F17_S = [5,8,10,15,20,30,40,50,75,100,150,200];

function gaussianAI(f: number[], sigma: number): FaceProbs {
  if (f.length<3) return uniform();
  const fp: FaceProbs=[0,0,0,0,0,0]; let tot=0;
  const lim=Math.min(1000,f.length);
  for (let i=0;i<lim;i++) {
    const w=Math.exp(-(i*i)/(2*sigma*sigma)); fp[f[i]-1]+=w; tot+=w;
  }
  return normalize(fp.map(v=>v/tot) as FaceProbs);
}

// ─── F18: Exponential Trend Smoothing ────────────────────────────────────────
// 15α × 3 = 45 AI

const F18_A = [0.02,0.05,0.08,0.10,0.12,0.15,0.18,0.20,0.25,0.30,0.40,0.50,0.65,0.80,0.95];

function etsAI(f: number[], alpha: number): FaceProbs {
  if (f.length<3) return uniform();
  // ETS: S_t = alpha*x_t + (1-alpha)*S_{t-1}
  // Track smoothed probability for each face
  const S: FaceProbs = [1/6,1/6,1/6,1/6,1/6,1/6];
  const chrono = [...f].reverse(); // oldest first
  for (const v of chrono) {
    const x: FaceProbs=[0,0,0,0,0,0]; x[v-1]=1.0;
    for (let i=0;i<6;i++) S[i]=alpha*x[i]+(1-alpha)*S[i];
  }
  return normalize(S);
}

// ─── F19: Parity Analysis (per-position) ────────────────────────────────────
// 12W × 3 = 36 AI

const F19_W = [5,8,10,15,20,25,30,40,50,75,100,200];

function parityAI(f: number[], w: number): FaceProbs {
  const sl=f.slice(0,Math.min(w,f.length));
  if (sl.length<4) return uniform();
  let evens=0;
  for (const v of sl) if (v%2===0) evens++;
  const evenRate=evens/sl.length;
  // Even faces: 2,4,6 → if recent trend even, boost 2/4/6
  const fp: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) {
    const isEven=(i%2===1); // face i+1 is even if i=1,3,5
    fp[i]=isEven ? evenRate/3 : (1-evenRate)/3;
  }
  return normalize(fp);
}

// ─── F20: Zigzag / Alternation Detector ─────────────────────────────────────
// 8 variants × 3 = 24 AI

function zigzagAI(f: number[], mode: number): FaceProbs {
  if (f.length<5) return uniform();
  const cur=f[0];
  // Count alternations (face changes) in recent window
  const wins=[4,6,8,10,12,15,20,30];
  const w=wins[Math.min(mode,wins.length-1)];
  const sl=f.slice(0,Math.min(w,f.length));
  let alts=0;
  for (let i=0;i<sl.length-1;i++) if (sl[i]!==sl[i+1]) alts++;
  const altRate=alts/Math.max(sl.length-1,1);
  // High alternation → predict different from current
  if (altRate>=0.75) {
    const anti: FaceProbs=[0.18,0.18,0.18,0.18,0.18,0.18]; anti[cur-1]=0.10; return normalize(anti);
  }
  // Low alternation → predict same as current
  if (altRate<=0.2) {
    const follow: FaceProbs=[0.03,0.03,0.03,0.03,0.03,0.03]; follow[cur-1]=0.85; return normalize(follow);
  }
  return uniform();
}

// ─── F21: Entropy Analysis ───────────────────────────────────────────────────
// 10W × 3 = 30 AI

const F21_W = [8,10,15,20,25,30,40,50,75,100];

function entropyAI(f: number[], w: number): FaceProbs {
  const sl=f.slice(0,Math.min(w,f.length));
  if (sl.length<5) return uniform();
  const c: FaceProbs=[0,0,0,0,0,0]; for (const v of sl) c[v-1]++;
  const ps=c.map(v=>v/sl.length);
  // Shannon entropy H = -sum(p*log(p)), max = log(6) ≈ 1.79
  let H=0; for (const p of ps) if (p>0) H-=p*Math.log(p);
  const maxH=Math.log(6);
  const normH=H/maxH; // 0=concentrated, 1=uniform
  // If high entropy (uniform) → go with regression (cold faces)
  // If low entropy (concentrated) → amplify that dominant face
  const exp=sl.length/6;
  const boost=normH<0.7 ? 2.0+normH : 0.5;
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) r[i]=Math.max(1e-6,1/6+((exp-c[i])/sl.length)*boost);
  return normalize(r);
}

// ─── F22: Variance Analysis ───────────────────────────────────────────────────
// 10W × 3 = 30 AI

const F22_W = [8,10,15,20,25,30,40,50,75,100];

function varianceAI(f: number[], w: number): FaceProbs {
  const sl=f.slice(0,Math.min(w,f.length));
  if (sl.length<5) return uniform();
  const c: FaceProbs=[0,0,0,0,0,0]; for (const v of sl) c[v-1]++;
  // Variance of face counts
  const mean=sl.length/6;
  const variance=c.reduce((s,v)=>s+(v-mean)**2,0)/6;
  const maxVar=mean*(1-1/6)*6; // rough max
  const normVar=Math.min(1,variance/Math.max(maxVar,1));
  // High variance → regression (push toward mean)
  // Low variance → follow frequency (it's balanced already)
  const str=normVar*3.0;
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) r[i]=Math.max(1e-6,1/6+((mean-c[i])/sl.length)*str);
  return normalize(r);
}

// ─── F23: Fibonacci-Weighted Frequency ───────────────────────────────────────
// 8 scales × 3 = 24 AI

const F23_S = [1,2,3,5,8,13,21,34];

function fibonacciAI(f: number[], scale: number): FaceProbs {
  if (f.length<3) return uniform();
  // Generate Fibonacci weights
  const fib: number[]=[1,1]; let a=1,b=1;
  while (fib.length < Math.min(1000,f.length)) { [a,b]=[b,a+b]; fib.push(b); }
  const fp: FaceProbs=[0,0,0,0,0,0]; let tot=0;
  const lim=Math.min(fib.length,f.length);
  for (let i=0;i<lim;i++) {
    const w=fib[Math.floor(i/Math.max(scale,1))] ?? 1;
    fp[f[i]-1]+=w; tot+=w;
  }
  return normalize(fp.map(v=>v/tot) as FaceProbs);
}

// ─── F24: Adaptive Regression ────────────────────────────────────────────────
// 8 variants × 3 = 24 AI

function adaptiveRegrAI(f: number[], mode: number): FaceProbs {
  const windows=[10,20,30,50,75,100,200,500];
  const w=Math.min(windows[mode]??50, f.length);
  const sl=f.slice(0,w);
  if (sl.length<5) return uniform();
  const c: FaceProbs=[0,0,0,0,0,0]; for (const v of sl) c[v-1]++;
  const exp=sl.length/6;
  // Adaptive strength: proportional to max deviation from expected
  const maxDev=Math.max(...c.map(v=>Math.abs(v-exp)));
  const strength=Math.min(5,maxDev/exp*2);
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) r[i]=Math.max(1e-6,1/6+((exp-c[i])/sl.length)*strength);
  return normalize(r);
}

// ─── F25: Super Meta AI ───────────────────────────────────────────────────────
// 12 combos × 3 = 36 AI

function superMetaAI(f: number[], mode: number): FaceProbs {
  const blend3=(a:FaceProbs,b:FaceProbs,c2:FaceProbs,w1:number,w2:number):FaceProbs => {
    const w3=1-w1-w2;
    return normalize([0,1,2,3,4,5].map(i=>a[i]*w1+b[i]*w2+c2[i]*w3) as FaceProbs);
  };
  switch(mode) {
    case 0: return blend3(markov1AI(f,30),regrAI(f,30,1),recencyAI(f,0.1),0.4,0.35);
    case 1: return blend3(markov2AI(f,30),bayesMarkovAI(f,20,1),freqAI(f,50),0.35,0.35);
    case 2: return blend3(expMarkovAI(f,0.08),momentumAI(f,5,25),regrAI(f,50,0.8),0.4,0.35);
    case 3: return blend3(patternAI(f,3),markov1AI(f,25),hotColdAI(f,20,false),0.35,0.35);
    case 4: return blend3(cycleAI(f,5),markov1AI(f,30),bayesMarkovAI(f,25,0.5),0.3,0.4);
    case 5: return blend3(etsAI(f,0.15),regrAI(f,40,1.2),markov2AI(f,40),0.4,0.3);
    case 6: return blend3(gaussianAI(f,20),freqAI(f,60),expMarkovAI(f,0.06),0.35,0.35);
    case 7: return blend3(entropyAI(f,30),varianceAI(f,30),recencyAI(f,0.12),0.35,0.35);
    case 8: return blend3(markov3AI(f,50),bayesMarkovAI(f,30,2),regrAI(f,75,0.7),0.35,0.35);
    case 9: return blend3(winExpMarkovAI(f,50,0.08),freqAI(f,100),momentumAI(f,8,40),0.4,0.3);
    case 10:return blend3(fibonacciAI(f,3),patternAI(f,4),markov1AI(f,50),0.3,0.35);
    default:return blend3(regrAI(f,100,1.5),bayesMarkovAI(f,50,3),expMarkovAI(f,0.05),0.35,0.35);
  }
}

// ─── F26: Seasonal Pattern ────────────────────────────────────────────────────
// 8 periods × 3 = 24 AI

const F26_P = [5,8,10,12,15,20,25,30];

function seasonalAI(f: number[], period: number): FaceProbs {
  if (f.length < period*3) return uniform();
  // Look at same position within each period
  const slot=0; // position within period = 0 (most recent)
  const vals: number[]=[];
  for (let k=0; k<20 && k*period<f.length; k++) vals.push(f[k*period]);
  if (vals.length<3) return uniform();
  const fp: FaceProbs=[0,0,0,0,0,0];
  for (const v of vals) fp[v-1]++;
  return normalize(fp);
}

// ─── F27: Delta Frequency ────────────────────────────────────────────────────
// 8 variants × 3 = 24 AI

function deltaFreqAI(f: number[], mode: number): FaceProbs {
  const pairs: [number,number][] = [[3,6],[4,8],[5,10],[6,12],[8,16],[10,20],[15,30],[20,40]];
  const [sw,lw]=pairs[Math.min(mode,pairs.length-1)];
  const s1=f.slice(0,Math.min(sw,f.length));
  const s2=f.slice(0,Math.min(lw,f.length));
  if (s1.length<2||s2.length<4) return uniform();
  const c1: FaceProbs=[0,0,0,0,0,0], c2: FaceProbs=[0,0,0,0,0,0];
  for (const v of s1) c1[v-1]++; for (const v of s2) c2[v-1]++;
  const r1=normalize(c1), r2=normalize(c2);
  const delta=r1.map((v,i)=>v-r2[i]); // rate of change
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) r[i]=Math.max(1e-6,1/6+delta[i]*2.0);
  return normalize(r);
}

// ─── F28: Markov-1+2 Blend ───────────────────────────────────────────────────
// 12α × 3 = 36 AI

const F28_A = [0.0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.95,1.0];

function markovBlend12AI(f: number[], alpha: number): FaceProbs {
  // alpha = weight of Markov-1, (1-alpha) = weight of Markov-2
  const m1=markov1AI(f,100);
  const m2=markov2AI(f,100);
  return normalize(m1.map((v,i)=>v*alpha+m2[i]*(1-alpha)) as FaceProbs);
}

// ─── F29: Bayesian Markov-2 ───────────────────────────────────────────────────
// 12W × 12α × 3 = 432 AI

const F29_W = [15,20,25,30,40,50,75,100,150,200,500,1000];
const F29_A = [0.05,0.1,0.2,0.5,1.0,2.0,5.0,10.0,20.0,50.0,100.0,500.0];

function bayesMarkov2AI(f: number[], w: number, alpha: number): FaceProbs {
  const sl=f.slice(0,Math.min(w,f.length));
  if (sl.length<6) return uniform();
  const c=sl[0],p=sl[1];
  const t: FaceProbs=[alpha,alpha,alpha,alpha,alpha,alpha]; let tot=6*alpha;
  for (let i=0;i<sl.length-2;i++) if (sl[i+1]===c&&sl[i+2]===p) { t[sl[i]-1]++; tot++; }
  return normalize(t.map(v=>v/tot) as FaceProbs);
}

// ─── F30: Polynomial Regression ───────────────────────────────────────────────
// 20W × 8 modes × 3 = 480 AI

const F30_W = [10,15,20,25,30,40,50,60,75,100,125,150,200,250,300,400,500,750,1000,2000];
const F30_M = [0,1,2,3,4,5,6,7]; // polynomial mode

function polyRegrAI(f: number[], w: number, mode: number): FaceProbs {
  const sl=f.slice(0,Math.min(w,f.length));
  if (sl.length<5) return uniform();
  const c: FaceProbs=[0,0,0,0,0,0]; for (const v of sl) c[v-1]++;
  const exp=sl.length/6;
  const r: FaceProbs=[0,0,0,0,0,0];
  for (let i=0;i<6;i++) {
    const deficit=(exp-c[i])/exp; // normalized deficit: >0 means under-represented
    let boost: number;
    switch(mode) {
      case 0: boost=deficit;                    break; // linear
      case 1: boost=Math.sign(deficit)*deficit**2;break; // quadratic
      case 2: boost=Math.sign(deficit)*Math.abs(deficit)**0.5; break; // sqrt
      case 3: boost=Math.sign(deficit)*Math.abs(deficit)**0.333; break; // cube-root
      case 4: boost=deficit*2.0;                break; // linear×2
      case 5: boost=Math.sign(deficit)*Math.min(1,Math.abs(deficit)**1.5); break; // power 1.5
      case 6: boost=Math.tanh(deficit*3);       break; // tanh
      default:boost=Math.sign(deficit)*Math.min(1,Math.abs(deficit)**3); break; // cubic
    }
    r[i]=Math.max(1e-6,1/6+boost*0.5);
  }
  return normalize(r);
}

// ─── Main aggregation loop ────────────────────────────────────────────────────

interface PosAggResult {
  aggProbs:  FaceProbs;
  aiCount:   number;
  byFamily:  { name: string; probs: FaceProbs; count: number }[];
}

function runAllAIsForPosition(f: number[]): PosAggResult {
  // Weighted accumulator: running sum + total weight
  const agg: FaceProbs=[0,0,0,0,0,0];
  let totalN=0;
  const byFamily: { name: string; probs: FaceProbs; count: number }[]=[];

  function addFamily(name: string, results: FaceProbs[]) {
    if (!results.length) return;
    const merged: FaceProbs=[0,0,0,0,0,0];
    for (const r of results) for (let i=0;i<6;i++) merged[i]+=r[i];
    const n=results.length;
    const norm=normalize(merged.map(v=>v/n) as FaceProbs);
    byFamily.push({ name, probs: norm, count: n });
    for (let i=0;i<6;i++) agg[i]+=norm[i]*n;
    totalN+=n;
  }

  // F1
  addFamily("Tần suất", F1_W.map(w=>freqAI(f,w)));
  // F2
  { const r: FaceProbs[]=[];
    for (const w of F2_W) for (const s of F2_S) r.push(regrAI(f,w,s));
    addFamily("Hồi quy", r); }
  // F3
  addFamily("Markov-1", F3_W.map(w=>markov1AI(f,w)));
  // F4
  addFamily("Exp-Markov", F4_L.map(l=>expMarkovAI(f,l)));
  // F5
  addFamily("Markov-2", F5_W.map(w=>markov2AI(f,w)));
  // F6
  { const r: FaceProbs[]=[];
    for (const w of F6_W) for (const a of F6_A) r.push(bayesMarkovAI(f,w,a));
    addFamily("Bayesian", r); }
  // F7
  addFamily("Phân tích cầu", [0,1,2,3,4,5,6,7].map(m=>streakAI(f,m)));
  // F8
  addFamily("Momentum", F8_P.map(([s,l])=>momentumAI(f,s,l)));
  // F9
  addFamily("Pattern", F9_L.map(l=>patternAI(f,l)));
  // F10
  { const r: FaceProbs[]=[];
    for (const w of F10_W) { r.push(hotColdAI(f,w,true)); r.push(hotColdAI(f,w,false)); }
    addFamily("Hot/Cold", r); }
  // F11
  addFamily("Velocity", F11_P.map(([s,l])=>velocityAI(f,s,l)));
  // F12
  addFamily("Chu kỳ", F12_L.map(l=>cycleAI(f,l)));
  // F13
  addFamily("Recency", F13_L.map(l=>recencyAI(f,l)));
  // F14
  addFamily("Meta", [0,1,2,3,4,5,6,7].map(m=>metaAI(f,m)));
  // F15
  addFamily("Markov-3", F15_W.map(w=>markov3AI(f,w)));
  // F16
  { const r: FaceProbs[]=[];
    for (const w of F16_W) for (const l of F16_L) r.push(winExpMarkovAI(f,w,l));
    addFamily("Cửa sổ+Exp", r); }
  // F17
  addFamily("Gaussian", F17_S.map(s=>gaussianAI(f,s)));
  // F18
  addFamily("ETS", F18_A.map(a=>etsAI(f,a)));
  // F19
  addFamily("Chẵn/Lẻ vị trí", F19_W.map(w=>parityAI(f,w)));
  // F20
  addFamily("Zigzag", [0,1,2,3,4,5,6,7].map(m=>zigzagAI(f,m)));
  // F21
  addFamily("Entropy", F21_W.map(w=>entropyAI(f,w)));
  // F22
  addFamily("Variance", F22_W.map(w=>varianceAI(f,w)));
  // F23
  addFamily("Fibonacci", F23_S.map(s=>fibonacciAI(f,s)));
  // F24
  addFamily("Adaptive Regr", [0,1,2,3,4,5,6,7].map(m=>adaptiveRegrAI(f,m)));
  // F25
  addFamily("Super Meta", [0,1,2,3,4,5,6,7,8,9,10,11].map(m=>superMetaAI(f,m)));
  // F26
  addFamily("Seasonal", F26_P.map(p=>seasonalAI(f,p)));
  // F27
  addFamily("Delta Freq", [0,1,2,3,4,5,6,7].map(m=>deltaFreqAI(f,m)));
  // F28
  addFamily("Markov-1+2", F28_A.map(a=>markovBlend12AI(f,a)));
  // F29
  { const r: FaceProbs[]=[];
    for (const w of F29_W) for (const a of F29_A) r.push(bayesMarkov2AI(f,w,a));
    addFamily("Bayesian-2", r); }
  // F30
  { const r: FaceProbs[]=[];
    for (const w of F30_W) for (const m of F30_M) r.push(polyRegrAI(f,w,m));
    addFamily("Poly Regr", r); }

  const norm=normalize(agg.map(v=>v/Math.max(totalN,1)) as FaceProbs);
  return { aggProbs: norm, aiCount: totalN, byFamily };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function runXucXacEnsemble(sessions: XucXacSession[]): EnsembleResult | null {
  if (sessions.length < 5) return null;

  const pos: [number[], number[], number[]] = [
    sessions.map(s=>s.dice[0]),
    sessions.map(s=>s.dice[1]),
    sessions.map(s=>s.dice[2]),
  ];

  const res = pos.map(f=>runAllAIsForPosition(f));

  const diceProbs: [FaceProbs, FaceProbs, FaceProbs] = [
    res[0].aggProbs, res[1].aggProbs, res[2].aggProbs,
  ];

  const predictedFaces: [number,number,number] = [
    topFace(diceProbs[0]), topFace(diceProbs[1]), topFace(diceProbs[2]),
  ];

  const predictedSum = predictedFaces[0]+predictedFaces[1]+predictedFaces[2];
  const sumDistrib   = computeSumDistrib(diceProbs);

  let txProb=0; for (let s=11;s<=18;s++) txProb+=sumDistrib[s]??0;
  let clProb=0; for (let s=3;s<=18;s++) if(s%2===0) clProb+=sumDistrib[s]??0;
  txProb=Math.round(txProb*100); clProb=Math.round(clProb*100);

  const txLabel: "Tài"|"Xỉu" = txProb>=50 ? "Tài" : "Xỉu";
  const clLabel: "Chẵn"|"Lẻ" = clProb>=50 ? "Chẵn" : "Lẻ";
  const txFinalProb = txProb>=50 ? txProb : 100-txProb;
  const clFinalProb = clProb>=50 ? clProb : 100-clProb;

  const faceConsensus = Math.round(
    (Math.max(...diceProbs[0])+Math.max(...diceProbs[1])+Math.max(...diceProbs[2]))/3*100
  );
  const txConsensus = Math.round(txFinalProb);

  // Build family results from pos[0] families (all 3 positions have same family names/counts)
  const families: FamilyResult[] = res[0].byFamily.map((fam, idx) => {
    const tf: [number,number,number]=[
      topFace(res[0].byFamily[idx].probs),
      topFace(res[1].byFamily[idx]?.probs ?? uniform()),
      topFace(res[2].byFamily[idx]?.probs ?? uniform()),
    ];
    const fSum=tf[0]+tf[1]+tf[2];
    return {
      name:     fam.name,
      aiCount:  fam.count*3,
      topFaces: tf,
      txVote:   fSum>=11 ? "Tài" : "Xỉu",
      clVote:   fSum%2===0 ? "Chẵn" : "Lẻ",
    };
  });

  return {
    diceProbs, predictedFaces, predictedSum, sumDistrib,
    txLabel, txProb: txFinalProb,
    clLabel, clProb: clFinalProb,
    faceConsensus, txConsensus,
    totalAIs: res[0].aiCount*3,
    families,
  };
}

// ─── Format ───────────────────────────────────────────────────────────────────

const DICE_ICO = ["","⚀","⚁","⚂","⚃","⚄","⚅"];

function bar(p: number, w=10): string {
  const n=Math.round(Math.max(0,Math.min(1,p))*w);
  return "▓".repeat(n)+"░".repeat(w-n);
}
function txE(l: string): string { return l==="Tài"?"🔴":"🔵"; }
function clE(l: string): string { return l==="Chẵn"?"⚪":"⚫"; }

export function formatEnsembleSection(r: EnsembleResult): string {
  const { diceProbs, predictedFaces, predictedSum, sumDistrib,
          txLabel, txProb, clLabel, clProb, faceConsensus, txConsensus, totalAIs, families } = r;

  const lines: string[]=[];
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push(`🤖 <b>ENSEMBLE AI — ${totalAIs.toLocaleString("vi-VN")} AI PHÂN TÍCH</b>`);
  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("🎲 <b>XÁC SUẤT TỪNG MẶT (3 con xúc xắc):</b>");
  lines.push("");

  for (let pos=0;pos<3;pos++) {
    const fp=diceProbs[pos], pred=predictedFaces[pos];
    lines.push(`<b>Con ${pos+1}:</b>`);
    for (let f=1;f<=6;f++) {
      const pct=Math.round(fp[f-1]*100);
      const tag=f===pred?" ◀ <b>dự đoán</b>":"";
      lines.push(`  ${DICE_ICO[f]} Mặt ${f}: ${bar(fp[f-1])}  <b>${pct}%</b>${tag}`);
    }
    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━");
  lines.push("🎯 <b>DỰ ĐOÁN ENSEMBLE:</b>");
  lines.push(
    `  Con 1: ${DICE_ICO[predictedFaces[0]]} <b>Mặt ${predictedFaces[0]}</b>  ` +
    `Con 2: ${DICE_ICO[predictedFaces[1]]} <b>Mặt ${predictedFaces[1]}</b>  ` +
    `Con 3: ${DICE_ICO[predictedFaces[2]]} <b>Mặt ${predictedFaces[2]}</b>`
  );
  lines.push(`  Tổng: <b>${predictedSum}</b>  →  ${txE(txLabel)} <b>${txLabel}</b> (${txProb}%)  ${clE(clLabel)} <b>${clLabel}</b> (${clProb}%)`);
  lines.push("");

  lines.push("📊 <b>ĐỘ ĐỒNG THUẬN AI:</b>");
  lines.push(`  Tài/Xỉu: ${bar(txConsensus/100)}  <b>${txConsensus}%</b>`);
  lines.push(`  Mặt XS:  ${bar(faceConsensus/100)}  <b>${faceConsensus}%</b>`);
  lines.push("");

  // Family table — chỉ hiện những family quan trọng
  const key_families=["Tần suất","Hồi quy","Markov-1","Bayesian","Bayesian-2","Cửa sổ+Exp","Poly Regr","Momentum","Pattern","Super Meta","Meta"];
  const shown=families.filter(f=>key_families.includes(f.name));
  if (shown.length>0) {
    lines.push("🔬 <b>NHÓM AI CHÍNH:</b>");
    for (const fam of shown) {
      const agree=fam.txVote===txLabel?"✅":"⚡";
      const [f1,f2,f3]=fam.topFaces;
      lines.push(
        `  ${agree} <b>${fam.name}</b> (${fam.aiCount.toLocaleString("vi-VN")} AI)` +
        `  ${DICE_ICO[f1]}${DICE_ICO[f2]}${DICE_ICO[f3]}` +
        `  → ${txE(fam.txVote)}<b>${fam.txVote}</b> ${clE(fam.clVote)}<b>${fam.clVote}</b>`
      );
    }
    lines.push("");
  }

  // Top 5 tổng xác suất cao nhất
  lines.push("📈 <b>XÁC SUẤT THEO TỔNG:</b>");
  const tops=[...sumDistrib.entries()].slice(3,19)
    .map(([s,p])=>({s,p})).sort((a,b)=>b.p-a.p).slice(0,5);
  for (const {s,p} of tops) {
    const pct=Math.round(p*100);
    const l=s>=11?"Tài":"Xỉu", cl=s%2===0?"Chẵn":"Lẻ";
    lines.push(`  Tổng <b>${s}</b>: ${bar(p,8)} <b>${pct}%</b>  ${txE(l)}${l} ${clE(cl)}${cl}`);
  }

  return lines.join("\n");
}
