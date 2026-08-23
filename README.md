# Frolic 🌾

A meditative, first-person walking simulator in a rolling grass meadow.
No goals, no fail states, no collectibles — the walk itself is the game.

You stroll through waist-high grass at eye height, flowers swaying around you,
butterflies fluttering between the blooms, birds crossing the sky overhead. On
the horizon, the Canadian Rockies — a procedurally generated low-poly range
with snowcapped massifs, valley gaps, and occasional lakes — sits in the
distance like the plains of Alberta. Leave a trampled path behind you and
listen to the wind, birds, and your own footsteps.

Built as a grounded reimagining of
[Petal Bloom](https://github.com/NARBEHOUSE/Narbehouse.github.io), reusing its
rendering core (infinite terrain, layered grass meadow, sky, clouds,
procedural flowers) with a first-person walker at eye height.

## Controls (two-key floor)

- **Continuous forward walk** — you're always strolling (~3 m/s)
- **LEFT / RIGHT** (arrows, A/D, or on-screen buttons) — turn
- **SPACE** (or W/Up) — jog (~5 m/s)
- **ESC** (or the Pause button) — pause / resume
- **Mouse / touch drag** — look around (optional; the view follows your walk)
- Return hold — pause (mapped in the pause dialog hint)

Everything is reachable with two keys. No scanning needed — movement is
continuous by design. Drag-look is a bonus for taking in the scenery.

## Run it

```bash
cd frolic
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
| `src/render.js` | Scene: infinite terrain, grass meadow, sky, clouds, flower crowns + leafy stems, first-person camera, grass wake, **the Rocky mountain range + lakes, drag-look, pollen motes, butterflies, birds** |
| `src/grass.js` | The layered grass field (near/mid/far tiers), wind, and the trampled-path wake (grass system by [Wintermelons](https://github.com/wintermelons), adapted) |
| `src/hill.js` | Deterministic rolling-hill terrain shared by renderer and logic |
| `src/audio.js` | Synthesized ambience: wind pad, wandering birdsong, stride-synced footsteps |

### The mountains

The horizon range is generated procedurally (`buildMountainRange` in
`render.js`): layered **ridgelines** whose crest heights come from ridged
multifractal noise, so peaks cluster into believable massifs with saddles and
valleys instead of a row of spikes. Three depth layers (snowy back wall, mid
ridges, pine foothills) are split into chains whose gaps are valleys opening
onto the ranges behind, and the range recedes into the plain at both ends
instead of ending in a cliff. Every facet is shaded by a procedural fragment
shader — rock grain, scree on steep faces, strata, noise-perturbed normals,
and a noise-displaced snowline — over indexed geometry with shared ridge
vertices so the sun shades continuously along the range.

Lakes (`buildLakes`) occasionally appear in the valleys ahead: randomized in
count, size, and position, depth-tested and placed where the camera's line of
sight clears the terrain, so they sit on the ground like real water.

## Tests

```bash
node --test test/*.test.js
```

Covers walking kinematics (steering, speeds, terrain clamp, bob cadence) and
meadow generation (determinism, bounds, kinds) — pure modules only, no browser.

## Credits

- **Grass system** — [Wintermelons](https://github.com/wintermelons) on GitHub.
  The layered grass field, wind, and trampled-path wake are adapted from their
  work (see `src/grass.js`).
- Built as a grounded reimagining of
  [Petal Bloom](https://github.com/NARBEHOUSE/Narbehouse.github.io), whose
  rendering core this project builds on.

## Accessibility

Built to the NARBE House two-key ethos: hold Left/Right to turn, Space to jog,
hold Return/Esc to pause. TTS announces start and pause. If WebGL is
unavailable the game shows a text screen instead of failing silently.
