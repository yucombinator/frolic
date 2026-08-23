import * as THREE from 'three';
import { initRender, resize } from './render.js?v=38';
import { advanceWalk } from './walk.js?v=2';
import { generateFlowers } from './world.js?v=1';
import { HILLS } from './hill.js?v=1';
import { initAudio } from './audio.js?v=3';

const canvasWrap = document.getElementById('game');
const canvas = document.createElement('canvas');
canvasWrap.appendChild(canvas);

let render;
try {
  render = initRender(canvas);
} catch (e) {
  // No WebGL? Keep every UI listener alive; only the 3D view is lost.
  window.__bootError = String((e && e.stack) || e);
  render = null;
}
if (!render) {
  // Show the fallback message instead of a silent blank world.
  document.getElementById('webgl-fallback')?.classList.add('visible');
  document.getElementById('title')?.classList.add('hidden');
}
window.addEventListener('resize', () => { if (render) resize(render); });
window.__petal = { get render() { return render; } };
window.addEventListener('error', (e) => {
  window.__lastError = (e.error && e.error.stack) || e.message;
});
window.addEventListener('unhandledrejection', (e) => {
  window.__lastError = 'REJECTION: ' + (e.reason && e.reason.stack) || String(e.reason);
});

// --- Input: two keys, nothing else required ----------------------------
const input = { left: false, right: false, jog: false };
function bindHold(el, key) {
  if (!el) return;
  const set = (v) => () => { input[key] = v; };
  el.addEventListener('pointerdown', set(true));
  el.addEventListener('pointerup', set(false));
  el.addEventListener('pointercancel', set(false));
  el.addEventListener('pointerleave', set(false));
}
// Steering buttons are opt-in from the start page (off by default).
function createSteerButtons() {
  if (document.getElementById('btnL')) return; // already created
  for (const [id, key, label] of [['btnL', 'left', '◀ LEFT'], ['btnR', 'right', 'RIGHT ▶']]) {
    const d = document.createElement('div');
    d.id = id;
    d.textContent = label;
    d.style.cssText =
      'position:fixed;bottom:24px;font-size:28px;font-weight:bold;color:#5a2a4a;' +
      'background:rgba(255,255,255,0.75);border:3px solid #5a2a4a;border-radius:20px;' +
      'padding:18px 30px;user-select:none;touch-action:none;cursor:pointer;z-index:10;' +
      (key === 'left' ? 'left:24px;' : 'right:24px;');
    document.body.appendChild(d);
    bindHold(d, key);
  }
}
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { input.jog = true; e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
  if (e.key === 'Escape' && started) togglePause();
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') input.jog = false;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
});

// Optional look-around: drag the meadow to look anywhere. Purely a view
// offset — it never steers the walker, so the two-key floor stays intact.
let lookYaw = 0;
let lookPitch = 0;
let lookDrag = null;
canvas.addEventListener('pointerdown', (e) => {
  lookDrag = { x: e.clientX, y: e.clientY };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer capture optional */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!lookDrag) return;
  lookYaw += (e.clientX - lookDrag.x) * 0.004;
  lookPitch += (e.clientY - lookDrag.y) * 0.003;
  lookPitch = Math.max(-0.9, Math.min(0.9, lookPitch)); // look up/down, not over
  lookDrag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { lookDrag = null; });
canvas.addEventListener('pointercancel', () => { lookDrag = null; });

// --- World: deterministic flower chunks streaming ahead of the walker ---
// Each 200m z-chunk is generated from a stable seed, so the meadow is
// seamless and re-walkable — no popping, no teleports.
const CHUNK = 200;
const FLOWER_HALF_WIDTH = 90;
const meadowSeed = 42;
const chunkOf = (z) => Math.floor(-z / CHUNK);
const chunks = new Map(); // chunkId -> flowers
function ensureChunk(c) {
  let f = chunks.get(c);
  if (!f) {
    f = generateFlowers({ seed: meadowSeed + c, zFrom: -CHUNK * (c + 1), zTo: -CHUNK * c, halfWidth: FLOWER_HALF_WIDTH });
    chunks.set(c, f);
  }
  return f;
}
let currentChunk = 0;
function refreshFlowers() {
  currentChunk = chunkOf(player.z);
  const wanted = [currentChunk - 1, currentChunk, currentChunk + 1, currentChunk + 2];
  for (const id of [...chunks.keys()]) if (!wanted.includes(id)) chunks.delete(id);
  const all = [];
  for (const id of wanted) all.push(...ensureChunk(id));
  render?.setFlowers(all);
}

// --- Audio + player state -----------------------------------------------
const audio = initAudio();
let player = { x: 0, z: 0, heading: 0, bobPhase: 0 };
let started = false;
let paused = false;
let soundOn = true;
const clock = new THREE.Clock();

let voiceOn = false; // voice announcements are off by default
function speak(text) {
  if (!voiceOn) return;
  try {
    speechSynthesis?.cancel();
    speechSynthesis?.speak(new SpeechSynthesisUtterance(text));
  } catch { /* TTS optional */ }
}

function togglePause() {
  if (!started) return;
  paused = !paused;
  document.getElementById('pause')?.classList.toggle('open', paused);
  if (paused) {
    audio?.stopBirds();
    speak('Paused');
  } else {
    audio?.startBirds();
    speak('Resumed');
  }
}

// Restore start-page preferences (both default OFF: voices + steering buttons).
try {
  const vEl = document.getElementById('optVoice');
  const bEl = document.getElementById('optButtons');
  if (vEl && localStorage.getItem('frolic.voice')) vEl.checked = localStorage.getItem('frolic.voice') === '1';
  if (bEl && localStorage.getItem('frolic.buttons')) bEl.checked = localStorage.getItem('frolic.buttons') === '1';
  voiceOn = vEl ? vEl.checked : false;
} catch { /* storage unavailable */ }

function startGame() {
  if (!render) {
    // No WebGL — the fallback screen is already showing; do not fake a game.
    document.getElementById('webgl-fallback')?.classList.add('visible');
    document.getElementById('title')?.classList.add('hidden');
    return;
  }
  // Apply start-page options (off by default) and remember them.
  voiceOn = document.getElementById('optVoice')?.checked ?? false;
  if (document.getElementById('optButtons')?.checked) createSteerButtons();
  try {
    localStorage.setItem('frolic.voice', voiceOn ? '1' : '0');
    localStorage.setItem('frolic.buttons', document.getElementById('optButtons')?.checked ? '1' : '0');
  } catch { /* storage unavailable */ }
  started = true;
  document.getElementById('title')?.classList.add('hidden');
  document.getElementById('btnPause')?.classList.remove('hidden');
  audio?.startAmbient();
  audio?.startBirds();
  refreshFlowers();
  speak('Welcome to Frolic. Hold left or right to turn, space to jog.');
}

// --- Main loop ------------------------------------------------------------
const tick = () => {
  requestAnimationFrame(tick);
  if (!started || paused || !render) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const terrain = HILLS.height(player.x, player.z);
  const s = advanceWalk(player, input, dt, terrain);
  player = { x: s.x, z: s.z, heading: s.heading, bobPhase: s.bobPhase };
  if (s.stride > 0) audio?.footstep(s.stride); // one crunch per step
  if (chunkOf(player.z) !== currentChunk) refreshFlowers();
  render.frame(dt, { x: s.x, y: s.y, z: s.z }, s.heading, input.jog ? 1 : 0, clock.elapsedTime, lookYaw, lookPitch);
};
tick();

// --- UI wiring -------------------------------------------------------------
document.getElementById('btnStart')?.addEventListener('click', startGame);
document.getElementById('btnPause')?.addEventListener('click', togglePause);
document.getElementById('btnResume')?.addEventListener('click', togglePause);
document.getElementById('btnSound')?.addEventListener('click', () => {
  soundOn = !soundOn;
  audio?.setMuted(!soundOn);
  speak(soundOn ? 'Sound on' : 'Sound off');
});
document.getElementById('btnQuit')?.addEventListener('click', () => { location.reload(); });
