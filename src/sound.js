// Tiny WebAudio sound kit — no audio files, just synthesized blips so the app
// stays a single self-contained bundle. Lazily creates the AudioContext on the
// first user gesture (browsers block it before then).
(function () {
  "use strict";
  let ctx = null;
  let enabled = true;

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, when) {
    const c = ac();
    if (!c || !enabled) return;
    const t0 = c.currentTime + (when || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const Sound = {
    setEnabled(v) {
      enabled = !!v;
    },
    enabled() {
      return enabled;
    },
    place(player) {
      // X a touch lower than O so you can hear whose turn landed.
      tone(player === "A" ? 440 : 560, 0.12, "triangle", 0.16);
    },
    fade() {
      tone(300, 0.18, "sine", 0.12);
      tone(200, 0.22, "sine", 0.1, 0.05);
    },
    illegal() {
      tone(140, 0.12, "sawtooth", 0.1);
    },
    boardWon() {
      tone(660, 0.1, "triangle", 0.16);
      tone(880, 0.12, "triangle", 0.16, 0.08);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, 0.18, "triangle", 0.18, i * 0.1));
    },
    draw() {
      tone(392, 0.2, "sine", 0.14);
      tone(330, 0.26, "sine", 0.12, 0.1);
    },
    click() {
      tone(700, 0.05, "square", 0.06);
    },
  };

  window.Sound = Sound;
})();
