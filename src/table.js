import { World } from './physics.js';

/* ============================================================
   TABLE GEOMETRY — Black Hole (Taito 1981) style playfield,
   rebuilt from the reference diagram. Playfield-local meters.
   Board: x ∈ [-0.22, 0.22], y ∈ [0, 0.94]. Origin bottom-center.
   y = 0 is the drain edge, y = 0.94 the top of the outer arc.

   Layout (bottom → top):
   - dual outlanes w/ Return Lanes feeding the flippers
   - HUCKER (left) + REBOUND (right) kicker walls above the flippers
   - CENTER POST between the flippers
   - BLACK HOLE kickout cup (center) — ball is swallowed and spat out
     toward the left orbit
   - GRAVITY WELL cup + MAELSTROM bumper ring (upper center)
   - WORMHOLE teleport: right-middle mouth → upper-left exit
   - HYPERSPACE CHUTE teleport: right-middle mouth → left orbit
   - FUEL / MISSION / MEDAL / SPACE WARP target banks
   - launch lane (right) with plunger, ESCAPE CHUTE drain (left)
   ============================================================ */

export function buildWorld() {
  const w = new World();

  // ---------- outer boundary ----------
  w.wall(-0.20, 0.12, -0.20, 0.62, { e: 0.55, group: 'railL' }); // left orbit rail
  w.wall(0.20, 0.05, 0.20, 0.62, { e: 0.55, group: 'railR' });   // launch-lane outer rail
  // top arc (semicircle, center (0, 0.62), r = 0.20). Its two ends meet the
  // outer rails exactly at y = 0.62, and the launch-lane exit opens directly
  // into the arc's right mouth — no pocket where a slow ball could park.
  // A ball that re-enters the lane rolls back down to the plunger (the
  // game auto-refires it), like the original's open lane.
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
  // lane floor: the ball rests here against the plunger until fired
  w.wall(0.165, 0.0415, 0.20, 0.0415, { e: 0.3, mu: 0.05, group: 'lane' });
  // ---------- WORMHOLE (teleport pair, right-middle → upper-left) ----------
  // mouth at the right middle of the playfield; exit above the funnel on the
  // left. Entering the mouth teleports the ball to the exit (speed kept).
  w.portal('wormhole', 0.118, 0.44, -0.128, 0.60, 0.013, {
    group: 'wormhole', turn: Math.PI * 0.62,
  });

  // ---------- HYPERSPACE CHUTE (chute teleport, right-middle → left orbit) ----------
  // A fast ball entering here is shot across to the left orbit lane.
  w.portal('hyperspace', 0.148, 0.335, -0.183, 0.50, 0.012, {
    group: 'hyperspace', turn: Math.PI * 0.5,
  });

  // ---------- funnel V above the playfield centre ----------
  // Guides droppers from the top arc down toward the flippers; the apex is a
  // wide open V (no wedge pocket) and its arms stop clear of the side rails.
  w.wall(-0.155, 0.545, -0.055, 0.598, { e: 0.6, group: 'funnel' });
  w.wall(0.055, 0.598, 0.118, 0.564, { e: 0.6, group: 'funnel' });

  // ---------- BLACK HOLE kickout (center cup) ----------
  // The signature feature: the ball falls into the cup, is swallowed and
  // spat back out toward the left orbit at speed (like the original's
  // center "black hole" kickout).
  w.hole(0.0, 0.475, 0.021, {
    group: 'blackhole',
    exit: [-0.115, 0.44],
    exitV: [-0.55, -0.62], // shot down-left along the left orbit
  });

  // ---------- GRAVITY WELL (redeploy cup, upper center) ----------
  // In the original the Gravity Well swallows the ball and re-deploys it at a
  // random spot; here it re-deploys just above the right flipper.
  w.hole(0.0, 0.615, 0.014, {
    group: 'gravitywell',
    exit: [0.06, 0.175],
    exitV: [-0.35, -0.55],
  });

  // ---------- MAELSTROM bumper ring ----------
  // Five ring bumpers around the Black Hole cup — the ball ricochets inside
  // the ring before finding the cup or escaping down-field.
  w.circle(0.0, 0.52, 0.013, { kind: 'bumper', group: 'maelstrom', e: 1.18, boost: 1.55 });
  w.circle(-0.052, 0.475, 0.013, { kind: 'bumper', group: 'maelstrom', e: 1.18, boost: 1.55 });
  w.circle(0.052, 0.475, 0.013, { kind: 'bumper', group: 'maelstrom', e: 1.18, boost: 1.55 });
  w.circle(-0.038, 0.545, 0.013, { kind: 'bumper', group: 'maelstrom', e: 1.18, boost: 1.55 });
  w.circle(0.038, 0.545, 0.013, { kind: 'bumper', group: 'maelstrom', e: 1.18, boost: 1.55 });

  // ---------- target banks ----------
  // FUEL TARGETS (upper right, in front of the funnel's right arm)
  w.target('fuel1', 0.098, 0.585, 0.024, Math.PI * 0.5, { group: 'fuel' });
  w.target('fuel2', 0.124, 0.585, 0.024, Math.PI * 0.5, { group: 'fuel' });
  // MISSION TARGETS (upper left, behind the funnel's left arm)
  w.target('mission1', -0.128, 0.565, 0.024, Math.PI * 0.5, { group: 'mission' });
  w.target('mission2', -0.154, 0.565, 0.024, Math.PI * 0.5, { group: 'mission' });
  // MEDAL TARGETS (left middle, behind the Wormhole exit)
  w.target('medal1', -0.148, 0.475, 0.024, Math.PI * 0.5, { group: 'medal' });
  w.target('medal2', -0.172, 0.475, 0.024, Math.PI * 0.5, { group: 'medal' });
  // SPACE WARP TARGETS (right middle, behind the Hyperspace mouth)
  w.target('warp1', 0.128, 0.44, 0.024, Math.PI * 0.5, { group: 'warp' });
  w.target('warp2', 0.152, 0.44, 0.024, Math.PI * 0.5, { group: 'warp' });

  // ---------- HUCKER / REBOUND kicker walls ----------
  // HUCKER (left): kicks balls that drop into the left middle back up-field.
  // REBOUND (right): mirror of the Hucker for the right side.
  w.wall(-0.150, 0.245, -0.115, 0.285, { kind: 'rebound', group: 'huckerL' });
  w.wall(0.150, 0.245, 0.115, 0.285, { kind: 'rebound', group: 'reboundR' });

  // ---------- slingshot-style kickers above the flippers ----------
  w.wall(-0.145, 0.31, -0.10, 0.36, { kind: 'sling', group: 'slingL' });
  w.wall(-0.145, 0.31, -0.10, 0.305, { kind: 'sling', group: 'slingL' });
  w.wall(0.145, 0.31, 0.10, 0.36, { kind: 'sling', group: 'slingR' });
  w.wall(0.145, 0.31, 0.10, 0.305, { kind: 'sling', group: 'slingR' });

  // ---------- ESCAPE CHUTE (left middle drain path) ----------
  // A pure-drain cup: balls crossing into it escape down the left rail and
  // drain (the original's "Escape Chute").
  w.hole(-0.183, 0.335, 0.012, { group: 'escape' });

  // ---------- guard posts / guides ----------
  // Full-length diagonal guides beside each flipper (as in the reference
  // build): hypotenuse faces the playfield, and the run reaches down to the
  // flipper pivot so no gap is left beside the flipper for a ball to slip
  // through — everything rolling down these lanes lands on the flipper.
  w.wall(0.165, 0.205, 0.075, 0.128, { group: 'post', e: 0.55 });   // right guide
  w.wall(-0.165, 0.205, -0.075, 0.128, { group: 'post', e: 0.55 }); // left guide

  // ---------- CENTER POST (between the flippers) ----------
  w.circle(0.0, 0.20, 0.008, { group: 'post', e: 0.55 });

  // ---------- flippers ----------
  // Tip-to-tip gap exceeds ball diameter + both capsule radii (no wedging).
  w.flipper('flipL', -0.075, 0.125, 0.055, { side: 1, rest: -0.52, held: 0.58 });
  w.flipper('flipR', 0.075, 0.125, 0.055, { side: -1, rest: -0.52, held: 0.58 });

  // ---------- return-lane (outlane) inner walls ----------
  // A ball dropping from the arc at x∈(0.165,0.20) falls back down the launch
  // lane to the plunger (classic); x∈(0.14,0.165) feeds the flipper.
  w.wall(0.165, 0.235, 0.165, 0.155, { e: 0.4, group: 'guideR' });
  w.wall(-0.165, 0.235, -0.165, 0.155, { e: 0.4, group: 'guideL' });

  // ---------- sensors (crossing a line = scoring event) ----------
  w.sensor(-0.20, 0.34, -0.165, 0.34, { kind: 'orbitL', group: 'orbit' });   // left orbit lane
  w.sensor(0.165, 0.60, 0.20, 0.60, { kind: 'loop', group: 'loop' });         // launch-lane exit
  w.sensor(0.148, 0.335, 0.165, 0.335, { kind: 'ramp', group: 'hyperspace' });// Hyperspace mouth
  w.sensor(-0.165, 0.12, -0.14, 0.12, { kind: 'inlaneL', group: 'inlane' });  // left Return Lane
  w.sensor(0.165, 0.12, 0.14, 0.12, { kind: 'inlaneR', group: 'inlane' });    // right Return Lane

  // ---------- height field for the elevated lanes ----------
  // Elevation (m) of the loop/ramp surface above the playfield, or 0.
  // The top arc is a banked tube: entry at the right rail, arc across the
  // top, descent into the left orbit lane. The right-middle chute run is a
  // short hump feeding the Hyperspace mouth. The gradient is continuous
  // (quadratic ramps at the band edges) so a slow ball is always rolled
  // along the tube, never trapped on a flat shelf.
  w.height = (x, y) => {
    const rt = rampParam(x, y);
    if (rt !== null) return 0.030 * Math.sin(Math.PI * Math.min(1, rt));
    const lt = loopParam(x, y);
    if (lt !== null) return 0.020 * Math.sin(Math.PI * Math.min(1, lt));
    return 0;
  };

  return w;
}

// ---- right-middle chute hump: parameter t ∈ [0,1] (or null when off-ramp) ----
function rampParam(x, y) {
  const ax = 0.1325, ay = 0.33, bx = 0.1236, by = 0.51; // centerline
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

// ---- top-arc loop centerline: parameter t ∈ [0,1] (or null when off-loop) ----
function loopParam(x, y) {
  // entry run: up the right rail between the lane walls (eased ramps at both
  // ends keep the slope continuous — no flat shelf where a ball could rest)
  if (x > 0.165 && x < 0.20 && y > 0.40 && y < 0.62) {
    return Math.min(1, (y - 0.40) / 0.22) * 0.4;
  }
  // elevated arc across the top, descending into the left orbit lane
  const dx = x - 0, dy = y - 0.62;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.20 && d > 0.16 && y > 0.62) {
    let t = 1 + (Math.atan2(dy, dx) / Math.PI) * 0.8; // 1 at +x, 0 at -x
    if (t < 0.02) t *= 0.5;        // eased entry from the launch lane
    else if (t > 0.98) t = 1.98 - t * 0.5; // eased descent into the orbit
    return t;
  }
  return null;
}
