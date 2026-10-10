import { buildWorld } from '../src/table.js';
import { Ball } from '../src/physics.js';
import { Vector2 } from 'three';

// --- rule-level checks that don't need the DOM ---
const w = buildWorld();
const dt = 1 / 120;

// 1) bank completion → resetBank works
const bank = w.targets.filter((t) => t.group === 'fuel');
for (const t of bank) t.down = true;
w.resetBank('fuel');
console.log('resetBank fuel:', bank.every((t) => !t.down) ? 'OK' : 'FAIL');

// 2) Black Hole cup swallows and redeploys toward the left orbit
{
  const b = new Ball();
  b.active = true;
  b.p = new Vector2(0.0, 0.475);
  b.v = new Vector2(0.05, -0.05);
  const evs = [];
  for (let i = 0; i < 30; i++) w.step(dt, [b], evs);
  const holeEv = evs.find((e) => e.kind === 'hole' && e.group === 'blackhole');
  console.log('blackhole swallow:', holeEv && !holeEv.swallow ? 'OK (kickout)' : 'FAIL ' + JSON.stringify(evs.slice(0, 3)));
  console.log('  redeployed at', b.p.x.toFixed(3), b.p.y.toFixed(3), 'speed', b.v.length().toFixed(2));
}

// 3) Escape Chute = pure drain (ball lost)
{
  const w2 = buildWorld();
  const b = new Ball();
  b.active = true;
  b.p = new Vector2(-0.183, 0.335);
  b.v = new Vector2(0, -0.2);
  const evs = [];
  for (let i = 0; i < 30; i++) w2.step(dt, [b], evs);
  const holeEv = evs.find((e) => e.kind === 'hole' && e.group === 'escape');
  console.log('escape chute swallow:', holeEv && holeEv.swallow && !b.active ? 'OK (ball lost)' : 'FAIL');
}

// 4) Wormhole teleport fires with speed kept
{
  const w3 = buildWorld();
  const b = new Ball();
  b.active = true;
  b.p = new Vector2(0.118, 0.44);
  b.v = new Vector2(0.2, 1.0);
  const evs = [];
  w3.step(dt, [b], evs);
  const p = evs.find((e) => e.kind === 'portal');
  console.log('wormhole teleport:', p && b.p.x < -0.1 ? 'OK' : 'FAIL', b.p.x.toFixed(3), b.p.y.toFixed(3));
}

// 5) long free-play: 1 ball at plunger, auto-fire at full power, flippers flapped randomly;
//    assert the ball eventually drains (no infinite loops / permanent stalls)
{
  const w4 = buildWorld();
  const b = new Ball();
  b.active = true;
  b.p = new Vector2(0.182, 0.05);
  b.v = new Vector2(0, 1.2);
  let drained = false;
  let t = 0;
  const evs = [];
  for (let i = 0; i < 120 * 60 && !drained; i++) {
    const flap = Math.random() < 0.01;
    for (const f of w4.flippers) f.active = flap;
    // like the player: re-fire the plunger whenever the ball rests in the lane
    if (b.active && b.p.x > 0.165 && b.p.y < 0.08 && b.v.length() < 0.05) b.v.set(0, 1.85); // full-power plunger
    evs.length = 0;
    w4.step(dt, [b], evs);
    t += dt;
    if (evs.some((e) => e.kind === 'drain')) drained = true;
    if (evs.some((e) => e.kind === 'hole' && e.swallow)) drained = true;
  }
  console.log('free-play drain within 60 s:', drained ? `OK (t=${t.toFixed(1)}s)` : 'FAIL — ball never drained');
}
