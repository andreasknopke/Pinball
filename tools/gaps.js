import { buildWorld } from '../src/table.js';

const w = buildWorld();
const D = 0.027; // ball diameter

// collect "segments" (walls, flippers at rest, targets) with their clearance radius
const segs = [];
for (const wl of w.walls) segs.push({ id: `wall ${wl.group}`, ax: wl.a.x, ay: wl.a.y, bx: wl.b.x, by: wl.b.y, r: 0.002 });
for (const f of w.flippers) {
  const t = w.flipperTip(f);
  segs.push({ id: `flip ${f.id}`, ax: f.pivot.x, ay: f.pivot.y, bx: t.x, by: t.y, r: f.r });
}
for (const c of w.circles) segs.push({ id: `circ ${c.group} ${c.c.x.toFixed(3)},${c.c.y.toFixed(3)}`, ax: c.c.x, ay: c.c.y, bx: c.c.x, by: c.c.y, r: c.r });

// V-pocket check: for each pair of segments, if their endpoints face each other
// forming a narrow V (ball could wedge in the corner), report.
// Simplified: check endpoint-to-segment distances — a free endpoint E of seg A
// that lies within D+margin of seg B AND the other endpoints converge => wedge risk.
function segDistPx(px, py, s) {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const L2 = ex * ex + ey * ey;
  if (L2 < 1e-12) return Math.hypot(px - s.ax, py - s.ay);
  let t = ((px - s.ax) * ex + (py - s.ay) * ey) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.ax + t * ex), py - (s.ay + t * ey));
}
const pts = [];
for (const s of segs) { pts.push([s.ax, s.ay, s.id]); pts.push([s.bx, s.by, s.id]); }
// also sample points along each segment every 1.5 cm
for (const s of segs) {
  const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const n = Math.floor(L / 0.015);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([s.ax + t * (s.bx - s.ax), s.ay + t * (s.by - s.ay), s.id]);
  }
}
const seen = new Set();
for (const [px, py, owner] of pts) {
  for (const s of segs) {
    if (s.id === owner) continue;
    const key = owner < s.id ? owner + '|' + s.id : s.id + '|' + owner;
    if (seen.has(key)) continue;
    const d = segDistPx(px, py, s) - s.r;
    if (d > 0.0001 && d < D - 0.004) {
      // only report if the point is an ENDPOINT of its segment (true wedge corner)
      const isEnd = (Math.abs(px - segs.find(x => x.id === owner).ax) < 1e-9 && Math.abs(py - segs.find(x => x.id === owner).ay) < 1e-9)
        || (Math.abs(px - segs.find(x => x.id === owner).bx) < 1e-9 && Math.abs(py - segs.find(x => x.id === owner).by) < 1e-9);
      if (isEnd) { seen.add(key); console.log(`NARROW: ${owner} endpoint (${px.toFixed(3)},${py.toFixed(3)}) → ${s.id} gap=${d.toFixed(4)}`); }
    }
  }
}
console.log('gap check done');
