import { Vector2 } from 'three';

/* ============================================================
   PHYSICS — top-down pinball solver (2D on a tilted plane),
   modelled on the Black Hole (Taito 1981) playfield.

   The board is a plane tilted ~6.5°, so gravity enters as
   g_eff = g·sin(θ); elevated lanes add -g·∇h as slope
   acceleration; flippers are rotating capsules whose
   contact-point velocity adds to the bounce.

   Coordinates: playfield-local meters. +x = right, +y = up-field.
   y = 0 is the drain edge, y = 0.94 the top of the outer arc.

   Primitive kinds:
   - wall      : segment collider (rails, rubbers, guides)
   - circle    : round post / bumper / hucker (boost = kick speed)
   - target    : standing drop-target (falls when hit hard enough,
                 bank resets when the whole bank is completed)
   - hole      : cup — the ball is swallowed and the game decides
                 where it is redeployed (Black Hole, Gravity Well)
   - portal    : wormhole/chute pair — entering the mouth teleports
                 the ball to the exit with its speed preserved
   - sensor    : invisible wire (rollover lanes, chute mouths)
   ============================================================ */

export const G_EFF = 2.35; // projected gravity on the slope (board is half-scale)
export const BALL_R = 0.0135;

export class Ball {
  constructor() {
    this.p = new Vector2(0, 0);
    this.v = new Vector2(0, 0);
    this.r = BALL_R;
    this.active = false;
    this.trail = []; // world-space positions for the glow trail
  }
  speed() { return this.v.length(); }
}

export class World {
  constructor() {
    this.walls = [];    // {a, b, e, mu, kind, group, oneWay}
    this.circles = [];  // {c, r, e, boost, kind, group, flash}
    this.targets = [];  // {id, a, b, down, group} — drop targets
    this.holes = [];    // {c, r, group}          — cups
    this.portals = [];  // {id, a, b, group}      — teleport pairs
    this.sensors = [];  // {a, b, kind, group, cd}
    this.flippers = [];
    this.height = null; // (x, y) => elevation of an elevated lane above the wood (m)
  }

  wall(ax, ay, bx, by, opts = {}) {
    this.walls.push({
      a: new Vector2(ax, ay), b: new Vector2(bx, by),
      e: opts.e ?? 0.42, mu: opts.mu ?? 0.012,
      kind: opts.kind ?? 'wall', group: opts.group ?? null,
      oneWay: opts.oneWay ?? null, // unit normal: ball may only cross against it
    });
  }

  circle(x, y, r, opts = {}) {
    this.circles.push({
      c: new Vector2(x, y), r,
      e: opts.e ?? 0.6, boost: opts.boost ?? 0,
      kind: opts.kind ?? 'post', group: opts.group ?? null,
      flash: 0,
    });
  }

  /** Drop target: a short standing segment; falls when struck at speed. */
  target(id, x, y, len, angle, opts = {}) {
    const cx = Math.cos(angle) * len / 2, cy = Math.sin(angle) * len / 2;
    this.targets.push({
      id, down: false,
      a: new Vector2(x - cx, y - cy), b: new Vector2(x + cx, y + cy),
      r: 0.0045, e: opts.e ?? 0.55, group: opts.group ?? 'target',
    });
  }

  /** Cup: swallows the ball and spits it out at `exit` with velocity `exitV`. */
  hole(x, y, r, opts = {}) {
    this.holes.push({
      c: new Vector2(x, y), r,
      group: opts.group ?? 'hole',
      exit: opts.exit ? new Vector2(opts.exit[0], opts.exit[1]) : null,
      exitV: opts.exitV ? new Vector2(opts.exitV[0], opts.exitV[1]) : null,
      cd: 0,
    });
  }

  /** Teleport pair: enter mouth `a` → leave through `b` (speed kept). */
  portal(id, ax, ay, bx, by, r = 0.014, opts = {}) {
    this.portals.push({
      id,
      a: new Vector2(ax, ay), b: new Vector2(bx, by),
      r, group: opts.group ?? id, cooldown: 0,
      turn: opts.turn ?? 0, // rad: heading rotation applied on exit
    });
  }

  sensor(ax, ay, bx, by, opts = {}) {
    this.sensors.push({
      a: new Vector2(ax, ay), b: new Vector2(bx, by),
      kind: opts.kind ?? 'sensor', group: opts.group ?? null, cd: 0,
    });
  }

  flipper(id, px, py, len, opts = {}) {
    const f = {
      id, len,
      pivot: new Vector2(px, py),
      rest: opts.rest ?? -0.52,        // rad, below horizontal
      held: opts.held ?? 0.58,         // rad, flicked up
      angle: opts.rest ?? -0.52,
      omega: 0,
      side: opts.side ?? 1,            // +1 = tip points right at rest
      r: 0.011,
      active: false,
    };
    this.flippers.push(f);
    return f;
  }

  flipperTip(f) {
    return new Vector2(
      f.pivot.x + Math.cos(f.angle) * f.len * f.side,
      f.pivot.y + Math.sin(f.angle) * f.len
    );
  }

  /** Reset a whole target bank (called by the rules when a bank completes). */
  resetBank(group) {
    for (const t of this.targets) if (t.group === group) t.down = false;
  }

  step(dt, balls, events) {
    const SUB = 8;
    const h = dt / SUB;

    for (const sn of this.sensors) if (sn.cd > 0) sn.cd = Math.max(0, sn.cd - dt);
    for (const p of this.portals) if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
    for (const hl of this.holes) if (hl.cd > 0) hl.cd = Math.max(0, hl.cd - dt);

    for (const ball of balls) {
      if (!ball.active) continue;
      for (let s = 0; s < SUB; s++) {
        // slope gravity: on elevated lanes gravity follows the local gradient
        if (this.height && this.height(ball.p.x, ball.p.y) > 0.004) {
          const eps = 0.006;
          const hx = (this.height(ball.p.x + eps, ball.p.y) - this.height(ball.p.x - eps, ball.p.y)) / (2 * eps);
          const hy = (this.height(ball.p.x, ball.p.y + eps) - this.height(ball.p.x, ball.p.y - eps)) / (2 * eps);
          ball.v.x -= 9.81 * hx * h;
          ball.v.y -= 9.81 * hy * h;
        } else {
          ball.v.y -= G_EFF * h;
        }
        ball.v.multiplyScalar(1 - 0.12 * h); // rolling friction
        if (ball.v.lengthSq() > 9) ball.v.setLength(3); // hard speed cap

        // flippers rotate between substeps
        for (const f of this.flippers) {
          const target = f.active ? f.held : f.rest;
          const rate = f.active ? 26 : 16;
          const maxD = rate * h;
          let d = target - f.angle;
          d = Math.max(-maxD, Math.min(maxD, d));
          f.angle += d;
          f.omega = d / h;
        }

        const prevP = ball.p.clone();
        ball.p.addScaledVector(ball.v, h);

        this._solveWalls(ball, events);
        this._solveTargets(ball, events);
        this._solveCircles(ball, events);
        this._solveFlippers(ball, events);
        this._checkHoles(ball, events);
        this._checkPortals(ball, events);
        this._checkSensors(ball, prevP, events);

        if (!ball.active) break; // swallowed by a hole / teleported away
        if (ball.p.y < -0.06) { ball.active = false; events.push({ kind: 'drain' }); break; }
      }
    }
  }

  _solveWalls(ball, events) {
    const r = ball.r;
    for (const w of this.walls) {
      const ax = w.a.x, ay = w.a.y, bx = w.b.x, by = w.b.y;
      const ex = bx - ax, ey = by - ay;
      const L2 = ex * ex + ey * ey;
      if (L2 < 1e-9) continue;
      let t = ((ball.p.x - ax) * ex + (ball.p.y - ay) * ey) / L2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * ex, cy = ay + t * ey;
      let nx = ball.p.x - cx, ny = ball.p.y - cy;
      const d2 = nx * nx + ny * ny;
      if (d2 > r * r || d2 < 1e-12) continue;

      const d = Math.sqrt(d2);
      nx /= d; ny /= d;

      // one-way gate: only blocks when approached from the inside
      if (w.oneWay && (nx * w.oneWay.nx + ny * w.oneWay.ny) > 0) continue;

      ball.p.x = cx + nx * r;
      ball.p.y = cy + ny * r;

      const vn = ball.v.x * nx + ball.v.y * ny;
      if (vn < 0) {
        let e = w.e;
        let boost = 0;
        if (w.kind === 'sling') { e = 0.95; boost = 2.15; }
        if (w.kind === 'rebound') { e = 0.92; boost = 1.7; }
        const tx = -ny, ty = nx;
        let vt = ball.v.x * tx + ball.v.y * ty;
        vt *= (1 - w.mu);
        const newVn = Math.max(0, -vn * e) + boost;
        ball.v.x = tx * vt + nx * newVn;
        ball.v.y = ty * vt + ny * newVn;
        if (-vn > 0.55 || boost > 0) {
          events.push({ kind: w.kind, group: w.group, speed: -vn });
        }
      }
    }
  }

  _solveTargets(ball, events) {
    const r = ball.r;
    for (const t of this.targets) {
      if (t.down) continue; // folded target: the ball rolls over it
      const ax = t.a.x, ay = t.a.y, bx = t.b.x, by = t.b.y;
      const ex = bx - ax, ey = by - ay;
      const L2 = ex * ex + ey * ey;
      if (L2 < 1e-9) continue;
      let u = ((ball.p.x - ax) * ex + (ball.p.y - ay) * ey) / L2;
      u = Math.max(0, Math.min(1, u));
      const cx = ax + u * ex, cy = ay + u * ey;
      let nx = ball.p.x - cx, ny = ball.p.y - cy;
      const R = t.r + r;
      const d2 = nx * nx + ny * ny;
      if (d2 > R * R || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      nx /= d; ny /= d;
      ball.p.x = cx + nx * R;
      ball.p.y = cy + ny * R;
      const vn = ball.v.x * nx + ball.v.y * ny;
      if (vn < 0) {
        // a hard hit knocks the target down (it stays down until the bank resets)
        if (-vn > 0.45) {
          t.down = true;
          events.push({ kind: 'target', group: t.group, id: t.id, speed: -vn });
        }
        const tx = -ny, ty = nx;
        let vt = ball.v.x * tx + ball.v.y * ty;
        vt *= 0.985;
        const newVn = -vn * (t.down ? 0.35 : t.e);
        ball.v.x = tx * vt + nx * newVn;
        ball.v.y = ty * vt + ny * newVn;
        if (!t.down && -vn <= 0.45) events.push({ kind: 'target', group: t.group, id: t.id, speed: -vn, soft: true });
      }
    }
  }

  _solveCircles(ball, events) {
    const r = ball.r;
    for (const c of this.circles) {
      let nx = ball.p.x - c.c.x, ny = ball.p.y - c.c.y;
      const R = c.r + r;
      const d2 = nx * nx + ny * ny;
      if (d2 > R * R || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      nx /= d; ny /= d;
      ball.p.x = c.c.x + nx * R;
      ball.p.y = c.c.y + ny * R;
      const vn = ball.v.x * nx + ball.v.y * ny;
      if (vn < 0) {
        const tx = -ny, ty = nx;
        let vt = ball.v.x * tx + ball.v.y * ty;
        vt *= 0.985;
        const newVn = Math.max(-vn * c.e, c.boost);
        ball.v.x = tx * vt + nx * newVn;
        ball.v.y = ty * vt + ny * newVn;
        c.flash = 1;
        events.push({ kind: c.kind, group: c.group, speed: -vn });
      }
    }
  }

  _solveFlippers(ball, events) {
    for (const f of this.flippers) {
      const tip = this.flipperTip(f);
      const seg = { a: f.pivot, b: tip, r: f.r };
      const hit = this._capsuleHit(ball, seg);
      if (!hit) continue;

      const { nx, ny, px, py } = hit;
      // Separate by the capsule's radius too (not just the ball's): otherwise
      // the ball stays embedded in the flipper and gravity accumulates every
      // substep, making it jitter in place at ever higher speed.
      ball.p.x = px + nx * (f.r + ball.r);
      ball.p.y = py + ny * (f.r + ball.r);

      // contact-point velocity of the rotating flipper: v = ω × r
      const rx = px - f.pivot.x, ry = py - f.pivot.y;
      const svx = -f.omega * ry;
      const svy = f.omega * rx;
      let rvx = ball.v.x - svx, rvy = ball.v.y - svy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = 0.52;
        const flick = Math.min(Math.abs(f.omega) * 0.16, 1.35); // flipper power
        const tx = -ny, ty = nx;
        let vt = rvx * tx + rvy * ty;
        vt *= 0.985;
        const newVn = -vn * e + flick;
        rvx = tx * vt + nx * newVn;
        rvy = ty * vt + ny * newVn;
        ball.v.x = rvx + svx;
        ball.v.y = rvy + svy;
        if (Math.abs(f.omega) > 4) events.push({ kind: 'flip', group: f.id, speed: -vn });
      }
    }
  }

  _checkHoles(ball, events) {
    for (const hl of this.holes) {
      if (hl.cd > 0) continue;
      const dx = ball.p.x - hl.c.x, dy = ball.p.y - hl.c.y;
      const R = hl.r * 0.72; // cup lip: the ball centre must reach the mouth
      if (dx * dx + dy * dy < R * R) {
        if (hl.exit && hl.exitV) { // kickout: redeployed at the exit point
          ball.p.copy(hl.exit);
          ball.v.copy(hl.exitV);
          hl.cd = 0.6; // let the ball clear the cup before it can re-enter
          events.push({ kind: 'hole', group: hl.group, id: hl.group, swallow: false });
        } else {
          ball.active = false; // pure drain cup: the ball is lost
          events.push({ kind: 'hole', group: hl.group, id: hl.group, swallow: true });
        }
      }
    }
  }

  _checkPortals(ball, events) {
    for (const p of this.portals) {
      if (p.cooldown > 0) continue;
      const dx = ball.p.x - p.a.x, dy = ball.p.y - p.a.y;
      const R = p.r * 0.9;
      if (dx * dx + dy * dy < R * R) {
        // keep the speed, rotate the heading by the mouth-to-exit turn
        const sp = Math.min(ball.v.length(), 2.2);
        const turn = p.turn ?? 0;
        const c = Math.cos(turn), s = Math.sin(turn);
        const vx = ball.v.x * c - ball.v.y * s;
        const vy = ball.v.x * s + ball.v.y * c;
        const L = Math.hypot(vx, vy) || 1;
        ball.p.set(p.b.x, p.b.y);
        ball.v.set((vx / L) * sp, (vy / L) * sp);
        p.cooldown = 0.5;
        events.push({ kind: 'portal', group: p.group, id: p.id, speed: sp });
      }
    }
  }

  _capsuleHit(ball, seg) {
    const ax = seg.a.x, ay = seg.a.y, bx = seg.b.x, by = seg.b.y;
    const ex = bx - ax, ey = by - ay;
    const L2 = ex * ex + ey * ey;
    let t = ((ball.p.x - ax) * ex + (ball.p.y - ay) * ey) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * ex, cy = ay + t * ey;
    let nx = ball.p.x - cx;
    let ny = ball.p.y - cy;
    const R = seg.r + ball.r;
    const d2 = nx * nx + ny * ny;
    if (d2 > R * R || d2 < 1e-12) return null;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    return { nx, ny, px: cx, py: cy };
  }

  _checkSensors(ball, prevP, events) {
    for (const sn of this.sensors) {
      // crossing test: the ball's path segment (prevP → p) must intersect
      // the sensor segment. Stateless → works for multi-ball and respawns.
      const x1 = prevP.x, y1 = prevP.y, x2 = ball.p.x, y2 = ball.p.y;
      const x3 = sn.a.x, y3 = sn.a.y, x4 = sn.b.x, y4 = sn.b.y;
      const d1 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
      const d2 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);
      if (d1 * d2 >= 0) continue; // same side (or on the line) → no crossing
      const d3 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
      const d4 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
      if (d3 * d4 >= 0) continue; // crossing lies outside the segment
      if (sn.cd > 0) continue;   // re-trigger cooldown (anti-spam)
      sn.cd = 0.4;
      events.push({ kind: sn.kind, group: sn.group });
    }
  }
}
