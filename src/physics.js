import * as THREE from 'three';

/* ============================================================
   PHYSICS — top-down pinball solver (2D on a tilted plane).
   This is exactly how real pinball physics is simulated: the
   ball rolls on a plane tilted ~6.5°, so gravity enters as
   g_eff = g·sin(θ) (scaled to board size), elevated lanes add
   -g·∇h as slope acceleration, and flippers are rotating
   capsules whose contact-point velocity adds to the bounce.
   Coordinates: playfield-local meters. +x = right, +y = up-field.
   ============================================================ */

export const G_EFF = 2.35; // projected gravity on the slope (board is half-scale)
export const BALL_R = 0.0135;

export class Ball {
  constructor() {
    this.p = new THREE.Vector2(0, 0);
    this.v = new THREE.Vector2(0, 0);
    this.r = BALL_R;
    this.active = false;
    this.trail = []; // world-space positions for the glow trail
  }
  speed() { return this.v.length(); }
}

export class World {
  constructor() {
    this.walls = [];   // {a, b, e, mu, kind, group, oneWay}
    this.circles = []; // {c, r, e, boost, kind, group, flash}
    this.sensors = []; // {a, b, kind, group, lastSide}
    this.flippers = [];
    this.height = null; // (x, y) => elevation of an elevated lane above the wood (m)
  }

  wall(ax, ay, bx, by, opts = {}) {
    this.walls.push({
      a: new THREE.Vector2(ax, ay), b: new THREE.Vector2(bx, by),
      e: opts.e ?? 0.42, mu: opts.mu ?? 0.012,
      kind: opts.kind ?? 'wall', group: opts.group ?? null,
      oneWay: opts.oneWay ?? null, // unit normal: ball may only cross against it
    });
  }

  circle(x, y, r, opts = {}) {
    this.circles.push({
      c: new THREE.Vector2(x, y), r,
      e: opts.e ?? 0.6, boost: opts.boost ?? 0,
      kind: opts.kind ?? 'post', group: opts.group ?? null,
      flash: 0,
    });
  }

  sensor(ax, ay, bx, by, opts = {}) {
    this.sensors.push({
      a: new THREE.Vector2(ax, ay), b: new THREE.Vector2(bx, by),
      kind: opts.kind ?? 'sensor', group: opts.group ?? null, cd: 0,
    });
  }

  flipper(id, px, py, len, opts = {}) {
    const f = {
      id, len,
      pivot: new THREE.Vector2(px, py),
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
    return new THREE.Vector2(
      f.pivot.x + Math.cos(f.angle) * f.len * f.side,
      f.pivot.y + Math.sin(f.angle) * f.len
    );
  }

  step(dt, balls, events) {
    const SUB = 8;
    const h = dt / SUB;

    for (const sn of this.sensors) if (sn.cd > 0) sn.cd = Math.max(0, sn.cd - dt);

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
        this._solveCircles(ball, events);
        this._solveFlippers(ball, events);
        this._checkSensors(ball, prevP, events);

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
        const tx = -ny, ty = nx;
        let vt = ball.v.x * tx + ball.v.y * ty;
        vt *= (1 - w.mu);
        const newVn = Math.max(0, -vn * e) + boost;
        ball.v.x = tx * vt + nx * newVn;
        ball.v.y = ty * vt + ny * newVn;
        if (-vn > 0.55 || boost > 0) {
          events.push({ kind: 'wall', group: w.group, speed: -vn });
        }
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
      ball.p.x = px + nx * ball.r;
      ball.p.y = py + ny * ball.r;

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

  _capsuleHit(ball, seg) {
    const ax = seg.a.x, ay = seg.a.y, bx = seg.b.x, by = seg.b.y;
    const ex = bx - ax, ey = by - ay;
    const L2 = ex * ex + ey * ey;
    let t = ((ball.p.x - ax) * ex + (ball.p.y - ay) * ey) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * ex, cy = ay + t * ey;
    let nx = ball.p.x - cx, ny = ball.p.y - cy;
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

