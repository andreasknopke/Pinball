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
  // lane floor/stop: the ball rests here against the plunger. Without it the
  // slope gravity pulls the resting ball straight down the lane and out the
  // drain (it "launches" itself in the wrong direction).
  w.wall(0.165, 0.0415, 0.20, 0.0415, { e: 0.3, mu: 0.05, group: 'lane' });
  // (no gate at the lane exit: the ball just carries on into the arc; if it
  // ever comes back it rolls down the lane to the plunger instead of wedging)

  // ---------- TOP ORBIT / LOOP (elevated tube) ----------
  // tube inner wall at r = 0.16 → balls are trapped in the band r ∈ (0.16, 0.20)
  const tubeSegs = 12;
  for (let i = 0; i < tubeSegs; i++) {
    const a0 = -Math.PI / 2 + (i / tubeSegs) * Math.PI;
    const a1 = -Math.PI / 2 + ((i + 1) / tubeSegs) * Math.PI;
    w.wall(
      0.16 * Math.sin(a0), 0.62 + 0.16 * Math.cos(a0),
      0.16 * Math.sin(a1), 0.62 + 0.16 * Math.cos(a1),
      { e: 0.5, group: 'loop' }
    );
  }
  // funnel V: guides arc droppers toward the bumper cluster. The right arm
  // stops clear of the launch-lane wall (x = 0.165): ending it too close forms
  // a wedge narrower than the ball and traps it.
  w.wall(-0.155, 0.545, -0.055, 0.598, { e: 0.6, group: 'funnel' });
  w.wall(0.055, 0.598, 0.130, 0.558, { e: 0.6, group: 'funnel' });
  // loop exit: peel a descending orbit ball off the left rail and feed it
  // down-right into the playfield (slingshot / flipper) instead of letting it
  // run the whole left lane straight into the outlane. Low restitution so the
  // ball slides off instead of bouncing back up into the loop.
  w.wall(-0.20, 0.38, -0.16, 0.30, { e: 0.02, mu: 0.05, group: 'loopexit' });

  // ---------- bumper cluster ----------
  w.circle(0.0, 0.52, 0.014, { kind: 'bumper', group: 'bumper', e: 1.18, boost: 1.55 });
  w.circle(-0.055, 0.465, 0.014, { kind: 'bumper', group: 'bumper', e: 1.18, boost: 1.55 });
  w.circle(0.055, 0.465, 0.014, { kind: 'bumper', group: 'bumper', e: 1.18, boost: 1.55 });

  // ---------- SIDE RAMP (elevated, right side) ----------
  // A single slanted inner rail; the launch-lane wall (x = 0.165) is the outer
  // side of the corridor. Removing the separate outer wall and the mouth guides
  // eliminates the narrow V-shaped pockets that trapped the ball against the
  // bumper cluster and the funnel.
  // entry mouth faces down-field at (0.13, 0.33); exit feeds the funnel.
  w.wall(0.100, 0.330, 0.0822, 0.5100, { e: 0.45, group: 'ramp' }); // inner wall

  // ---------- slingshots (kickers) ----------
  w.wall(-0.145, 0.27, -0.10, 0.33, { kind: 'sling', group: 'slingL' });
  w.wall(-0.145, 0.27, -0.10, 0.265, { kind: 'sling', group: 'slingL' });
  w.wall(0.145, 0.27, 0.10, 0.33, { kind: 'sling', group: 'slingR' });
  w.wall(0.145, 0.27, 0.10, 0.265, { kind: 'sling', group: 'slingR' });

  // ---------- guard posts ----------
  // Triangular wedge beside each flipper: the hypotenuse faces the playfield and
  // rolls the ball down onto the flipper. It is open toward the flipper (no
  // bottom edge) — a horizontal bottom edge would act as a shelf and trap the
  // ball, and a narrow round post let the ball slip past. The launch-lane wall
  // (x = ±0.165) closes the outer side.
  w.wall(0.165, 0.205, 0.075, 0.128, { group: 'post', e: 0.55 });  // right guide
  w.wall(-0.165, 0.205, -0.075, 0.128, { group: 'post', e: 0.55 }); // left guide
  w.circle(-0.152, 0.26, 0.008, { group: 'post', e: 0.55 }); // above left return lane
  w.circle(0.152, 0.26, 0.008, { group: 'post', e: 0.55 });  // above right return lane

  // ---------- flippers ----------
  // Slightly shorter than the visual capsule radius implies: the tip-to-tip
  // gap must exceed ball diameter + both capsule radii, otherwise the ball
  // wedges between the tips instead of draining.
  w.flipper('flipL', -0.075, 0.125, 0.055, { side: 1, rest: -0.52, held: 0.58 });
  w.flipper('flipR', 0.075, 0.125, 0.055, { side: -1, rest: -0.52, held: 0.58 });

  // ---------- return-lane (outlane) inner walls ----------
  // Right: a ball dropping from the arc at x∈(0.165,0.20) falls back down
  // the launch lane and drains (classic); x∈(0.14,0.165) feeds the flipper.
  w.wall(0.165, 0.24, 0.165, 0.155, { e: 0.4, group: 'guideR' });
  w.wall(-0.165, 0.24, -0.165, 0.155, { e: 0.4, group: 'guideL' });

  // ---------- sensors (crossing a line = scoring event) ----------
  w.sensor(-0.20, 0.34, -0.165, 0.34, { kind: 'orbitL', group: 'orbit' });  // left orbit lane
  w.sensor(0.165, 0.60, 0.20, 0.60, { kind: 'loop', group: 'loop' });        // loop entry (lane exit)
  w.sensor(0.100, 0.330, 0.165, 0.330, { kind: 'ramp', group: 'ramp' });    // side-ramp entry
  w.sensor(-0.165, 0.12, -0.14, 0.12, { kind: 'inlaneL', group: 'inlane' }); // left return lane
  w.sensor(0.165, 0.12, 0.14, 0.12, { kind: 'inlaneR', group: 'inlane' });   // right return lane

  // ---------- height field for the elevated lanes ----------
  // Elevation (m) of the ramp/loop surface above the playfield, or 0.
  // The loop is a banked tube: entry at the right rail, arc across the
  // top, descent into the left orbit lane. The ramp is a short right-side
  // hump that feeds the funnel.
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
  const ax = 0.1325, ay = 0.33, bx = 0.1236, by = 0.51; // ramp centerline
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
