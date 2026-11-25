/* ============================================================================
   fx.js — Görsel efektler
   1) HeroFX   : Açılış ekranında 81 ilden oluşan canlı "takımyıldız" haritası
   2) BattleFX : Final savaşı (iki ordunun çarpışma animasyonu)
   ============================================================================ */

// ---------------------------------------------------------------------------
// 1) HERO — 81 il noktasından oluşan parıldayan Turkey haritası
// ---------------------------------------------------------------------------
const HeroFX = (() => {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return { setCities() {} };
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  let pts = [];            // {nx, ny, tw, col}
  let edges = [];
  let stars = [];
  let pings = [];
  let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
  let lastPing = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round(w * h / 9000) }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3,
      s: Math.random() * 2 + 0.5, ph: Math.random() * 6.28
    }));
  }
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', e => { tmx = e.clientX / innerWidth; tmy = e.clientY / innerHeight; });

  function setCities(list) {
    if (!list || !list.length) return;
    const lngs = list.map(c => c.lng), lats = list.map(c => c.lat);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const cosL = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const spanX = (maxLng - minLng) * cosL, spanY = maxLat - minLat;
    pts = list.map((c, i) => ({
      nx: ((c.lng - minLng) * cosL) / spanX,
      ny: 1 - (c.lat - minLat) / spanY,
      aspect: spanX / spanY,
      tw: Math.random() * 6.28,
      col: i % 5 === 0 ? '#2dd4bf' : '#f5b83d'
    }));
    edges = [];
    pts.forEach((p, i) => {
      const d = pts.map((q, j) => ({ j, d: (p.nx - q.nx) ** 2 + ((p.ny - q.ny) / p.aspect) ** 2 }))
        .filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 3);
      d.forEach(o => { if (o.j > i || !edges.some(e => e[0] === o.j && e[1] === i)) edges.push([i, o.j]); });
    });
  }

  function project(p) {
    // Haritayı ekrana sığdır: genişliğin %88'i ya da yüksekliğin %70'i
    const aspect = p.aspect;
    let mw = Math.min(w * 0.9, h * 0.62 * aspect);
    let mh = mw / aspect;
    const ox = (w - mw) / 2 + (mx - 0.5) * -16;
    const oy = h * 0.52 - mh / 2 + (my - 0.5) * -10;
    return [ox + p.nx * mw, oy + p.ny * mh];
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!canvas.offsetParent) return;           // ekran gizliyken çizme
    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;
    const s = t / 1000;
    ctx.clearRect(0, 0, w, h);

    // yıldızlar
    stars.forEach(st => {
      const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(s * st.s + st.ph));
      ctx.fillStyle = `rgba(200,215,255,${a})`;
      ctx.beginPath(); ctx.arc(st.x * w + (mx - 0.5) * -8 * st.r, st.y * h, st.r, 0, 6.283); ctx.fill();
    });

    if (!pts.length) return;
    const P = pts.map(project);

    // bağlantı çizgileri
    ctx.lineWidth = 1;
    edges.forEach(([a, b], k) => {
      const al = 0.07 + 0.07 * Math.sin(s * 1.2 + k);
      ctx.strokeStyle = `rgba(245,184,61,${al})`;
      ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); ctx.stroke();
    });

    // ping dalgaları
    if (s - lastPing > 0.9) {
      lastPing = s;
      pings.push({ i: Math.floor(Math.random() * pts.length), born: s });
      if (pings.length > 6) pings.shift();
    }
    pings.forEach(pg => {
      const age = s - pg.born; if (age > 2.4) return;
      const k = age / 2.4;
      ctx.strokeStyle = `rgba(45,212,191,${0.6 * (1 - k)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(P[pg.i][0], P[pg.i][1], 4 + k * 46, 0, 6.283); ctx.stroke();
    });

    // il noktaları
    pts.forEach((p, i) => {
      const tw = 0.55 + 0.45 * Math.sin(s * 2 + p.tw);
      const [x, y] = P[i];
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, p.col === '#2dd4bf' ? `rgba(45,212,191,${0.55 * tw})` : `rgba(245,184,61,${0.5 * tw})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.283); ctx.fill();
      ctx.fillStyle = p.col; ctx.globalAlpha = 0.55 + 0.45 * tw;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    });
  }

  resize();
  requestAnimationFrame(frame);
  return { setCities };
})();


// ---------------------------------------------------------------------------
// 2) BATTLE — Final savaşı animasyonu
// ---------------------------------------------------------------------------
const BattleFX = (() => {
  const canvas = document.getElementById('battleCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let raf = null, running = false;

  // Zaman çizelgesi (saniye)
  const T_MARCH = 2.4, T_FACE = 3.4, T_CLASH = 8.5, T_END = T_FACE + T_CLASH, T_FINISH = T_END + 2.4;

  let W, H, S, groundY, dpr, cw, ch;
  let o, armies, sparks, dust, confetti, clouds, shake, flash, t0, skipRequested, finished, lastClashSound;

  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    W = cw < 700 ? 640 : 1000;
    S = cw / W;
    H = ch / S;
    groundY = H * 0.70;
  }

  function makeArmy(idx, troops, name, color, dark, maxN) {
    const n = troops > 0 ? Math.max(4, Math.round(troops * maxN.k)) : 0;
    const rows = n > 28 ? 5 : n > 12 ? 4 : 3;
    const sprites = [];
    for (let i = 0; i < n; i++) {
      sprites.push({
        row: i % rows, col: Math.floor(i / rows), seed: Math.random() * 100,
        rank: 0, alive: true, deadAt: 0, flag: i % 11 === 5, fallDir: Math.random() < 0.5 ? 1 : -1
      });
    }
    // Ön saftakiler önce düşsün
    const keys = sprites.map((s, i) => ({ i, k: s.col + Math.random() * (n / rows) * 0.8 })).sort((a, b) => a.k - b.k);
    keys.forEach((o2, r) => { sprites[o2.i].rank = r; });
    return {
      idx, troops, name, color, dark, dir: idx === 0 ? 1 : -1, sprites, n, rows,
      cmdAlive: true, cmdDeadAt: 0, frac: 1
    };
  }

  function start(opts) {
    stop();
    o = opts;
    resize();
    const maxT = Math.max(o.p1.troops, o.p2.troops, 1);
    const maxN = { k: (cw < 700 ? 26 : 48) / maxT };
    armies = [
      makeArmy(0, o.p1.troops, o.p1.name, o.p1.color || '#e0414a', o.p1.dark || '#8f1c24', maxN),
      makeArmy(1, o.p2.troops, o.p2.name, o.p2.color || '#3a82f2', o.p2.dark || '#17448f', maxN)
    ];
    // Sonuç hesapla (kazananın kalan oranı)
    const a = o.p1.troops, b = o.p2.troops;
    armies[0].endFrac = a > b ? (a - b) / a : a === b ? (a > 0 ? 0.25 : 1) : 0;
    armies[1].endFrac = b > a ? (b - a) / b : a === b ? (b > 0 ? 0.25 : 1) : 0;
    o.winner = a > b ? 0 : b > a ? 1 : -1;

    sparks = []; dust = []; confetti = [];
    clouds = Array.from({ length: 6 }, () => ({ x: rnd(0, W), y: rnd(20, H * 0.32), s: rnd(0.4, 1.2), v: rnd(3, 9) }));
    shake = 0; flash = 0; skipRequested = false; finished = false; lastClashSound = 0;
    t0 = performance.now();
    running = true;
    window.addEventListener('resize', resize);
    loop(t0);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    window.removeEventListener('resize', resize);
  }

  function skip() { skipRequested = true; }

  // ---------- Çizim yardımcıları ----------
  function drawSky(s) {
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, '#120a2b'); g.addColorStop(0.45, '#4a2160'); g.addColorStop(0.8, '#d8586a'); g.addColorStop(1, '#f6a15a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, groundY + 2);

    // yıldızlar
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3) % W, y = (i * 53.7) % (groundY * 0.5);
      ctx.globalAlpha = 0.25 + 0.35 * Math.sin(s * 2 + i);
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // güneş
    const sx = W / 2, sy = groundY - 40;
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
    sg.addColorStop(0, 'rgba(255,230,150,0.95)'); sg.addColorStop(0.25, 'rgba(255,170,90,0.45)'); sg.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, groundY);
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(sx, sy, 46, 0, 6.283); ctx.fill();

    // bulutlar
    clouds.forEach(c => {
      c.x += c.v * 0.016; if (c.x > W + 120) c.x = -120;
      ctx.fillStyle = 'rgba(255,200,190,0.16)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(c.x + k * 34 * c.s, c.y + (k % 2) * 6, 52 * c.s, 14 * c.s, 0, 0, 6.283); ctx.fill(); }
    });

    // uzak dağlar (iki katman)
    const layer = (col, base, amp, f, off) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, groundY);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, groundY - base - amp * Math.abs(Math.sin(x * f + off)) - amp * 0.4 * Math.sin(x * f * 2.3));
      ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
    };
    layer('#6b2c5c', 40, 70, 0.006, 1);
    layer('#3b1a4b', 18, 52, 0.009, 4);

    // kale silüeti
    ctx.fillStyle = '#2a1239';
    const kx = W * 0.82, ky = groundY - 56;
    ctx.fillRect(kx, ky, 54, 56); ctx.fillRect(kx - 10, ky - 22, 16, 78); ctx.fillRect(kx + 48, ky - 30, 16, 86);
    for (let i = 0; i < 4; i++) ctx.fillRect(kx - 10 + i * 24, ky - 30 - (i % 2 ? 0 : 0), 8, 8);
    ctx.beginPath(); ctx.moveTo(kx - 12, ky - 22); ctx.lineTo(kx - 2, ky - 40); ctx.lineTo(kx + 8, ky - 22); ctx.fill();
    ctx.beginPath(); ctx.moveTo(kx + 46, ky - 30); ctx.lineTo(kx + 56, ky - 50); ctx.lineTo(kx + 66, ky - 30); ctx.fill();
  }

  function drawGround(s) {
    const g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0, '#5a5a2e'); g.addColorStop(0.15, '#3c4a2a'); g.addColorStop(1, '#141c14');
    ctx.fillStyle = g; ctx.fillRect(0, groundY, W, H - groundY);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const x = (i * 83.1) % W, y = groundY + 8 + ((i * 37.7) % (H - groundY - 8));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 6 - (i % 4)); ctx.stroke();
    }
  }

  function drawFlag(x, y, scale, color, dir, s, seed) {
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 58 * scale); ctx.stroke();
    const fw = 34 * scale, fh = 20 * scale;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, y - 58 * scale);
    for (let i = 0; i <= 8; i++) {
      const px = x + dir * (fw * i / 8), py = y - 58 * scale + Math.sin(s * 6 + i * 0.7 + seed) * 3 * scale * (i / 8);
      ctx.lineTo(px, py);
    }
    for (let i = 8; i >= 0; i--) {
      const px = x + dir * (fw * i / 8), py = y - 58 * scale + fh + Math.sin(s * 6 + i * 0.7 + seed) * 3 * scale * (i / 8);
      ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    // hilal & yıldız (küçük)
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.arc(x + dir * fw * 0.4, y - 58 * scale + fh / 2, 5 * scale, 0, 6.283); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x + dir * fw * 0.46, y - 58 * scale + fh / 2, 4.2 * scale, 0, 6.283); ctx.fill();
  }

  function drawSoldier(x, y, sc, army, sp, s, mode, isCmd, deadK) {
    // mode: 'march' | 'idle' | 'fight' | 'cheer' | 'dead'
    const d = army.dir, col = army.color, dk = army.dark;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    let alpha = 1;
    if (mode === 'dead') {
      const k = Math.min(1, deadK / 0.55);
      ctx.rotate(sp.fallDir * d * -1.45 * ease(k) * (isCmd ? 1 : 1));
      alpha = Math.max(0, 1 - Math.max(0, deadK - 1.6) / 2.2);
      if (alpha <= 0.02) { ctx.restore(); return; }
    }
    ctx.globalAlpha = alpha;
    const seed = sp.seed || 0;
    const walk = mode === 'march' ? Math.sin(s * 10 + seed) : 0;
    const bob = mode === 'march' ? Math.abs(Math.sin(s * 10 + seed)) * -2 : mode === 'cheer' ? Math.abs(Math.sin(s * 8 + seed)) * -5 : 0;

    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 1, 11, 3.2, 0, 0, 6.283); ctx.fill();

    ctx.translate(0, bob);
    // bacaklar
    ctx.strokeStyle = '#2a2220'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3, -11); ctx.lineTo(-3 + walk * 4, 0); ctx.moveTo(3, -11); ctx.lineTo(3 - walk * 4, 0); ctx.stroke();
    // gövde
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-7, -27, 14, 17, 4); ctx.fill();
    ctx.fillStyle = dk; ctx.fillRect(-7, -14, 14, 3);
    // kol + kılıç
    let swing;
    if (mode === 'fight') swing = Math.sin(s * 9 + seed * 1.7) * 0.9 - 0.4;
    else if (mode === 'cheer') swing = -2.6 + Math.sin(s * 8 + seed) * 0.2;
    else swing = -0.2 + walk * 0.15;
    ctx.save();
    ctx.translate(d * 6, -22);
    ctx.rotate(d * (swing - 0.9) + (d < 0 ? 0 : 0));
    ctx.strokeStyle = '#d9dee8'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -21 * (isCmd ? 1.15 : 1)); ctx.stroke();
    ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.stroke();
    ctx.restore();
    // kalkan
    ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(-d * 5, -19, 5.2, 7.5, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#f2d27a'; ctx.lineWidth = 1.4; ctx.stroke();
    // kafa + miğfer
    ctx.fillStyle = '#e8c39a'; ctx.beginPath(); ctx.arc(0, -32, 5.2, 0, 6.283); ctx.fill();
    ctx.fillStyle = isCmd ? '#f2c54d' : '#8d96a6';
    ctx.beginPath(); ctx.arc(0, -33, 5.8, Math.PI, 0); ctx.fill();
    if (isCmd) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-1, -39); ctx.lineTo(d * -9, -44 + Math.sin(s * 8) * 2); ctx.lineTo(d * -2, -36); ctx.fill(); }
    // pelerin (komutan)
    if (isCmd) {
      ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(-d * 6, -27);
      ctx.quadraticCurveTo(-d * (16 + Math.sin(s * 5) * 3), -14, -d * 12, -4); ctx.lineTo(-d * 5, -12); ctx.fill();
    }
    ctx.restore();
  }

  function spawnSpark(x, y) {
    for (let i = 0; i < 4; i++) sparks.push({ x, y, vx: rnd(-90, 90), vy: rnd(-120, -20), life: rnd(0.25, 0.6), age: 0 });
  }
  function spawnDust(x, y, big) {
    dust.push({ x, y, vx: rnd(-14, 14), vy: rnd(-26, -8), r: rnd(6, big ? 22 : 14), life: rnd(0.8, 1.6), age: 0 });
  }

  // ---------- Ana döngü ----------
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    let t = (now - t0) / 1000;
    if (skipRequested && t < T_END + 0.2) { t0 = now - (T_END + 0.2) * 1000; t = T_END + 0.2; }
    const s = t;
    const dt = 0.016;

    // savaş ilerlemesi
    const p = ease((t - T_FACE) / T_CLASH);
    armies.forEach(a => { a.frac = 1 - (1 - a.endFrac) * p; });

    // Kamera sarsıntısı
    shake *= 0.9; flash *= 0.88;

    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.3) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));

    drawSky(s);
    drawGround(s);

    // takım renk ışıkları
    [0, 1].forEach(i => {
      const gx = i === 0 ? 0 : W;
      const g = ctx.createRadialGradient(gx, groundY, 10, gx, groundY, W * 0.55);
      g.addColorStop(0, armies[i].color + '55'); g.addColorStop(1, armies[i].color + '00');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });

    // --- Askerleri topla ---
    const draw = [];
    const midX = W / 2;
    const spacing = 15, rowGap = (H - groundY) * 0.09 + 6;
    let aliveCount = [0, 0];

    armies.forEach(a => {
      const alive = a.n > 0 ? Math.max(a.frac > 0.001 ? 1 : 0, Math.round(a.frac * a.n)) : 0;
      const cols = Math.ceil(a.n / a.rows) || 1;
      const startFront = -40 - (cols * spacing);                 // ekran dışı
      const stageFront = midX - 190;
      const clashFront = midX - 18;
      const march = ease(t / T_MARCH);
      const charge = ease((t - T_FACE) / 1.4);
      let frontOffset = (startFront + (stageFront - startFront) * march);
      frontOffset += (clashFront - stageFront) * charge;
      // kazanan, düşman bitince biraz ilerler
      if (t > T_END && a.endFrac > 0 && a.endFrac < 1 + 1e-9 && o.winner === a.idx) frontOffset += 24 * ease((t - T_END) / 1.2);
      const mode = t < T_MARCH ? 'march' : t < T_FACE ? 'idle' : (t < T_END ? (charge < 0.95 ? 'march' : 'fight') : 'cheer');

      a.sprites.forEach(sp => {
        const isAliveNow = sp.rank < alive;
        if (sp.alive && !isAliveNow) {
          sp.alive = false; sp.deadAt = skipRequested ? s - 4 : s;
         
          sp._dx = null;
        }
        if (sp.alive) aliveCount[a.idx]++;
        const rowY = groundY + 18 + sp.row * rowGap + (sp.col % 2) * 3;
        let jitter = mode === 'fight' ? Math.sin(s * 7 + sp.seed) * 7 + (sp.col === 0 ? 4 : 0) : 0;
        let x = a.dir > 0 ? frontOffset - sp.col * spacing + jitter : (W - frontOffset) + sp.col * spacing - jitter;
        // Savaş sırasında saflar sıkışır
        if (mode === 'fight' || mode === 'cheer') x += a.dir * -sp.col * -0 ;
        const sc = 0.9 + sp.row * 0.07;
        if (sp.alive) {
          draw.push({ y: rowY, f: () => drawSoldier(x, rowY, sc, a, sp, s, mode, false)});
          // flama taşıyıcı
          if (sp.flag) draw.push({ y: rowY - 0.1, f: () => drawFlag(x - a.dir * 3, rowY, sc, a.color, a.dir, s, sp.seed) });
          // kılıç çarpışması kıvılcımı
          if (mode === 'fight' && sp.col === 0 && Math.random() < 0.035 && !skipRequested) {
            spawnSpark(midX + rnd(-14, 14), rowY - 22);
            shake = Math.min(5, shake + 1.1); flash = Math.min(0.35, flash + 0.08);
            if (o.onClash && s - lastClashSound > 0.08) { lastClashSound = s; o.onClash(); }
          }
        } else {
          const dk = s - sp.deadAt;
          if (dk < 4.5) draw.push({ y: rowY - 0.5, f: () => drawSoldier(x, rowY, sc, a, sp, s, 'dead', false, dk) });
        }
      });

      // Komutan
      const cmdAlive = a.frac > 0.0005 || (a.endFrac >= 0.0005);
      const cmdX = a.dir > 0 ? frontOffset + 22 : (W - frontOffset) - 22;
      const cmdRow = groundY + 18 + ((a.rows - 1) / 2) * rowGap;
      const cmdSp = { seed: a.idx * 3.3, fallDir: 1 };
      let cm = mode;
      const cmdDies = a.endFrac <= 0.0005 && t >= T_END;
      if (cmdDies) {
        if (!a.cmdDeadAt) a.cmdDeadAt = skipRequested ? s - 4 : s;
        draw.push({ y: cmdRow + 0.2, f: () => drawSoldier(cmdX, cmdRow, 1.6, a, cmdSp, s, 'dead', true, s - a.cmdDeadAt) });
      } else {
        draw.push({ y: cmdRow + 0.2, f: () => {
          drawSoldier(cmdX, cmdRow, 1.6, a, cmdSp, s, cm === 'fight' ? 'fight' : cm, true);
        }});
        draw.push({ y: cmdRow + 0.1, f: () => drawFlag(cmdX - a.dir * 8, cmdRow, 1.7, a.color, a.dir, s, a.idx) });
      }
    });

    draw.sort((u, v) => u.y - v.y).forEach(d => d.f());

    // toz
    if (t > T_FACE && t < T_END && Math.random() < 0.5) spawnDust(midX + rnd(-90, 90), groundY + rnd(20, 70), true);
    if (t < T_FACE && Math.random() < 0.25) {
      armies.forEach(a => { const f = a.dir > 0 ? -30 + (midX - 190 + 30) * ease(t / T_MARCH) : W + 30 - (W - midX + 190 + 30) * ease(t / T_MARCH); spawnDust(f, groundY + rnd(20, 70), false); });
    }
    dust = dust.filter(d => (d.age += dt) < d.life);
    dust.forEach(d => {
      d.x += d.vx * dt; d.y += d.vy * dt;
      const k = d.age / d.life;
      ctx.fillStyle = `rgba(180,150,110,${0.22 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (0.6 + k), 0, 6.283); ctx.fill();
    });

    // kıvılcımlar
    sparks = sparks.filter(sp => (sp.age += dt) < sp.life);
    sparks.forEach(sp => {
      sp.vy += 260 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      ctx.strokeStyle = `rgba(255,${200 + Math.random() * 55 | 0},120,${1 - sp.age / sp.life})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x - sp.vx * 0.04, sp.y - sp.vy * 0.04); ctx.stroke();
    });

    // çarpışma flaşı
    if (flash > 0.01) { ctx.fillStyle = `rgba(255,240,200,${flash})`; ctx.fillRect(0, 0, W, H); }

    // konfeti (kazanan)
    if (t > T_END && o.winner >= 0) {
      if (confetti.length < 160 && Math.random() < 0.8) {
        const col = armies[o.winner].color;
        confetti.push({ x: rnd(0, W), y: -10, vx: rnd(-20, 20), vy: rnd(40, 110), r: rnd(0, 6.28), vr: rnd(-6, 6), c: Math.random() < 0.6 ? col : (Math.random() < 0.5 ? '#f5b83d' : '#ffffff'), w: rnd(5, 9) });
      }
      confetti.forEach(c => { c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-c.w / 2, -2, c.w, 4); ctx.restore(); });
      confetti = confetti.filter(c => c.y < H + 20);
    }

    ctx.restore();

    // Vinyet
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);

    // Geri çağırımlar
    const phase = t < T_FACE ? 'intro' : t < T_END ? 'clash' : 'end';
    if (o.onUpdate) o.onUpdate({ t, phase, f1: armies[0].frac, f2: armies[1].frac, winner: o.winner });
    if (!finished && t >= T_FINISH) {
      finished = true;
      if (o.onFinish) o.onFinish(o.winner);
    }
  }

  return { start, stop, skip };
})();
