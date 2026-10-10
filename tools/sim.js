import { buildWorld } from '../src/table.js';
import { Ball } from '../src/physics.js';
import { Vector2 } from 'three';

const dt = 1 / 120;

function runBalls(starts, label, seconds = 60) {
  const w = buildWorld();
  const wedged = [];
  const events = {};
  const balls = [];
  for (const s of starts) {
    const b = new Ball();
    b.active = true;
    b.p = new Vector2(s.x, s.y);
    b.v = new Vector2(s.vx ?? (Math.random() - 0.5) * 0.6, s.vy ?? (Math.random() - 0.5) * 0.6);
    balls.push(b);
  }
  let t = 0;
  const track = new Map();
  for (let i = 0; i < seconds * 120; i++) {
    const evs = [];
    w.step(dt, balls, evs);
    t += dt;
    for (const e of evs) { const k = e.kind + (e.id ? ':' + e.id : ''); events[k] = (events[k] || 0) + 1; }
    for (const b of balls) {
      if (!b.active) continue;
      // plunger lane rest is by design (main.js auto-fires the plunger there)
      if (b.p.x > 0.165 && b.p.y < 0.08) continue;
      const sp = Math.hypot(b.v.x, b.v.y);
      let rec = track.get(b);
      if (!rec) { rec = { x: b.p.x, y: b.p.y, tStuck: 0 }; track.set(b, rec); }
      if (sp < 0.03) {
        if (Math.hypot(b.p.x - rec.x, b.p.y - rec.y) < 0.004) {
          rec.tStuck += dt;
          if (rec.tStuck > 1.2) {
          wedged.push(`WEDGE (${b.p.x.toFixed(3)},${b.p.y.toFixed(3)}) v=${sp.toFixed(3)} after ${t.toFixed(1)}s`);
            b.active = false;
          }
        } else { rec.x = b.p.x; rec.y = b.p.y; rec.tStuck = 0; }
      } else { rec.x = b.p.x; rec.y = b.p.y; rec.tStuck = 0; }
    }
  }
  console.log(`--- ${label} ---`);
  console.log('events:', JSON.stringify(events));
  if (wedged.length) console.log('WEDGED:\n' + wedged.join('\n'));
  else console.log('no wedges');
  return wedged.length;
}

// Test 1: drift test — drop balls everywhere with random gentle speeds
const w0 = buildWorld();
const pts = [];
// elevated lane points (loop tube / ramp hump) are excluded: a ball can only
// be there at launch speed, never at rest — same as the plunger lane.
for (let x = -0.19; x <= 0.19; x += 0.015) {
  for (const y of [0.62, 0.55, 0.45, 0.35, 0.25, 0.15]) {
    if (w0.height(x, y) > 0.004) continue;
    pts.push({ x, y });
  }
}
for (let i = 0; i < 20; i++) pts.push({ x: 0.182, y: 0.05, vx: (Math.random()-0.5)*0.2, vy: -1.2 });
let n = runBalls(pts, 'drift test');

// Test 2: fast shot test
const shots = [];
for (let i = 0; i < 40; i++) shots.push({ x: 0.182, y: 0.05, vx: (Math.random()-0.5)*0.3, vy: -1.5 });
for (let i = 0; i < 40; i++) shots.push({ x: (Math.random()-0.5)*0.36, y: 0.60, vx: (Math.random()-0.5)*0.8, vy: -0.8 });
n += runBalls(shots, 'shot test');
process.exit(n ? 1 : 0);
