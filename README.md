# Frolic 🌾

A meditative, first-person walking simulator in a rolling grass meadow.
No goals, no fail states, no collectibles — the walk itself is the game.

An alternate version of [Petal Bloom](https://github.com/NARBEHOUSE/Narbehouse.github.io),
reusing its rendering core (infinite terrain, layered grass meadow, sky, clouds,
procedural flowers) but grounded: you stroll through the grass at eye height,
leave a trampled path behind you, and listen to the wind, birds, and your own
footsteps.

## Controls (two-key floor)

- **Continuous forward walk** — you're always strolling (~3 m/s)
- **LEFT / RIGHT** (arrows, A/D, or on-screen buttons) — turn
- **SPACE** (or W/Up) — jog (~5 m/s)
- **ESC** (or the Pause button) — pause / resume
- **Return hold** — pause (mapped in the pause dialog hint)
- Mouse/touch: optional, for clicking the on-screen controls

Everything is reachable with two keys. No scanning needed — movement is
continuous by design.

## Run it

```bash
cd ~/dev/frolic
python3 -m http.server 8010
# open http://127.0.0.1:8010/
```

No build step. Three.js is loaded from unpkg via an importmap.

## How it works

| Piece | What it does |
|-------|--------------|
| `src/main.js` | Walking loop: input, head-bob cadence, flower-chunk streaming, audio triggers |
| `src/walk.js` | Pure walking kinematics (unit-tested): steer, walk/jog speed, eye height, stride count |
| `src/world.js` | Deterministic flower scatter — 200 m z-chunks, stable per seed, seamless streaming |
| `src/render.js` | Scene: infinite terrain, grass meadow, sky, clouds, flower crowns + leafy stems, first-person camera, grass wake from the walker |
| `src/grass.js` | The layered grass field (near/mid/far tiers), wind, and the trampled-path wake |
| `src/audio.js` | Synthesized ambience: wind pad, wandering birdsong, stride-synced footsteps |

## Tests

```bash
node --test test/*.test.js
```

Covers walking kinematics (steering, speeds, terrain clamp, bob cadence) and
meadow generation (determinism, bounds, kinds) — pure modules only, no browser.

## Accessibility

Built to the NARBE House two-key ethos: hold Left/Right to turn, Space to jog,
hold Return/Esc to pause. TTS announces start and pause. If WebGL is
unavailable the game shows a text screen instead of failing silently.
