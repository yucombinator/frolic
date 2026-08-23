// Synthesized audio — WebAudio, no assets. Safe to call before user gesture;
// the AudioContext is created lazily on first initAudio().
//
// Includes a generative ambient pad: a slow crossfading chord drone plus
// sparse pentatonic "sparkles". Everything is synthesized at runtime, so
// there are no audio files, no licenses, no attribution — royalty-free by
// construction.

let ctx = null;
let master = null;
let ambientGain = null;
let ambientFilter = null;
let analyser = null;
let muted = false;
let ambientEnabled = false;
let ambientLive = false; // voices actually sounding right now
let ambientTimers = [];
let ambientVoices = new Set(); // { osc, g, stop }
let chordArmed = false; // a chord chain is scheduled
let sparkArmed = false; // a sparkle chain is scheduled
let lfo = null;
let birdsTimer = null; // timeout handle for the wandering birdsong

// Slow, spacey chord cycle. Each entry: { root, notes } — frequencies in Hz
// in a C-major-ish family (Cmaj7 / Am9 / Dm9 / Fmaj7 / Gmaj9 / Em7). The
// progression is a weighted random walk, so the pad wanders but stays in key.
const AMBIENT_CHORDS = [
  { root: 130.81, notes: [130.81, 261.63, 392.0, 493.88] }, // Cmaj7
  { root: 110.0, notes: [110.0, 220.0, 329.63, 493.88] },   // Am(add9)
  { root: 146.83, notes: [146.83, 220.0, 349.23, 440.0] },  // Dm9
  { root: 174.61, notes: [174.61, 261.63, 349.23, 440.0] }, // Fmaj7
  { root: 98.0, notes: [98.0, 196.0, 293.66, 392.0, 493.88] }, // Gmaj9
  { root: 82.41, notes: [82.41, 164.81, 246.94, 329.63, 392.0] }, // Em7
];
const CHORD_S = 26;       // baseline; each chord picks its own 18-32s
const CROSSFADE_S = 4;    // baseline; each chord picks its own crossfade

// C major pentatonic across two octaves (Hz) — sparkles wander the range.
const SPARKLE_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5, 1174.66, 1318.51, 1567.98];

export function initAudio() {
  if (ctx) return getApi();
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(ctx.destination);

    // Ambient bus: lowpass for a soft wash, straight into the master.
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.0;
    ambientFilter = ctx.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 1000;
    ambientFilter.Q.value = 0.4;
    ambientGain.connect(ambientFilter).connect(master);

    // Analyser taps the master so we can prove sound is flowing.
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(analyser);
  } catch (e) {
    ctx = null;
    return null;
  }
  return getApi();
}

function rmsDb() {
  if (!analyser) return -Infinity;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / data.length);
  return 20 * Math.log10(rms + 1e-9);
}

// --- ambient engine ---------------------------------------------------

// Spawn one chord with per-chord randomness: pick a subset of its notes, add
// a low root drone, widen or narrow the chorus, and let each voice drift in
// level so every occurrence sounds a little different. `durS` is this chord's
// own length; `fadeS` its crossfade.
function spawnChord(chord, startAt, durS = CHORD_S, fadeS = CROSSFADE_S) {
  // Drop one mid note sometimes so the voicing shifts between repetitions.
  let freqs = chord.notes.slice();
  if (freqs.length > 3 && Math.random() < 0.35) {
    freqs.splice(1 + Math.floor(Math.random() * (freqs.length - 2)), 1);
  }
  // A low root drone an octave under the bass for weight.
  if (Math.random() < 0.8) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = chord.root / 2;
    osc.detune.value = (Math.random() - 0.5) * 8;
    const g = ctx.createGain();
    const amp = (0.05 + Math.random() * 0.03) / Math.sqrt(freqs.length);
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.exponentialRampToValueAtTime(amp, startAt + fadeS);
    g.gain.setValueAtTime(amp, startAt + durS - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + durS + 1);
    osc.connect(g).connect(ambientFilter);
    osc.start(startAt);
    osc.stop(startAt + durS + 3);
    ambientVoices.add({ osc, g, stop: startAt + durS + 3 });
  }
  const spread = 1.5 + Math.random() * 3.5; // chorus width varies
  for (const f of freqs) {
    // Two detuned sine voices per pitch (gentle chorus).
    for (const detune of [-spread, spread]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = detune + (Math.random() - 0.5) * 2;
      const g = ctx.createGain();
      const amp = (0.09 + Math.random() * 0.04) / Math.sqrt(freqs.length);
      g.gain.setValueAtTime(0.0001, startAt);
      g.gain.exponentialRampToValueAtTime(amp, startAt + fadeS);
      g.gain.setValueAtTime(amp, startAt + durS - 1);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + durS + 1);
      osc.connect(g).connect(ambientFilter);
      osc.start(startAt);
      osc.stop(startAt + durS + 3);
      ambientVoices.add({ osc, g, stop: startAt + durS + 3 });
    }
    // Faint overtone an octave up for airiness, sometimes a fifth above that.
    if (Math.random() < 0.75) {
      const hi = ctx.createOscillator();
      hi.type = 'sine';
      hi.frequency.value = f * 2;
      hi.detune.value = (Math.random() - 0.5) * 6;
      const hg = ctx.createGain();
      const hamp = (0.02 + Math.random() * 0.02) / Math.sqrt(freqs.length);
      hg.gain.setValueAtTime(0.0001, startAt);
      hg.gain.exponentialRampToValueAtTime(hamp, startAt + fadeS);
      hg.gain.setValueAtTime(hamp, startAt + durS - 1);
      hg.gain.exponentialRampToValueAtTime(0.0001, startAt + durS + 1);
      hi.connect(hg).connect(ambientFilter);
      hi.start(startAt);
      hi.stop(startAt + durS + 3);
      ambientVoices.add({ osc: hi, g: hg, stop: startAt + durS + 3 });
    }
  }
}

// Advance the chord cycle forever while ambient is live and unmuted. The
// progression is a weighted random walk: it favours staying in the same key
// area (nearby palette entries) but occasionally wanders, and never repeats
// the previous chord. Each chord gets its own duration and crossfade.
function pickNextChord(prevIdx) {
  const n = AMBIENT_CHORDS.length;
  if (Math.random() < 0.6) {
    // Stay near the previous chord: +/-1 step, wrapping.
    const d = Math.random() < 0.5 ? 1 : n - 1;
    return (prevIdx + d) % n;
  }
  // Wander somewhere else, but never straight back to the same chord.
  let next = Math.floor(Math.random() * n);
  if (next === prevIdx) next = (next + 1) % n;
  return next;
}

function scheduleChord(idx, startAt) {
  if (!ambientEnabled) return;
  const durS = 18 + Math.random() * 14;          // 18-32s per chord
  const fadeS = Math.min(6, durS * 0.16);        // longer crossfade for long chords
  spawnChord(AMBIENT_CHORDS[idx % AMBIENT_CHORDS.length], startAt, durS, fadeS);
  const next = ctx.currentTime + (durS - fadeS);
  const timer = setTimeout(
    () => {
      if (!ambientEnabled || muted) return; // chain pauses while muted
      scheduleChord(pickNextChord(idx), Math.max(ctx.currentTime + 0.3, next));
    },
    (durS - fadeS) * 1000
  );
  ambientTimers.push(timer);
}

// Sparse high sparkle bells, self-rescheduling. Each one picks a note from
// the two-octave pool, a random waveform (triangle is bell-like, sine is
// glassy), a random volume/decay, and occasionally doubles an interval above
// (octave or fifth) or a lower echo for depth.
function scheduleSparkle() {
  if (!ambientEnabled) return;
  const delay = 2000 + Math.random() * 6000;
  const timer = setTimeout(
    () => {
      if (!ambientEnabled || muted) return;
      const t = ctx.currentTime;
      const base = SPARKLE_NOTES[Math.floor(Math.random() * SPARKLE_NOTES.length)];
      // Mostly a single bell; sometimes an interval, sometimes a soft echo.
      const roll = Math.random();
      const semi = roll < 0.22 ? 12 : roll < 0.4 ? 7 : 0; // octave / fifth / single
      const wave = Math.random() < 0.7 ? 'triangle' : 'sine';
      const vel = 0.05 + Math.random() * 0.07;
      const decay = 3 + Math.random() * 3;
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) pan.pan.value = Math.random() * 1.2 - 0.6;
      const play = (f, at, v) => {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(v, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        osc.connect(g);
        if (pan) g.connect(pan).connect(ambientGain);
        else g.connect(ambientGain);
        osc.start(at);
        osc.stop(at + decay + 0.3);
        ambientVoices.add({ osc, g, stop: at + decay + 0.5 });
      };
      play(base, t, vel);
      if (semi) play(base * Math.pow(2, semi / 12), t + 0.03, vel * 0.7);
      // A soft octave-down echo half a second later, one time in three.
      if (Math.random() < 0.33) {
        play(base / 2, t + 0.5, vel * 0.35);
      }
      scheduleSparkle();
    },
    delay
  );
  ambientTimers.push(timer);
}

function startBreathing() {
  if (!ctx || lfo) return;
  lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05 + Math.random() * 0.04; // 12-20s breath
  const lg = ctx.createGain();
  lg.gain.value = 0.12 + Math.random() * 0.08;       // depth varies
  lfo.connect(lg).connect(ambientGain.gain);
  lfo.start();
  // Let the breath wander: nudge the LFO rate and depth every ~25s so the
  // swell never locks into one rigid cycle.
  const wander = setInterval(() => {
    if (!ambientEnabled || muted || !lfo) return;
    const t = ctx.currentTime;
    lfo.frequency.setTargetAtTime(0.05 + Math.random() * 0.04, t, 6);
    lg.gain.setTargetAtTime(0.12 + Math.random() * 0.08, t, 6);
  }, 25000);
  ambientTimers.push(wander);
}

function stopBreathing() {
  if (lfo) {
    try {
      lfo.stop();
      lfo.disconnect();
    } catch { /* already stopped */ }
    lfo = null;
  }
}

function clearSchedules() {
  for (const t of ambientTimers) clearTimeout(t);
  ambientTimers = [];
  chordArmed = false;
  sparkArmed = false;
}

// Fade out every live ambient voice quickly.
function hushAmbient(sec = 0.4) {
  if (!ctx || !ambientGain) return;
  const t = ctx.currentTime;
  ambientGain.gain.cancelScheduledValues(t);
  ambientGain.gain.setTargetAtTime(0.0, t, Math.max(0.02, sec / 3));
  for (const v of ambientVoices) {
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setTargetAtTime(0.0001, t, Math.max(0.02, sec / 3));
      v.osc.stop(t + 0.5); // physically end the oscillator instead of letting it ring
    } catch { /* gone */ }
  }
  ambientVoices.clear();
}

function getApi() {
  return {
    chime(freq) {
      if (!ctx || muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.65);
    },
    bloomChord() {
      if (!ctx || muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const base = 261.63; // C4
      [0, 4, 7, 12].forEach((semi, i) => {
        const t = ctx.currentTime + i * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = base * Math.pow(2, semi / 12);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + 1.7);
      });
    },
    // Start the pad. Call after a user gesture (autoplay policy).
    startAmbient() {
      if (!ctx || ambientEnabled) return;
      ambientEnabled = true;
      if (muted) return; // it will fade in when unmuted
      this.resumeAmbient();
    },
    // Bring the pad up AFTER the context is definitely running. A suspended
    // context has a frozen currentTime until resume() resolves; scheduling
    // voices before that would misplace every timestamp.
    async resumeAmbient() {
      if (!ctx || !ambientEnabled || muted) return;
      try {
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
          await ctx.resume();
        }
      } catch {
        /* resume can reject; scheduling clamps to now anyway */
      }
      const t = ctx.currentTime;
      ambientGain.gain.cancelScheduledValues(t);
      ambientGain.gain.setTargetAtTime(0.55, t, 1.2);
      startBreathing();
      if (!ambientLive) {
        ambientLive = true;
        const startIdx = Math.floor(Math.random() * AMBIENT_CHORDS.length);
        spawnChord(AMBIENT_CHORDS[startIdx], t + 0.5);
      }
      if (!chordArmed) {
        chordArmed = true;
        scheduleChord(pickNextChord(Math.floor(Math.random() * AMBIENT_CHORDS.length)), t + 5 + Math.random() * 8);
      }
      if (!sparkArmed) {
        sparkArmed = true;
        scheduleSparkle();
      }
    },
    stopAmbient() {
      ambientEnabled = false;
      clearSchedules();
      stopBreathing();
      hushAmbient(0.5);
      ambientLive = false;
    },
    setMuted(m) {
      const was = muted;
      muted = m;
      if (m) {
        clearSchedules(); // pause the chains; they re-arm on unmute
        hushAmbient(0.3);
      } else if (was && ambientEnabled) {
        this.resumeAmbient();
      }
    },
    // A quick two-note birdsong chirp, panned somewhere across the meadow.
    bird() {
      if (!ctx || muted) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.type = 'sine';
      const base = 2400 + Math.random() * 1100;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.16);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain);
      if (pan) {
        pan.pan.value = Math.random() * 1.6 - 0.8;
        gain.connect(pan).connect(master);
      } else {
        gain.connect(master);
      }
      osc.start(t);
      osc.stop(t + 0.35);
    },
    // Soft grass-crunch footstep, one per stride. `stride` is the number of
    // half-cycles crossed this frame (1 = walk, 2 = jog) — louder when jogging.
    footstep(stride) {
      if (!ctx || muted || !stride) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.09), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      src.buffer = buf;
      const gain = ctx.createGain();
      // Organic jitter so every step sounds slightly different.
      gain.gain.value = (stride > 1 ? 0.5 : 0.34) * (0.85 + Math.random() * 0.3);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 700 + Math.random() * 400;
      src.connect(filt).connect(gain).connect(master);
      src.start(t);
    },
    // Wandering birdsong while walking: a chirp every 4-12 seconds.
    startBirds() {
      if (!ctx || birdsTimer) return;
      const chirp = () => {
        this.bird();
        birdsTimer = setTimeout(chirp, 4000 + Math.random() * 8000);
      };
      chirp();
    },
    stopBirds() {
      if (birdsTimer) {
        clearTimeout(birdsTimer);
        birdsTimer = null;
      }
    },
    get ambientRunning() {
      return ambientEnabled && ambientLive && !muted;
    },
    stats() {
      return {
        state: ctx ? ctx.state : 'none',
        voices: ambientVoices.size,
        ambientEnabled,
        ambientLive,
        muted,
        running: !!ctx && ambientEnabled && ambientLive && !muted,
        rmsDb: rmsDb(),
      };
    },
  };
}