const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.get('/', (req, res) => res.send('Science Hunt server v2 is running'));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// จุดวางกล่อง (ต้องตรงกับในหน้าเกม): ห้องละ 1 จุด x12 ห้อง + ทางเดิน 3 จุด
const SP = [];
[-25, -15, -5, 5, 15, 25].forEach(cx => SP.push([cx, 13], [cx, -13]));
SP.push([-20, 0], [0, 0], [20, 0]);

// คำถามวิทยาศาสตร์: [คำถาม, [ตัวเลือก], ลำดับคำตอบที่ถูก (เริ่มที่ 0)]
const QS = [
  ['น้ำบริสุทธิ์เดือดที่กี่องศาเซลเซียส (ระดับน้ำทะเล)?', ['50', '100', '150', '212'], 1],
  ['ก๊าซใดที่พืชใช้ในการสังเคราะห์แสง?', ['ออกซิเจน', 'ไนโตรเจน', 'คาร์บอนไดออกไซด์', 'ฮีเลียม'], 2],
  ['ดาวเคราะห์ใดอยู่ใกล้ดวงอาทิตย์ที่สุด?', ['ดาวศุกร์', 'ดาวพุธ', 'โลก', 'ดาวอังคาร'], 1],
  ['สัญลักษณ์ธาตุของทองคำคือข้อใด?', ['Ag', 'Au', 'Gd', 'Go'], 1],
  ['อวัยวะใดสูบฉีดเลือดไปทั่วร่างกาย?', ['ปอด', 'ตับ', 'หัวใจ', 'ไต'], 2],
  ['แสงเดินทางได้เร็วที่สุดในตัวกลางใด?', ['น้ำ', 'แก้ว', 'อากาศ', 'สุญญากาศ'], 3],
  ['สูตรเคมีของน้ำคือข้อใด?', ['CO2', 'H2O', 'O2', 'NaCl'], 1],
  ['หน่วยวัดแรงในระบบ SI คือข้อใด?', ['จูล', 'วัตต์', 'นิวตัน', 'แอมแปร์'], 2],
  ['กระดูกของผู้ใหญ่มีประมาณกี่ชิ้น?', ['106', '206', '306', '406'], 1],
  ['ดาวฤกษ์ที่อยู่ใกล้โลกที่สุดคือข้อใด?', ['ดาวเหนือ', 'ซิริอุส', 'ดวงอาทิตย์', 'ดาวอังคาร'], 2],
  ['สัตว์ชนิดใดเป็นสัตว์เลี้ยงลูกด้วยนม?', ['กบ', 'โลมา', 'ฉลาม', 'จระเข้'], 1],
  ['ก๊าซที่มีมากที่สุดในบรรยากาศโลกคือข้อใด?', ['ออกซิเจน', 'ไนโตรเจน', 'อาร์กอน', 'ไฮโดรเจน'], 1],
  ['สารที่เป็นกลางมีค่า pH เท่าใด?', ['0', '7', '10', '14'], 1],
  ['สิ่งใดที่เซลล์พืชมี แต่เซลล์สัตว์ไม่มี?', ['นิวเคลียส', 'ผนังเซลล์', 'ไมโทคอนเดรีย', 'เยื่อหุ้มเซลล์'], 1],
  ['ปรากฏการณ์ที่ดวงจันทร์บังดวงอาทิตย์เรียกว่าอะไร?', ['จันทรุปราคา', 'สุริยุปราคา', 'น้ำขึ้นน้ำลง', 'ฤดูกาล'], 1],
  ['เหล็กเป็นสนิมเพราะทำปฏิกิริยากับอะไร?', ['ไนโตรเจน', 'ออกซิเจนและน้ำ', 'ฮีเลียม', 'แสงแดดอย่างเดียว'], 1],
  ['พลังงานที่สะสมอยู่ในอาหารเรียกว่าอะไร?', ['พลังงานเคมี', 'พลังงานเสียง', 'พลังงานนิวเคลียร์', 'พลังงานแม่เหล็ก'], 0],
  ['ดาวเคราะห์ดวงใดมีวงแหวนเด่นชัดที่สุด?', ['ดาวพฤหัสบดี', 'ดาวเสาร์', 'ดาวพุธ', 'ดาวศุกร์'], 1],
  ['ความเร่งโน้มถ่วงของโลกประมาณกี่ m/s²?', ['1.6', '9.8', '24', '98'], 1],
  ['เลือดลำเลียงออกซิเจนด้วยส่วนประกอบใด?', ['เกล็ดเลือด', 'เม็ดเลือดขาว', 'เม็ดเลือดแดง', 'พลาสมาเท่านั้น'], 2]
];
const WK = ['laser', 'plasma', 'rail', 'arc'];
const ROUND = 180, MAXH = 10, NBOX = 8, PICK = 1.5;
const FXK = ['', 's', 'f', 'g', 'z'];   // 1 ช้า, 2 สลับปุ่ม, 3 หมอก, 4 แช่แข็ง

let P = {}, BX = [], RQ = [], T = ROUND, PH = 0, OV = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.random() * a.length | 0];
const mask = p => (p.fx.s > 0 ? 1 : 0) | (p.fx.f > 0 ? 2 : 0) | (p.fx.g > 0 ? 4 : 0) | (p.fx.z > 0 ? 8 : 0);

function addBox() {
  const used = new Set(BX.map(b => b.s));
  const f = SP.map((_, i) => i).filter(i => !used.has(i));
  if (f.length) BX.push({ s: pick(f), by: null });
}
function resetRound() {
  T = ROUND; PH = 0; BX = []; RQ = [];
  for (let i = 0; i < NBOX; i++) addBox();
  for (const p of Object.values(P)) { p.score = 0; p.item = 0; p.fx = { s: 0, f: 0, g: 0, z: 0 }; p.lock = 0; p.quiz = null; }
}
resetRound();

function roster() {
  io.to('battle').emit('roster', Object.values(P).map(p => ({ id: p.id, name: p.name, col: p.col, helm: p.helm, wk: p.wk })));
}
function drop(id) {
  const p = P[id]; if (!p) return;
  if (p.quiz) p.quiz.b.by = null;
  delete P[id];
  const s = io.sockets.sockets.get(id); if (s) s.leave('battle');
  roster();
}
function makeQuiz(p, b) {
  let k;
  do { k = pick(QS); } while (k === p.lastQ && QS.length > 1);
  p.lastQ = k;
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  p.quiz = { b, ans: order.indexOf(k[2]), t: 12 };
  io.to(p.id).emit('quiz', { q: k[0], c: order.map(i => k[1][i]), t: 12 });
}
function resolve(p, ok) {
  const qz = p.quiz; if (!qz) return;
  p.quiz = null;
  if (ok) {
    BX = BX.filter(b => b !== qz.b); RQ.push(5);
    p.score += 10; p.item = 1 + (Math.random() * 4 | 0);
    io.to(p.id).emit('result', { ok: 1, item: p.item, ans: qz.ans });
  } else {
    qz.b.by = null; p.lock = 3;
    io.to(p.id).emit('result', { ok: 0, ans: qz.ans });
  }
}

io.on('connection', (s) => {
  s.on('join', (info) => {
    if (P[s.id]) return;
    info = info || {};
    if (Object.keys(P).length >= MAXH) { s.emit('full'); return; }
    if (!Object.keys(P).length) resetRound();
    const p = {
      id: s.id, name: String(info.name || 'Player').slice(0, 12),
      col: clamp(info.col | 0, 0, 5), helm: clamp(info.helm | 0, 0, 2),
      wk: WK.includes(info.wk) ? info.wk : 'laser',
      x: pick([-27, -10, 10, 27]) + (Math.random() - 0.5) * 2, z: 0, ang: 0,
      score: 0, item: 0, fx: { s: 0, f: 0, g: 0, z: 0 }, lock: 0, quiz: null, lastQ: null
    };
    P[s.id] = p; s.join('battle');
    s.emit('welcome', { id: s.id, x: p.x, z: p.z });
    roster();
  });
  s.on('input', (d) => {
    const p = P[s.id]; if (!p || !d) return;
    const x = +d.x, z = +d.z, a = +d.a;
    if (!isFinite(x) || !isFinite(z) || !isFinite(a)) return;
    p.x = clamp(x, -29, 29); p.z = clamp(z, -17, 17); p.ang = a;
  });
  s.on('answer', (d) => {
    const p = P[s.id]; if (!p || !p.quiz || !d) return;
    const i = +d.i; if (i >= 0 && i < 4) resolve(p, i === p.quiz.ans);
  });
  s.on('use', () => {
    const p = P[s.id]; if (!p || PH || !p.item) return;
    let t = null, bd = 25;
    for (const o of Object.values(P)) {
      if (o === p) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) { bd = d; t = o; }
    }
    if (!t) { s.emit('used', { none: 1 }); return; }
    t.fx[FXK[p.item]] = p.item === 4 ? 3 : 6;
    io.to(t.id).emit('hit', { n: p.name, item: p.item });
    s.emit('used', { n: t.name, item: p.item });
    p.item = 0;
  });
  s.on('leave', () => drop(s.id));
  s.on('disconnect', () => drop(s.id));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min((now - last) / 1000, 0.2);
  last = now;
  const ps = Object.values(P);
  if (!ps.length) return;

  if (PH === 1) {
    OV -= dt;
    if (OV <= 0) resetRound();
  } else {
    T -= dt;
    if (T <= 0) {
      PH = 1; OV = 8;
      ps.forEach(p => { if (p.quiz) { p.quiz.b.by = null; p.quiz = null; } });
      io.to('battle').emit('over', { r: ps.slice().sort((a, b) => b.score - a.score).map(p => [p.name, p.score]) });
    }
  }
  if (PH === 0) {
    for (let i = RQ.length - 1; i >= 0; i--) { RQ[i] -= dt; if (RQ[i] <= 0) { RQ.splice(i, 1); addBox(); } }
    for (const p of ps) {
      for (const k in p.fx) p.fx[k] = Math.max(0, p.fx[k] - dt);
      p.lock = Math.max(0, p.lock - dt);
      if (p.quiz) { p.quiz.t -= dt; if (p.quiz.t <= 0) resolve(p, false); continue; }
      if (p.lock > 0) continue;
      for (const b of BX) {
        if (b.by) continue;
        const q = SP[b.s];
        if (Math.hypot(p.x - q[0], p.z - q[1]) < PICK) { b.by = p.id; makeQuiz(p, b); break; }
      }
    }
  }
  io.to('battle').emit('state', {
    t: Math.ceil(Math.max(0, T)), ph: PH,
    p: ps.map(p => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ang.toFixed(2), p.score, p.item, mask(p)]),
    b: BX.map(b => b.s)
  });
}, 50);

server.listen(process.env.PORT || 3000, () => console.log('running'));
