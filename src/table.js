import { World } from './physics.js';
import * as THREE from 'three';

/* ============================================================
   TABLE GEOMETRY — playfield layout in playfield-local meters.
   Board: x ∈ [-0.22, 0.22], y ∈ [0, 0.94]. Origin bottom-center.
   y = 0 is the drain edge, y = 0.82 the top of the outer arc.
   ============================================================ */

export function buildWorld() {
  const w = new World();

  // ---------- outer boundary ----------
  w.wall(-0.20, 0.12, -0.20, 0.62, { e: 0.55, group: 'railL' }); // left orbit lane outer rail
  w.wall(0.20, 0.05, 0.20, 0.62, { e: 0.55, group: 'railR' });   // launch lane outer rail
  // top arc (semicircle, center (0, 0.62), r = 0.20)
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const a0 = -Math.PI / 2 + (i / segs) * Math.PI;
    const a1 = -Math.PI / 2 + ((i + 1) / segs) * Math.PI;
    w.wall(
      0.20 * Math.sin(a0), 0.62 + 0.20 * Math.cos(a0),
      0.20 * Math.sin(a1), 0.62 + 0.20 * Math.cos(a1),
      { e: 0.55, group: 'arc' }
    );
  }

  // ---------- launch lane (right) ----------
  w.wall(0.165, 0.05, 0.165, 0.62, { e: 0.5, group: 'lane' }); // lane inner wall
  // one-way gate at the lane exit: balls may leave into the arc, never re-enter
  w.wall(0.165, 0.62, 0.20, 0.62, { e: 0.35, group: 'gate', oneWay: { nx: 0, ny: -1 } });

  // ---------- TOP ORBIT / LOOP (elevated tube) ----------
  // tube inner wall at r = 0.16 → balls are trapped in the band r ∈ (0.16, 0.20)
  const tubeSegs = 12;
  for (let i = 0; i < tubeSegs; i++) {
    const a0 = (i / tubeSegs) * Math.PI;
    const a1 = ((i + 1) / tubeSegs) * Math.PI;
    w.wall(
      0.16 * Math.sin(a0), 0.62 + 0.16 * Math.cos(a0),
      0.16 * Math.sin(a1), 0.62 + 0.16 * Math.cos(a1),
      { e: 0.5, group: 'loop' }
    );
  }
  // funnel V: guides arc droppers toward the bumper cluster
  w.wall(-0.155, 0.545, -0.055, 0.598, { e: 0.6, group: 'funnel' });
  w.wall(0.055, 0.598, 0.155, 0.545, { e: 0.6, group: 'funnel' });

  // ---------- bumper cluster ----------
  w.circle(0.0, 0.52, 0.014, { kind: 'bumper', group: 'bumper', e: 1.18, boost: 1.55 });
  w.circle(-0.055, 0.465, 0.014, { kind: 'bumper', group: 'bumper', e: 1.18, boost: 1.55 });
  w.circle(0.055, 0.465, 0.014, { kind: 'bumper', group: 'bumper', e: 1.18, boost: 1.55 });

  // ---------- SIDE RAMP (elevated, right → top-center) ----------
  // entry mouth faces down-field at (0.135, 0.33); exit throws into the funnel
  w.wall(0.1515, 0.3371, 0.0465, 0.5821, { e: 0.45, group: 'ramp' }); // outer wall
  w.wall(0.1185, 0.3229, 0.0135, 0.5679, { e: 0.45, group: 'ramp' }); // inner wall

  // ---------- slingshots (kickers) ----------
  w.wall(-0.145, 0.27, -0.10, 0.33, { kind: 'sling', group: 'slingL' });
  w.wall(-0.145, 0.27, -0.10, 0.265, { kind: 'sling', group: 'slingL' });
  w.wall(0.145, 0.27, 0.10, 0.33, { kind: 'sling', group: 'slingR' });
  w.wall(0.145, 0.27, 0.10, 0.265, { kind: 'sling', group: 'slingR' });
  w.wall(0.145, 0.27, 0.1515, 0.3371, { e: 0.5, group: 'ramp' }); // mouth guide
  w.wall(0.1185, 0.3229, 0.10, 0.265, { e: 0.5, group: 'ramp' }); // inner mouth guide

  // ---------- guard posts ----------
  w.circle(-0.045, 0.145, 0.008, { group: 'post', e: 0.55 });
  w.circle(0.045, 0.145, 0.008, { group: 'post', e: 0.55 });
  w.circle(-0.152, 0.26, 0.008, { group: 'post', e: 0.55 }); // above left return lane
  w.circle(0.152, 0.26, 0.008, { group: 'post', e: 0.55 });  // above right return lane

  // ---------- flippers ----------
  w.flipper('flipL', -0.075, 0.125, 0.062, { side: 1, rest: -0.52, held: 0.58 });
  w.flipper('flipR', 0.075, 0.125, 0.062, { side: -1, rest: -0.52, held: 0.58 });

  // ---------- return-lane (outlane) inner walls ----------
  // Right: a ball dropping from the arc at x∈(0.165,0.20) falls back down
  // the launch lane and drains (classic); x∈(0.14,0.165) feeds the flipper.
  w.wall(0.165, 0.24, 0.165, 0.155, { e: 0.4, group: 'guideR' });
  w.wall(-0.165, 0.24, -0.165, 0.155, { e: 0.4, group: 'guideL' });

  // ---------- sensors (crossing a line = scoring event) ----------
  w.sensor(-0.20, 0.34, -0.165, 0.34, { kind: 'orbitL', group: 'orbit' });  // left orbit lane
  w.sensor(0.165, 0.60, 0.20, 0.60, { kind: 'loop', group: 'loop' });        // loop entry (lane exit)
  w.sensor(0.118, 0.33, 0.152, 0.345, { kind: 'ramp', group: 'ramp' });      // side-ramp entry
  w.sensor(-0.165, 0.12, -0.14, 0.12, { kind: 'inlaneL', group: 'inlane' }); // left return lane
  w.sensor(0.165, 0.12, 0.14, 0.12, { kind: 'inlaneR', group: 'inlane' });   // right return lane

  // ---------- height field for the elevated lanes ----------
  // Elevation (m) of the ramp/loop surface above the playfield, or 0.
  // The loop is a banked tube: entry at the right rail, arc across the
  // top, descent into the left orbit lane. The ramp is a hump over the
  // bumper cluster that throws the ball back into the funnel.
  w.height = (x, y) => {
    const rt = rampParam(x, y);
    if (rt !== null) return 0.030 * Math.sin(Math.PI * Math.min(1, rt));
    const lt = loopParam(x, y);
    if (lt !== null) return 0.020 * Math.sin(Math.PI * Math.min(1, lt));
    return 0;
  };

  return w;
}

// ---- side-ramp centerline parameter t ∈ [0,1] (or null when off-ramp) ----
function rampParam(x, y) {
  const ax = 0.135, ay = 0.33, bx = 0.03, by = 0.575; // ramp centerline
  const ex = bx - ax, ey = by - ay;
  const L2 = ex * ex + ey * ey;
  let t = ((x - ax) * ex + (y - ay) * ey) / L2;
  if (t > -0.02 && t < 1.02) {
    const px = x - (ax + t * ex), py = y - (ay + t * ey);
    if (px * px + py * py < 0.018 * 0.018) {
      return Math.max(0, Math.min(1, t));
    }
  }
  return null;
}

// ---- loop centerline parameter t ∈ [0,1] (or null when off-loop) ----
function loopParam(x, y) {
  // entry run: up the right rail between the lane walls
  if (x > 0.165 && x < 0.20 && y > 0.40 && y < 0.62) {
    return Math.min(1, (y - 0.40) / 0.22) * 0.4;
  }
  // elevated arc across the top, descending into the left orbit lane
  const dx = x - 0, dy = y - 0.62;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.20 && d > 0.16 && y > 0.62) {
    const a = Math.atan2(dy, dx); // 0 at +x, π at -x
    return 0.4 + Math.max(0, Math.min(1, (Math.PI / 2 - a) / Math.PI)) * 0.6;
  }
  return null;
}
