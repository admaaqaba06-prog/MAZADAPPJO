// Shared auctioneer audio: ONE reusable AudioContext for the whole app.
//
// Previously LiveStreamView created `new AudioContext()` on EVERY countdown
// tick and never closed it. In the final-10s snipe window (a tick per second)
// the browser's per-page AudioContext cap is quickly exhausted, so
// `new AudioContext()` starts throwing — the old try/catch swallowed the error
// and the urgency ticks went SILENT exactly when they matter most, while the
// orphaned contexts leaked. Here we lazily create a single module-level context
// and reuse it for every tick/finish sound.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  return (window.AudioContext || (window as any).webkitAudioContext) ?? null;
}

// Lazily create the single shared context. Returns null if unavailable
// (SSR / very old browsers) so callers can no-op safely.
function getContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch (err) {
    console.warn('AudioContext creation failed:', err);
    ctx = null;
  }
  return ctx;
}

// iOS/Safari autoplay policy: an AudioContext starts 'suspended' until it is
// resumed from within a user gesture. Call this from a tap/click handler
// (unmute, play/pause, first bid) so later programmatic ticks are audible.
export function resumeAudio(): void {
  const c = getContext();
  if (c && c.state === 'suspended') {
    c.resume().catch((err) => console.warn('AudioContext resume failed:', err));
  }
}

// Subtle haptic feedback (guarded — not all devices/browsers expose vibrate).
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* vibrate can throw on some locked-down contexts — ignore */
  }
}

// Crisp high countdown tick — fired once per second in the final-10s window.
// Also emits a short haptic pulse so the snipe window is felt as well as heard.
export function playTick(): void {
  const c = getContext();
  if (!c) return;
  // A tick scheduled while suspended would never sound; try to resume first.
  if (c.state === 'suspended') resumeAudio();
  try {
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.connect(gain);
    gain.connect(c.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, c.currentTime); // Crisp high tick

    gain.gain.setValueAtTime(0.08, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);

    osc.start();
    osc.stop(c.currentTime + 0.08);
  } catch (err) {
    console.warn('Audio tick failed:', err);
  }

  // Short, subtle pulse per snipe tick.
  vibrate(15);
}

// Dual-tone triumphant finish chime + a slightly longer haptic on close.
export function playFinish(): void {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') resumeAudio();
  try {
    const osc1 = c.createOscillator();
    const osc2 = c.createOscillator();
    const gain = c.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(c.destination);

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, c.currentTime); // C5
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, c.currentTime); // E5

    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.2);

    osc1.start();
    osc2.start();
    osc1.stop(c.currentTime + 1.2);
    osc2.stop(c.currentTime + 1.2);
  } catch (err) {
    console.warn('Audio finish failed:', err);
  }

  // Longer double-buzz on the finish moment.
  vibrate([40, 30, 40]);
}
