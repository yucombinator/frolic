// Pure walking kinematics for Frolic. No DOM, no WebGL — unit-tested.
export const WALK_SPEED = 3.0;   // m/s, stroll
export const JOG_SPEED = 5.0;    // m/s, Space held
export const TURN_RATE = 1.7;    // rad/s at full steer
export const EYE_HEIGHT = 4.2;   // camera height above terrain (clears the ~3.8m grass tops)
export const BOB_RATE = 1.79;    // bobPhase radians per meter (~1.7 steps/s at walk, ~2.8 at jog)
export const BOB_AMT_WALK = 0.035; // head-bob amplitude (m), stroll
export const BOB_AMT_JOG = 0.055;  // head-bob amplitude (m), jog

// Advance one step. `state` is {x, z, heading, bobPhase}; `input` is
// {left, right, jog} booleans; `terrainHeight` is the ground height at the
// new (x, z). Forward is -z at heading 0; positive heading turns left.
export function advanceWalk(state, input, dt, terrainHeight) {
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const heading = state.heading + steer * TURN_RATE * dt;
  const speed = input.jog ? JOG_SPEED : WALK_SPEED;
  const x = state.x + -Math.sin(heading) * speed * dt;
  const z = state.z + -Math.cos(heading) * speed * dt;
  const bobPhase = state.bobPhase + speed * dt * BOB_RATE;
  const bob = Math.sin(bobPhase) * (input.jog ? BOB_AMT_JOG : BOB_AMT_WALK);
  const y = terrainHeight + EYE_HEIGHT + bob;
  // Footstep trigger: every half bob cycle is one stride.
  const stride = Math.floor(bobPhase / Math.PI) - Math.floor(state.bobPhase / Math.PI);
  return { x, z, heading, bobPhase, y, speed, stride };
}
