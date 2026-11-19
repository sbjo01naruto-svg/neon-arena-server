const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.get('/', (req, res) => res.send('Game server is running'));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const W = {
  laser:  { dmg: 10, rate: 0.18, spd: 45, life: 1.6 },
  plasma: { dmg: 20, rate: 0.45, spd: 28, life: 1.6 },
  rail:   { dmg: 50, rate: 1.1,  spd: 80, life: 1.6 },
  arc:    { dmg: 9,  rate: 0.65, spd: 32, life: 0.55, pel: 3 }
};
const PIL = [[-12,-8],[12,-8],[-12,10],[12,10],[0,0],[-24,-22],[24,-22],[-24,24],[24,24]];
const MAX_HUMANS = 8;   // จำนวนผู้เล่นจริงสูงสุดในห้อง
const MIN_TOTAL = 4;    // ถ้าคนไม่ครบ จะเติมบอทให้ครบจำนวนนี้

let P = {}, B = [], bid = 0, botN = 0;
const nrm = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rnd() { const a = Math.random() * 6.28, r = 18 + Math.random() * 14; return [Math.cos(a) * r, Math.sin(a) * r]; }

function mkPlayer(id, info, bot) {
  const [x, z] = rnd();
  return {
    id, bot,
    name: String(info.name || 'Player').slice(0, 12),
    col: clamp(info.col | 0, 0, 5),
    helm: clamp(info.helm | 0, 0, 2),
    wk: W[info.wk] ? info.wk : 'laser',
    x, z, ang: 0, hp: 100, k: 0, cd: 0, rt: 0, dead: false, st: 0, sd: 1
  };
}

function roster() {
  io.to('battle').emit('roster', Object.values(P).map(p => ({
    id: p.id, name: p.name, col: p.col, helm: p.helm, wk: p.wk, bot: p.bot
  })));
}

function fill() {
  const humans = Object.values(P).filter(p => !p.bot).length;
  const bots = Object.values(P).filter(p => p.bot);
  const want = humans ? Math.max(0, MIN_TOTAL - humans) : 0;
  while (bots.length > want) delete P[bots.pop().id];
  while (bots.length < want) {
    const n = ++botN, ks = Object.keys(W);
    const b = mkPlayer('bot' + n, { name: 'BOT-' + n, col: Math.random() * 6 | 0, helm: Math.random() * 3 | 0, wk: ks[Math.random() * 4 | 0] }, true);
    P['bot' + n] = b; bots.push(b);
  }
  roster();
}

function drop(id) {
  if (!P[id]) return;
  delete P[id];
  const s = io.sockets.sockets.get(id);
  if (s) s.leave('battle');
  fill();
}

function fire(p, a) {
  if (p.dead || p.cd > 0.05 || B.length > 400) return;
  const w = W[p.wk]; p.cd = w.rate;
  const n = w.pel || 1;
  for (let i = 0; i < n; i++) {
    const an = a + (n > 1 ? (i - 1) * 0.14 : 0);
    B.push({
      id: ++bid, o: p.id, wk: p.wk, a: an,
      x: p.x + Math.sin(p.ang) + Math.cos(p.ang) * 0.6,
      z: p.z + Math.cos(p.ang) - Math.sin(p.ang) * 0.6,
      vx: Math.sin(an) * w.spd, vz: Math.cos(an) * w.spd,
      dmg: w.dmg, life: w.life
    });
  }
}

function hit(t, b) {
  t.hp -= b.dmg;
  if (t.hp <= 0) {
    t.hp = 0; t.dead = true; t.rt = 2.5;
    const k = P[b.o]; if (k) k.k++;
    io.to('battle').emit('kill', { vid: t.id, vn: t.name, kid: b.o, kn: k ? k.name : '' });
  }
}

function mv(p, dt, f, s, turn) {
  p.ang = nrm(p.ang + turn * dt);
  const v = 7 * dt;
  p.x += (Math.sin(p.ang) * f + Math.cos(p.ang) * s) * v;
  p.z += (Math.cos(p.ang) * f - Math.sin(p.ang) * s) * v;
  for (const c of PIL) {
    const dx = p.x - c[0], dz = p.z - c[1], d = Math.hypot(dx, dz), m = 2.0;
    if (d < m && d > 0) { p.x = c[0] + dx / d * m; p.z = c[1] + dz / d * m; }
  }
  p.x = clamp(p.x, -38, 38); p.z = clamp(p.z, -38, 38);
}

function ai(p, dt, ps) {
  let tg = null, bd = 1e9;
  for (const o of ps) {
    if (o === p || o.dead) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d < bd) { bd = d; tg = o; }
  }
  if (!tg) return;
  const diff = nrm(Math.atan2(tg.x - p.x, tg.z - p.z) - p.ang);
  p.st -= dt;
  if (p.st <= 0) { p.st = 1 + Math.random() * 2; p.sd = Math.random() < 0.5 ? 1 : -1; }
  mv(p, dt * 0.6, bd > 12 ? 1 : (bd < 6 ? -0.6 : 0), p.sd * 0.5, clamp(diff * 4, -2, 2));
  if (Math.abs(diff) < 0.2 && bd < 32) fire(p, p.ang + (Math.random() - 0.5) * 0.22);
}

io.on('connection', (s) => {
  s.on('join', (info) => {
    if (P[s.id]) return;
    if (Object.values(P).filter(p => !p.bot).length >= MAX_HUMANS) { s.emit('full'); return; }
    const p = mkPlayer(s.id, info || {}, false);
    P[s.id] = p; s.join('battle');
    s.emit('welcome', { id: s.id, x: p.x, z: p.z });
    fill();
  });
  s.on('input', (d) => {
    const p = P[s.id]; if (!p || p.dead || !d) return;
    const x = +d.x, z = +d.z, a = +d.a;
    if (!isFinite(x) || !isFinite(z) || !isFinite(a)) return;
    p.x = clamp(x, -38, 38); p.z = clamp(z, -38, 38); p.ang = a;
  });
  s.on('fire', (d) => {
    const p = P[s.id]; if (!p || !d) return;
    const a = +d.a; if (isFinite(a)) fire(p, a);
  });
  s.on('leave', () => drop(s.id));
  s.on('disconnect', () => drop(s.id));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const ps = Object.values(P);
  if (!ps.some(p => !p.bot)) { B = []; return; }   // ไม่มีผู้เล่นจริง = หยุดคำนวณ

  for (const p of ps) {
    p.cd -= dt;
    if (p.dead) {
      p.rt -= dt;
      if (p.rt <= 0) { p.dead = false; p.hp = 100; const r = rnd(); p.x = r[0]; p.z = r[1]; }
      continue;
    }
    if (p.bot) ai(p, dt, ps);
  }

  const N = 4;   // แบ่งขั้นย่อย กันกระสุนเร็วทะลุตัวผู้เล่น
  for (let s = 0; s < N; s++) {
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      b.x += b.vx * dt / N; b.z += b.vz * dt / N; b.life -= dt / N;
      let dead = b.life <= 0 || Math.abs(b.x) > 40 || Math.abs(b.z) > 40;
      if (!dead) for (const c of PIL) if (Math.hypot(b.x - c[0], b.z - c[1]) < 1.4) { dead = true; break; }
      if (!dead) for (const t of ps) {
        if (t.id === b.o || t.dead) continue;
        if (Math.hypot(b.x - t.x, b.z - t.z) < 0.8) { hit(t, b); dead = true; break; }
      }
      if (dead) B.splice(i, 1);
    }
  }

  io.to('battle').emit('state', {
    p: ps.map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ang.toFixed(2), p.hp, p.k, p.dead ? 1 : 0]),
    b: B.map(b => [b.id, +b.x.toFixed(2), +b.z.toFixed(2), b.wk, +b.a.toFixed(2)])
  });
}, 33);

server.listen(process.env.PORT || 3000, () => console.log('running'));
