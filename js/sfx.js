// 音效引擎 —— Web Audio 合成，无音频文件、完全离线
// 风格贴合手账：铅笔勾选的轻响、盖章的闷响、翻页的沙沙声
import { getSettings } from './db.js';

let _ac = null;
let _enabled = true;
let _loaded = false;

export async function initSfx() {
  if (_loaded) return;
  _loaded = true;
  try { const s = await getSettings(); _enabled = s.sound !== false; } catch { /* 默认开 */ }
}
export function setSfxEnabled(v) { _enabled = v; }

function ac() {
  if (!_enabled) return null;
  if (!_ac) {
    try { _ac = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (_ac.state === 'suspended') _ac.resume().catch(() => {});
  return _ac;
}

// 基础音符
function tone(freq, t0, dur, { type = 'sine', gain = 0.12, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

// 噪声（纸声/盖章闷响）
function noise(t0, dur, { gain = 0.1, freq = 800, q = 0.8 } = {}) {
  const c = ac(); if (!c) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t0);
}

const now = () => _ac ? _ac.currentTime : 0;

// ✏️ 勾选任务：铅笔轻响一声
export function sfxTick() {
  const c = ac(); if (!c) return; const t = now();
  noise(t, 0.05, { gain: 0.06, freq: 3800 });
  tone(1320, t + 0.01, 0.07, { type: 'triangle', gain: 0.07 });
}

// ↩️ 取消勾选：往下落一个小音
export function sfxUntick() {
  const c = ac(); if (!c) return; const t = now();
  tone(660, t, 0.09, { type: 'triangle', gain: 0.06, slide: -180 });
}

// 🖃 打卡盖章：纸面闷响 + 章落下的顿感
export function sfxStamp() {
  const c = ac(); if (!c) return; const t = now();
  noise(t, 0.12, { gain: 0.16, freq: 500 });
  tone(150, t, 0.16, { type: 'sine', gain: 0.22, slide: -70 });
  tone(1046, t + 0.13, 0.1, { type: 'sine', gain: 0.05 });
  tone(1568, t + 0.2, 0.14, { type: 'sine', gain: 0.05 });
}

// ❌ 迟交/断卡：低低的叹气声
export function sfxLate() {
  const c = ac(); if (!c) return; const t = now();
  tone(220, t, 0.22, { type: 'sine', gain: 0.1, slide: -100 });
  tone(110, t + 0.08, 0.25, { type: 'sine', gain: 0.08, slide: -40 });
}

// ✅ 抽查答对：轻快两连音
export function sfxCorrect() {
  const c = ac(); if (!c) return; const t = now();
  tone(659, t, 0.09, { type: 'sine', gain: 0.09 });
  tone(988, t + 0.09, 0.14, { type: 'sine', gain: 0.09 });
}

// ❌ 抽查答错：闷闷的否定音
export function sfxWrong() {
  const c = ac(); if (!c) return; const t = now();
  tone(196, t, 0.13, { type: 'triangle', gain: 0.09 });
  tone(147, t + 0.12, 0.2, { type: 'triangle', gain: 0.09 });
}

// 🎉 里程碑/全对：小号角琶音
export function sfxMilestone() {
  const c = ac(); if (!c) return; const t = now();
  [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.22, { type: 'sine', gain: 0.09 }));
}

// 📄 抽查结束：合上手账的一声
export function sfxFinish() {
  const c = ac(); if (!c) return; const t = now();
  noise(t, 0.18, { gain: 0.1, freq: 1600 });
  tone(392, t + 0.05, 0.12, { type: 'sine', gain: 0.07 });
  tone(523, t + 0.15, 0.2, { type: 'sine', gain: 0.07 });
}

// 🔔 添加事项/入词库：轻拨一声
export function sfxAdd() {
  const c = ac(); if (!c) return; const t = now();
  tone(880, t, 0.08, { type: 'triangle', gain: 0.07 });
  tone(1175, t + 0.06, 0.1, { type: 'triangle', gain: 0.06 });
}
