# Frolic — Design Spec

**Date:** 2026-08-23
**Status:** Approved in brainstorm (2026-08-23)

## Summary

Frolic is an alternate version of Petal Bloom (`~/dev/Narbehouse.github.io/flowerpetal`):
a meditative, first-person walking simulator in a rolling grass meadow. No goals,
no fail states, no collectibles — the walk itself is the game. It reuses the
flowerpetal rendering core (infinite terrain, grass meadow, sky, clouds, flowers)
and the NARBE House two-key accessibility ethos, but replaces the flying-petal
gameplay with a grounded stroll.

## Requirements

1. **Core experience:** meditative exploration. The player walks through grass
   indefinitely; nothing is collected, no score exists, no failure is possible.
   Flowers are scenery.
2. **Perspective:** first-person. The camera sits at walking eye height above the
   terrain and follows the player's heading. No floating petals or petal swarm.
3. **Controls:**
   - Continuous forward movement (always strolling, ~3 m/s).
   - Hold Left / Right to turn (steer).
   - Hold Space to jog (~5 m/s).
   - Hold Return (or Esc) to pause.
   - Optional mouse/touch drag to look around. Two keys remain the floor.
4. **Atmosphere:** bright day, reusing the original flowerpetal sun/sky/shadow
   setup. No day cycle.
5. **Soundscape:** wind ambience (reuse), procedural birdsong, and soft
   grass-crunch footsteps synced to the stride.
6. **Accessibility (NARBE House):** everything reachable with two keys; TTS
   announces start/pause; large pause button; WebGL-unavailable falls back to a
   text screen.

## Architecture

Frolic is built by copying flowerpetal and stripping the game mechanics:

- **Keep:** `grass.js` (meadow incl. Tier 1/2/3 domain fix), `hill.js`, `wind.js`,
  `rand.js`, the rendering core in `render.js` (sky, terrain, grass, clouds,
  flower crowns, leafy stems), and `audio.js` (extended with birds + footsteps).
- **Delete:** `growth.js`, `run.js`, `gallery.js`, `poem.js`, `meadow.js`,
  `notes.js`, `state.js`, `art.js`, `steer.js`, `trail.js`.
- **New:** `world.js` — owns `FLOWER_KINDS`, `PALETTE` (moved from `trail.js`)
  and deterministic scattered flower placement across the meadow.
- **Rewrite:** `index.html` (title "Frolic", pause dialog, hint line) and
  `main.js` (walking loop: heading integration, terrain clamp, head-bob, input).
- **Strip from `render.js`:** player petal swarm (petal group, `PETAL_GEO`,
  spawn/rebuild, glow), wind-streak mesh, collection pop rings, meadow-stop
  markers, mother-bloom mechanics, petal shaders/materials.

### Data flow

- `main.js` owns the player state (`x`, `z`, `heading`, `speed`, `bobPhase`) and
  the input (Left/Right steer, Space jog, hold-Return pause). Each frame it
  integrates heading from steer input, advances position along the heading at the
  current speed, clamps `y` to `HILLS.height(x, z) + EYE_HEIGHT`, advances the
  head-bob phase by distance traveled, and calls the renderer with a player
  position.
- `render.js` renders the scene and exposes a small API:
  `initRender(canvas)`, `resize(api)`, and per-frame
  `frame(dt, playerPos, heading, jogLevel, timeSec)`. It feeds the player
  position to the grass shader (`uPetalPos`/`uTrail` repurposed) so walking parts
  and tramples a persistent path through the meadow.
- `world.js` generates flower placements deterministically from a seed and hands
  them to the renderer as static scenery (instanced crowns + stems, gently
  swaying).
- `audio.js` exposes `initAudio()` returning `{ startAmbient, stopAmbient }`
  plus bird and footstep triggers; footsteps are driven by the bob phase.

### Error handling

- WebGL unavailable → `initRender` throws → `main.js` catches, sets
  `window.__bootError`, renders a text screen (existing flowerpetal pattern).
- Audio unavailable (no `AudioContext`) → ambient/birds/footsteps silently no-op
  (existing SafeAudio pattern).

## Testing

- **Unit tests** (Node, `node --test`):
  - Walking kinematics: heading integration from steer input; position advance
    at walk vs jog speed; terrain clamp keeps eye height above terrain; bob phase
    advances with distance.
  - World scatter: deterministic per seed; bounded density; no NaN; kinds from
    `FLOWER_KINDS`.
  - Kept from flowerpetal where still applicable: `wind`, `rand`.
- **Browser smoke:** boots clean, no console errors, walks 15 s (camera follows
  terrain), fps measured.

## Out of scope

- Collection/progression/ceremony/poem/gallery mechanics.
- Day/night cycle, weather.
- Networking, persistence, settings beyond sound toggle.
