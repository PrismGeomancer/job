// Tiny synthesized sounds (no files). Off by default; the choice is remembered on this device.
const KEY = "job.sound";
let ctx = null;
let on = false;
try { on = localStorage.getItem(KEY) === "1"; } catch {}

export const soundOn = () => on;
export function setSound(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {}
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(c, { type = "sine", from, to = from, at = 0, dur = 0.1, vol = 0.12 }) {
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(c, { at = 0, dur = 0.08, vol = 0.1, freq = 900 }) {
  const t = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const SOUNDS = {
  key: (c) => tone(c, { type: "square", from: 1500, to: 900, dur: 0.03, vol: 0.04 }),
  thunk: (c) => { tone(c, { from: 130, to: 38, dur: 0.16, vol: 0.3 }); noise(c, { dur: 0.07, vol: 0.18, freq: 1400 }); },
  ding: (c) => { tone(c, { from: 988, dur: 0.5, vol: 0.12 }); tone(c, { from: 1480, at: 0.07, dur: 0.5, vol: 0.07 }); },
  miss: (c) => tone(c, { type: "sawtooth", from: 190, to: 80, dur: 0.28, vol: 0.09 }),
  print: (c) => { for (let i = 0; i < 6; i++) tone(c, { type: "square", from: 1100 + (i % 2) * 300, to: 700, at: i * 0.055, dur: 0.025, vol: 0.035 }); },
};

export function play(name) {
  if (!on) return;
  const c = audio();
  if (c) SOUNDS[name]?.(c);
}
