// Small sounds that answer what a person does (a soft tick, a rising chime, a low double note for a mistake).
// Quiet, short, and only after a click or a key press (the browser allows nothing before that). Mute with
// the speaker button next to the password: the choice is remembered.
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem('611_sound') === 'off';
} catch {
  /* storage unavailable: sound stays on */
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('611_sound', value ? 'off' : 'on');
  } catch {
    /* ignore */
  }
}

function tone(freq, duration, { type = 'sine', volume = 0.035, delay = 0 } = {}) {
  if (muted) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  } catch {
    /* no audio: nothing to do */
  }
}

export const sounds = {
  show: () => tone(660, 0.09),
  hide: () => tone(440, 0.09),
  rule: () => tone(988, 0.07, { volume: 0.03 }),
  match: () => tone(1047, 0.09),
  strong: () => {
    tone(784, 0.09);
    tone(988, 0.09, { delay: 0.09 });
    tone(1319, 0.16, { delay: 0.18, volume: 0.04 });
  },
  suggest: () => {
    tone(523, 0.07);
    tone(784, 0.1, { delay: 0.07 });
  },
  error: () => {
    tone(220, 0.12, { type: 'square', volume: 0.02 });
    tone(175, 0.16, { type: 'square', volume: 0.02, delay: 0.11 });
  },
};
