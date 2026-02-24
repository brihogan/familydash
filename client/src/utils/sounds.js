/** Lazily created singleton AudioContext */
let _ctx = null;

function ac() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function tone(ctx, freq, start, duration, volume = 0.22, type = 'sine') {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration + 0.01);
}

/** Short "ding" played when a single chore is checked off. */
export function playChoreCheck() {
  try {
    const ctx = ac();
    const t   = ctx.currentTime;
    tone(ctx, 880,  t, 0.35, 0.20); // A5 — main ping
    tone(ctx, 1320, t, 0.18, 0.07); // E6 — harmonic shimmer
  } catch (_) {}
}

/** Cash-register "ka-ching" played when a kid redeems a reward. */
export function playCashIn() {
  try {
    const ctx = ac();
    const t   = ctx.currentTime;
    // Quick ascending register clicks
    tone(ctx, 523.25, t,        0.09, 0.22, 'square'); // C5
    tone(ctx, 659.25, t + 0.08, 0.09, 0.18, 'square'); // E5
    tone(ctx, 783.99, t + 0.16, 0.09, 0.15, 'square'); // G5
    // Bright sustained "ching" ring
    tone(ctx, 1760,   t + 0.24, 0.70, 0.22, 'sine');   // A6
    tone(ctx, 2217,   t + 0.24, 0.50, 0.09, 'sine');   // C#7 harmonic shimmer
  } catch (_) {}
}

/** Ascending arpeggio fanfare when ALL chores for the day are done. */
export function playVictory() {
  try {
    const ctx   = ac();
    const t     = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    // Rising arpeggio
    notes.forEach((f, i) => tone(ctx, f, t + i * 0.12, 0.45, 0.18));
    // Final chord swell
    notes.forEach((f)    => tone(ctx, f, t + 0.54,     1.0,  0.10));
  } catch (_) {}
}
