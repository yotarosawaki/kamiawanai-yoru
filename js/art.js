// 背景（canvasで手描き風に生成）と人物シルエット（SVG）
(function (root) {
  'use strict';
  const W = 1280, H = 720;

  // ---------- 汎用ヘルパ ----------
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function vgrad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }
  function rect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  function poly(ctx, pts, fill) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function glow(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', alpha)); g.addColorStop(1, color.replace('A', 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function vignette(ctx, strength) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function grain(ctx, seed, amount) {
    const r = rng(seed);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (r() * amount) + ')';
      ctx.fillRect(r() * W, r() * H, 1.5, 1.5);
    }
  }
  function tree(ctx, x, base, h, color, snow) {
    const w = h * 0.42;
    for (let i = 0; i < 4; i++) {
      const top = base - h + i * h * 0.2, bw = w * (0.45 + i * 0.2);
      poly(ctx, [x, top, x + bw / 2, top + h * 0.38, x - bw / 2, top + h * 0.38], color);
      if (snow) poly(ctx, [x, top, x + bw * 0.2, top + h * 0.13, x - bw * 0.18, top + h * 0.12], snow);
    }
    rect(ctx, x - h * 0.03, base - h * 0.12, h * 0.06, h * 0.12, color);
  }
  function forest(ctx, seed, base, n, hMin, hMax, color, snow) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) tree(ctx, r() * (W + 100) - 50, base + r() * 20, hMin + r() * (hMax - hMin), color, snow);
  }
  function snowGround(ctx, y, c1, c2) {
    ctx.fillStyle = vgrad(ctx, y, H, [c1, c2]);
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 80) ctx.lineTo(x, y + Math.sin(x * 0.01) * 10);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  }
  function windowPane(ctx, x, y, w, h, inside, frame) {
    rect(ctx, x - 8, y - 8, w + 16, h + 16, frame);
    ctx.fillStyle = inside; ctx.fillRect(x, y, w, h);
    rect(ctx, x + w / 2 - 3, y, 6, h, frame); rect(ctx, x, y + h / 2 - 3, w, 6, frame);
  }
  function nightWindow(ctx, x, y, w, h, seed) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = vgrad(ctx, y, y + h, ['#0b1430', '#23355e']); ctx.fillRect(x, y, w, h);
    const r = rng(seed);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + r() * 0.6) + ')'; ctx.beginPath(); ctx.arc(x + r() * w, y + r() * h, 1 + r() * 2.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(230,240,255,0.8)'; ctx.fillRect(x, y + h - 14, w, 14);
    ctx.restore();
  }
  function woodWall(ctx, y0, y1, c1, c2, seed) {
    ctx.fillStyle = vgrad(ctx, y0, y1, [c1, c2]); ctx.fillRect(0, y0, W, y1 - y0);
    const r = rng(seed);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 60 + r() * 20) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
  }
  function floor(ctx, y, c1, c2) {
    ctx.fillStyle = vgrad(ctx, y, H, [c1, c2]); ctx.fillRect(0, y, W, H - y);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    for (let i = -20; i < 40; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 12, y); ctx.lineTo(W / 2 + i * 90, H); ctx.stroke(); }
  }
  function beams(ctx, color) {
    rect(ctx, 0, 0, W, 38, color);
    for (let x = 100; x < W; x += 260) rect(ctx, x, 0, 26, 70, color);
  }
  function sofa(ctx, x, y, w, color) {
    rect(ctx, x, y, w, 70, color); rect(ctx, x - 20, y + 10, 30, 90, color); rect(ctx, x + w - 10, y + 10, 30, 90, color);
    rect(ctx, x, y + 50, w, 50, shade(color, -20));
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, v + amt)));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function fireplace(ctx, x, y) {
    rect(ctx, x - 130, y - 260, 260, 260, '#4a3a33');
    rect(ctx, x - 150, y - 280, 300, 30, '#3a2c26');
    rect(ctx, x - 80, y - 150, 160, 150, '#140c08');
    glow(ctx, x, y - 50, 320, 'rgba(255,140,40,A)', 0.55);
    ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.moveTo(x - 50, y - 10);
    ctx.quadraticCurveTo(x - 30, y - 100, x, y - 120); ctx.quadraticCurveTo(x + 25, y - 80, x + 50, y - 10); ctx.fill();
    ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.moveTo(x - 22, y - 10);
    ctx.quadraticCurveTo(x - 10, y - 60, x + 5, y - 75); ctx.quadraticCurveTo(x + 15, y - 40, x + 24, y - 10); ctx.fill();
    rect(ctx, x - 60, y - 16, 120, 12, '#2a1a10');
  }
  function plant(ctx, x, base, h, color, r) {
    ctx.strokeStyle = color; ctx.lineWidth = 6;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 1.6, len = h * (0.5 + r() * 0.5);
      ctx.beginPath(); ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.3, base - len * 0.6, x + Math.cos(a) * len, base + Math.sin(a) * len);
      ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * len, base + Math.sin(a) * len, 26, 10, a, 0, 7); ctx.fill();
    }
  }
  function flower(ctx, x, y, s, open) {
    if (!open) {
      ctx.fillStyle = '#e8d9c8'; ctx.beginPath(); ctx.ellipse(x, y, 10 * s, 24 * s, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#8a5a4a'; ctx.beginPath(); ctx.ellipse(x - 3 * s, y + 18 * s, 6 * s, 10 * s, 0.3, 0, 7); ctx.fill();
      return;
    }
    glow(ctx, x, y, 120 * s, 'rgba(255,255,240,A)', 0.55);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#fffdf5' : '#f4f0e6';
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 32 * s, y + Math.sin(a) * 32 * s, 38 * s, 11 * s, a, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#fff8d8'; ctx.beginPath(); ctx.arc(x, y, 16 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e8e0a0'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * 7; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 26 * s, y + Math.sin(a) * 26 * s); ctx.stroke(); }
  }
  function doorShape(ctx, x, y, w, h, c) {
    rect(ctx, x, y, w, h, c); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(x + 8, y + 8, w - 16, h / 2 - 12); ctx.strokeRect(x + 8, y + h / 2 + 4, w - 16, h / 2 - 12);
    ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(x + w - 16, y + h / 2, 5, 0, 7); ctx.fill();
  }

  // ---------- 背景 ----------
  const BG = {
    black(ctx) { rect(ctx, 0, 0, W, H, '#000'); },
    white(ctx) { rect(ctx, 0, 0, W, H, '#f4f6fa'); },

    bus(ctx) {
      rect(ctx, 0, 0, W, H, '#1c1f28');
      for (let i = 0; i < 3; i++) {
        const x = 60 + i * 420;
        ctx.fillStyle = vgrad(ctx, 90, 330, ['#6d7f99', '#b9c7d8']); ctx.fillRect(x, 90, 360, 240);
        const r = rng(10 + i);
        for (let k = 0; k < 6; k++) tree(ctx, x + r() * 360, 330, 80 + r() * 90, 'rgba(60,75,95,0.8)', 'rgba(230,236,245,0.8)');
        ctx.strokeStyle = '#11131a'; ctx.lineWidth = 16; ctx.strokeRect(x, 90, 360, 240);
      }
      rect(ctx, 0, 330, W, 40, '#2a2d38');
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 330;
        ctx.fillStyle = '#3c3548'; ctx.beginPath(); ctx.roundRect(x, 420, 260, 330, 30); ctx.fill();
        rect(ctx, x + 30, 440, 200, 60, '#4a4258');
      }
      vignette(ctx, 0.6);
    },

    snowroad(ctx) {
      ctx.fillStyle = vgrad(ctx, 0, H, ['#2c3a58', '#7d8fae', '#cdd7e6']); ctx.fillRect(0, 0, W, H);
      forest(ctx, 3, 420, 30, 120, 260, '#28344a', '#dfe6f0');
      snowGround(ctx, 430, '#dfe6f0', '#f5f8fc');
      poly(ctx, [600, 430, 680, 430, 1100, H, 180, H], '#c3cddb');
      ctx.strokeStyle = 'rgba(80,90,110,0.4)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(620, 430); ctx.lineTo(380, H); ctx.moveTo(660, 430); ctx.lineTo(900, H); ctx.stroke();
      vignette(ctx, 0.4);
    },

    pension(ctx) {
      ctx.fillStyle = vgrad(ctx, 0, 480, ['#0a1128', '#27365e', '#51608a']); ctx.fillRect(0, 0, W, H);
      forest(ctx, 7, 470, 26, 160, 320, '#121a30', '#b8c4dc');
      snowGround(ctx, 480, '#b9c6dd', '#e6ecf5');
      // 建物
      rect(ctx, 330, 250, 620, 250, '#4a3527');
      poly(ctx, [300, 262, 640, 70, 980, 262], '#2b1e17');
      poly(ctx, [300, 262, 640, 70, 980, 262, 950, 248, 640, 92, 330, 248], '#e8eef8');
      poly(ctx, [290, 268, 640, 62, 990, 268, 980, 262, 640, 70, 300, 262], '#f4f7fc');
      const warm = '#ffc46b';
      [[390, 300], [520, 300], [700, 300], [830, 300], [390, 400], [830, 400]].forEach(p => {
        glow(ctx, p[0] + 35, p[1] + 30, 110, 'rgba(255,190,100,A)', 0.35);
        windowPane(ctx, p[0], p[1], 70, 60, warm, '#2b1e17');
      });
      windowPane(ctx, 600, 140, 80, 60, warm, '#2b1e17');
      rect(ctx, 590, 390, 100, 110, '#2b1e17'); rect(ctx, 600, 400, 80, 100, '#6b4a33');
      glow(ctx, 640, 380, 60, 'rgba(255,200,120,A)', 0.6);
      rect(ctx, 320, 490, 640, 18, '#e8eef8');
      // 煙突と煙
      rect(ctx, 820, 110, 40, 100, '#3a2a22');
      ctx.fillStyle = 'rgba(200,210,230,0.15)';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(840 + i * 18, 90 - i * 28, 20 + i * 8, 0, 7); ctx.fill(); }
      // 温室（右奥）
      ctx.fillStyle = 'rgba(160,200,190,0.25)'; ctx.fillRect(1030, 380, 180, 110);
      ctx.strokeStyle = 'rgba(200,230,220,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(1030, 380, 180, 110);
      for (let x = 1060; x < 1210; x += 30) { ctx.beginPath(); ctx.moveTo(x, 380); ctx.lineTo(x, 490); ctx.stroke(); }
      vignette(ctx, 0.5);
    },

    snowfield(ctx) {
      ctx.fillStyle = vgrad(ctx, 0, 460, ['#1d2250', '#5a4a86', '#d98a7a']); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e6c2b0'; ctx.beginPath(); ctx.arc(980, 420, 60, 0, 7); ctx.fill();
      poly(ctx, [0, 440, 250, 250, 480, 400, 700, 220, 1000, 430, 1280, 300, 1280, 460, 0, 460], '#3a3868');
      forest(ctx, 11, 470, 20, 80, 160, '#262a52', '#c9c6e6');
      snowGround(ctx, 470, '#c9c3e0', '#f3eef8');
      // ペンションの明かり
      rect(ctx, 80, 380, 160, 90, '#2d2238'); poly(ctx, [70, 385, 160, 330, 250, 385], '#e8e6f4');
      glow(ctx, 160, 420, 80, 'rgba(255,190,110,A)', 0.5);
      rect(ctx, 110, 405, 30, 26, '#ffc46b'); rect(ctx, 180, 405, 30, 26, '#ffc46b');
      vignette(ctx, 0.35);
    },

    lounge(ctx) {
      beamsRoom(ctx, '#6b4a33', '#3e2a1e');
      nightWindow(ctx, 70, 150, 240, 260, 21); windowFrame(ctx, 70, 150, 240, 260);
      nightWindow(ctx, 970, 150, 240, 260, 22); windowFrame(ctx, 970, 150, 240, 260);
      fireplace(ctx, 640, 520);
      floor(ctx, 520, '#5a3c28', '#2e1d12');
      rect(ctx, 380, 560, 520, 18, '#7a2e2e');
      sofa(ctx, 90, 540, 260, '#6e2f2f'); sofa(ctx, 930, 540, 260, '#6e2f2f');
      vignette(ctx, 0.55);
    },

    dining(ctx) {
      beamsRoom(ctx, '#7a5a3e', '#45301f');
      nightWindow(ctx, 480, 140, 320, 240, 31); windowFrame(ctx, 480, 140, 320, 240);
      // ランプ
      [340, 640, 940].forEach(x => { rect(ctx, x - 2, 0, 4, 150, '#222'); poly(ctx, [x - 50, 190, x - 20, 150, x + 20, 150, x + 50, 190], '#3a2a1a'); glow(ctx, x, 200, 180, 'rgba(255,180,90,A)', 0.4); });
      floor(ctx, 500, '#5a3c28', '#2e1d12');
      // テーブル
      poly(ctx, [200, 520, 1080, 520, 1200, 640, 80, 640], '#8a5a36');
      rect(ctx, 80, 640, 1120, 26, '#5e3c22');
      glow(ctx, 640, 570, 90, 'rgba(255,200,80,A)', 0.4);
      ctx.fillStyle = '#e8b04a'; ctx.beginPath(); ctx.ellipse(640, 570, 60, 20, 0, 0, 7); ctx.fill();
      rect(ctx, 600, 575, 80, 30, '#6a2a1a');
      vignette(ctx, 0.55);
    },

    corridor(ctx) {
      rect(ctx, 0, 0, W, H, '#2a1d15');
      const vx = 640, vy = 330;
      poly(ctx, [0, 0, W, 0, vx + 90, vy - 110, vx - 90, vy - 110], '#3a2a1f');
      poly(ctx, [0, 0, vx - 90, vy - 110, vx - 90, vy + 110, 0, H], '#5a4130');
      poly(ctx, [W, 0, vx + 90, vy - 110, vx + 90, vy + 110, W, H], '#4e392a');
      poly(ctx, [0, H, vx - 90, vy + 110, vx + 90, vy + 110, W, H], '#3a2616');
      rect(ctx, vx - 90, vy - 110, 180, 220, '#1a120c');
      doorShape(ctx, vx - 40, vy - 70, 80, 180, '#3a2616');
      // 左右のドア
      [[140, 170, 110, 420], [360, 250, 60, 250]].forEach(d => { poly(ctx, [d[0], d[1], d[0] + d[2], d[1] + d[2] * 0.4, d[0] + d[2], d[1] + d[3] - d[2] * 0.3, d[0], d[1] + d[3]], '#2e2016'); });
      [[W - 140, 170, -110, 420], [W - 360, 250, -60, 250]].forEach(d => { poly(ctx, [d[0], d[1], d[0] + d[2], d[1] - d[2] * -0.4, d[0] + d[2], d[1] + d[3] + d[2] * 0.3, d[0], d[1] + d[3]], '#2e2016'); });
      ctx.fillStyle = '#6a2020'; poly(ctx, [520, H, vx - 40, vy + 110, vx + 40, vy + 110, 760, H], '#5a1e1e');
      [[320, 120], [960, 120], [560, 230], [720, 230]].forEach(p => glow(ctx, p[0], p[1], 90, 'rgba(255,190,110,A)', 0.35));
      vignette(ctx, 0.7);
    },

    room(ctx) {
      woodWall(ctx, 0, 480, '#8a6a4c', '#5e442e', 41);
      nightWindow(ctx, 760, 110, 300, 250, 42);
      ctx.fillStyle = 'rgba(140,110,150,0.8)'; ctx.fillRect(720, 90, 60, 300); ctx.fillRect(1040, 90, 60, 300);
      windowFrame(ctx, 760, 110, 300, 250);
      floor(ctx, 480, '#6a4a30', '#352315');
      // ベッド2つ
      [[80, 420], [390, 440]].forEach(b => {
        rect(ctx, b[0], b[1] - 60, 280, 60, '#4a3020');
        rect(ctx, b[0], b[1], 280, 160, '#e8e2d6'); rect(ctx, b[0] + 20, b[1] + 10, 90, 40, '#fbf8f2');
        rect(ctx, b[0], b[1] + 70, 280, 90, '#6a7ea0');
      });
      glow(ctx, 360, 360, 120, 'rgba(255,200,120,A)', 0.4);
      rect(ctx, 340, 360, 40, 60, '#3a2a1a'); poly(ctx, [330, 360, 345, 320, 375, 320, 390, 360], '#e8d7b0');
      vignette(ctx, 0.55);
    },

    entrance(ctx) {
      woodWall(ctx, 0, 520, '#7a5a3e', '#4a3322', 51);
      rect(ctx, 0, 110, W, 16, '#3a2616');
      // コート掛け
      const coats = ['#15161a', '#15161a', '#9a7250', '#7a2a3a', '#e8e0d0', '#2a4a6a', '#5a5a5a'];
      coats.forEach((c, i) => {
        const x = 110 + i * 150;
        rect(ctx, x - 4, 110, 8, 30, '#222');
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 40, 150); ctx.quadraticCurveTo(x, 130, x + 40, 150);
        ctx.lineTo(x + 55, 400); ctx.lineTo(x - 55, 400); ctx.closePath(); ctx.fill();
        if (c === '#15161a') { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; for (let y = 180; y < 400; y += 30) { ctx.beginPath(); ctx.moveTo(x - 48, y); ctx.lineTo(x + 48, y); ctx.stroke(); } }
      });
      // ストーブ
      rect(ctx, 1120, 430, 110, 130, '#2a2a2a'); glow(ctx, 1175, 500, 160, 'rgba(255,120,40,A)', 0.4); rect(ctx, 1140, 470, 70, 40, '#ff8a3a');
      floor(ctx, 520, '#4a3a2e', '#221812');
      // 長靴
      [200, 260, 520, 580].forEach(x => rect(ctx, x, 560, 40, 80, '#2a2a30'));
      vignette(ctx, 0.55);
    },

    stairs(ctx) {
      rect(ctx, 0, 0, W, H, '#2a1c12');
      woodWall(ctx, 0, H, '#5a4030', '#2e2016', 61);
      for (let i = 0; i < 10; i++) {
        const x = 300 + i * 90, y = 620 - i * 62;
        rect(ctx, x, y, 90, 12, '#7a5236'); rect(ctx, x, y + 12, 90, H - y, '#3a2618');
      }
      ctx.strokeStyle = '#6a4a30'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(300, 500); ctx.lineTo(1200, -60); ctx.stroke();
      // 物置の扉
      rect(ctx, 120, 420, 200, 300, '#1a0f08'); doorShape(ctx, 140, 440, 160, 260, '#4a3020');
      rect(ctx, 150, 600, 90, 60, '#9a7a50');
      glow(ctx, 640, 60, 220, 'rgba(255,190,110,A)', 0.3);
      vignette(ctx, 0.7);
    },

    kitchen(ctx) {
      rect(ctx, 0, 0, W, H, '#c8c0b0');
      for (let y = 0; y < 480; y += 40) for (let x = (y / 40 % 2) * 20; x < W; x += 40) rect(ctx, x, y, 38, 38, '#ddd6c8');
      rect(ctx, 0, 440, W, 40, '#6a6a70'); rect(ctx, 0, 480, W, 240, '#8a6a4a');
      for (let x = 40; x < W; x += 220) doorShape(ctx, x, 500, 190, 200, '#7a5a3a');
      [300, 420, 540, 800, 900].forEach((x, i) => { rect(ctx, x, 60, 3, 80 + i * 10, '#444'); ctx.fillStyle = '#6a6a6a'; ctx.beginPath(); ctx.arc(x, 150 + i * 10, 34, 0, Math.PI); ctx.fill(); });
      nightWindow(ctx, 1000, 120, 200, 200, 71); windowFrame(ctx, 1000, 120, 200, 200);
      vignette(ctx, 0.6);
    },

    greenhouse(ctx) { greenhouseBase(ctx, false); },
    bloom(ctx) { greenhouseBase(ctx, true); },

    blizzard(ctx) {
      ctx.fillStyle = vgrad(ctx, 0, H, ['#1a2238', '#56627e', '#a8b2c6']); ctx.fillRect(0, 0, W, H);
      forest(ctx, 81, 460, 22, 140, 300, 'rgba(40,50,70,0.6)', 'rgba(220,228,240,0.6)');
      snowGround(ctx, 470, '#a9b4c8', '#d6dde8');
      const r = rng(82);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 500; i++) { const x = r() * W, y = r() * H, l = 20 + r() * 50; ctx.lineWidth = 1 + r() * 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + l * 0.35); ctx.stroke(); }
      ctx.fillStyle = 'rgba(230,236,245,0.35)'; ctx.fillRect(0, 0, W, H);
      vignette(ctx, 0.6);
    },

    attic(ctx) {
      rect(ctx, 0, 0, W, H, '#1e140d');
      poly(ctx, [0, 0, 640, -200, 1280, 0, 1280, 200, 640, 20, 0, 200], '#3a2618');
      for (let i = 0; i < 7; i++) { const x = i * 213; ctx.strokeStyle = '#4e3522'; ctx.lineWidth = 24; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(640 + (x - 640) * 1.4, H); ctx.stroke(); }
      floor(ctx, 540, '#4a3322', '#1e140d');
      const r = rng(91);
      for (let i = 0; i < 9; i++) { const x = 80 + r() * 1100, w = 80 + r() * 120, h = 60 + r() * 100; rect(ctx, x, 620 - h, w, h, '#6a5238'); rect(ctx, x, 620 - h + h / 2 - 3, w, 6, '#4a3624'); }
      // 天窓の光
      ctx.fillStyle = 'rgba(160,180,230,0.12)'; poly(ctx, [560, 60, 720, 60, 860, 620, 420, 620], 'rgba(170,190,240,0.10)');
      rect(ctx, 560, 40, 160, 60, '#20304e');
      vignette(ctx, 0.75);
    },

    morning(ctx) {
      beamsRoom(ctx, '#a98260', '#7a5a3e');
      ['#bfe0ff', '#dff0ff'].forEach(() => {});
      [[70, 130], [520, 130], [970, 130]].forEach(p => {
        ctx.fillStyle = vgrad(ctx, p[1], p[1] + 280, ['#8ec3f0', '#e8f4ff']); ctx.fillRect(p[0], p[1], 240, 280);
        const r = rng(p[0]); for (let k = 0; k < 4; k++) tree(ctx, p[0] + r() * 240, p[1] + 280, 90 + r() * 80, '#5a7090', '#ffffff');
        rect(ctx, p[0], p[1] + 250, 240, 30, '#ffffff');
        windowFrame(ctx, p[0], p[1], 240, 280);
        glow(ctx, p[0] + 120, p[1] + 200, 260, 'rgba(255,255,240,A)', 0.35);
      });
      floor(ctx, 520, '#8a6440', '#5a3e26');
      sofa(ctx, 440, 560, 400, '#a04a3a');
      vignette(ctx, 0.25);
    },

    bath(ctx) {
      rect(ctx, 0, 0, W, H, '#d8dde2');
      for (let y = 0; y < H; y += 50) for (let x = 0; x < W; x += 50) { ctx.strokeStyle = '#b8c0c8'; ctx.strokeRect(x, y, 50, 50); }
      rect(ctx, 380, 90, 520, 300, '#8a9aa8'); rect(ctx, 395, 105, 490, 270, '#b8cad8');
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; poly(ctx, [420, 110, 520, 110, 440, 370, 400, 370], 'rgba(255,255,255,0.3)');
      rect(ctx, 340, 420, 600, 40, '#f4f6f8'); rect(ctx, 360, 460, 560, 260, '#c8ccd2');
      ctx.fillStyle = '#e8ecf0'; ctx.beginPath(); ctx.ellipse(640, 440, 120, 20, 0, 0, 7); ctx.fill();
      [140, 1100].forEach(x => { rect(ctx, x - 70, 300, 140, 420, '#9a8a70'); for (let y = 330; y < 700; y += 90) rect(ctx, x - 60, y, 120, 70, '#6a5a44'); });
      vignette(ctx, 0.4);
    },

    memory(ctx) {
      ctx.fillStyle = vgrad(ctx, 0, H, ['#6a5a48', '#9a8a70', '#b8a888']); ctx.fillRect(0, 0, W, H);
      // 校舎
      rect(ctx, 60, 160, 700, 320, '#8a7a62');
      for (let y = 200; y < 440; y += 90) for (let x = 100; x < 740; x += 110) rect(ctx, x, y, 80, 55, '#5e5040');
      rect(ctx, 340, 380, 160, 100, '#3e3428');
      // 地面と水たまり
      rect(ctx, 0, 480, W, 240, '#7a6c56');
      ctx.fillStyle = 'rgba(200,190,160,0.35)';
      [[300, 600, 120], [800, 560, 160], [1050, 660, 90]].forEach(p => { ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[2] * 0.18, 0, 0, 7); ctx.fill(); });
      // 黄色い傘（色だけ残る）
      ctx.fillStyle = '#e8c23a'; ctx.beginPath(); ctx.arc(980, 400, 90, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b8942a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(980, 400); ctx.lineTo(980, 520); ctx.arc(970, 520, 10, 0, Math.PI); ctx.stroke();
      // 雨
      const r = rng(101); ctx.strokeStyle = 'rgba(240,235,220,0.45)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 400; i++) { const x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 28); ctx.stroke(); }
      vignette(ctx, 0.7);
    }
  };

  function beamsRoom(ctx, c1, c2) {
    woodWall(ctx, 0, 520, c1, c2, 17);
    beams(ctx, shade(c2, -25));
  }
  function windowFrame(ctx, x, y, w, h) {
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 14; ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
  }
  function greenhouseBase(ctx, open) {
    ctx.fillStyle = vgrad(ctx, 0, H, ['#050a18', '#10203a', '#1c3040']); ctx.fillRect(0, 0, W, H);
    const r0 = rng(111);
    for (let i = 0; i < 80; i++) { ctx.fillStyle = 'rgba(255,255,255,' + r0() * 0.8 + ')'; ctx.fillRect(r0() * W, r0() * 300, 2, 2); }
    // ガラスの骨組み
    ctx.strokeStyle = 'rgba(170,210,200,0.35)'; ctx.lineWidth = 4;
    for (let x = 0; x <= W; x += 128) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(640 + (x - 640) * 0.55, 60); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, 260); ctx.quadraticCurveTo(640, -80, W, 260); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 440); ctx.quadraticCurveTo(640, 180, W, 440); ctx.stroke();
    ctx.fillStyle = 'rgba(120,170,170,0.06)'; ctx.fillRect(0, 0, W, H);
    // 植物
    const r = rng(112);
    for (let i = 0; i < 9; i++) plant(ctx, 60 + i * 145 + r() * 30, 600, 180 + r() * 140, i % 2 ? '#1a3a2a' : '#224a34', r);
    rect(ctx, 0, 590, W, 130, '#1a1410');
    for (let x = 40; x < W; x += 180) { poly(ctx, [x, 600, x + 110, 600, x + 95, 680, x + 15, 680], '#6a3e28'); }
    // ランタン
    glow(ctx, 200, 480, 200, 'rgba(255,190,100,A)', 0.4); rect(ctx, 188, 460, 24, 34, '#ffcf7a');
    // 月下美人
    const cx = 760, cy = 330;
    ctx.strokeStyle = '#2e5a3a'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx - 40, 600); ctx.quadraticCurveTo(cx - 80, 450, cx, cy + 20); ctx.stroke();
    ctx.fillStyle = '#2e5a3a'; ctx.beginPath(); ctx.ellipse(cx - 70, 470, 60, 18, -0.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - 10, 520, 70, 18, 0.5, 0, 7); ctx.fill();
    if (open) { flower(ctx, cx, cy, 1.4, true); flower(ctx, cx + 170, cy + 90, 0.9, true); flower(ctx, cx - 230, cy + 130, 0.8, true); }
    else { flower(ctx, cx, cy, 1.3, false); flower(ctx, cx + 170, cy + 90, 1, false); flower(ctx, cx - 230, cy + 130, 0.9, false); }
    // ベンチ
    rect(ctx, 960, 560, 230, 16, '#5a4030'); rect(ctx, 980, 576, 12, 40, '#3a2818'); rect(ctx, 1160, 576, 12, 40, '#3a2818');
    vignette(ctx, 0.6);
  }

  const cache = {};
  function drawBG(id) {
    if (cache[id]) return cache[id];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    (BG[id] || BG.black)(ctx);
    if (id !== 'black' && id !== 'white') grain(ctx, id.length * 97, 0.05);
    cache[id] = c.toDataURL('image/jpeg', 0.85);
    return cache[id];
  }

  // ---------- シルエット ----------
  // 座標系: 幅200 × 高さ500。足元 y=500。
  function body(o) {
    const sw = o.sw || 70, hw = o.hw || 45, top = o.top || 170, belly = o.belly || 0;
    const nw = o.nw || 16;
    return `M${100 - nw},${top - 60} L${100 + nw},${top - 60} L${100 + nw + 4},${top} L${100 - nw - 4},${top} Z
      M${100 - sw},${top + 40} Q${100 - sw},${top} ${100 - 30},${top - 8} L${130},${top - 8} Q${100 + sw},${top} ${100 + sw},${top + 40}
      L${100 + hw + belly},${top + 190} Q${100 + hw + belly + 6},${top + 240} ${100 + hw},${500} L${100 - hw},${500}
      Q${100 - hw - belly - 6},${top + 240} ${100 - hw - belly},${top + 190} Z`;
  }
  const SIL = {
    tsuyoshi: { h: 1, parts: () => body({ sw: 72 }) + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M66,84 L68,40 L82,54 L90,28 L102,50 L114,26 L120,50 L136,38 L134,86 Q124,62 100,60 Q76,62 66,84 Z' },
    mao: { h: 0.92, parts: () => body({ sw: 58, hw: 40 }) + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M60,110 Q56,40 100,34 Q144,40 140,110 Q146,160 134,190 L120,150 Q128,70 100,62 Q72,70 80,150 L66,190 Q54,160 60,110 Z' },
    saeko: { h: 0.98, parts: () => body({ sw: 56, hw: 36, top: 176 }) + ' M76,160 L124,160 L122,190 L78,190 Z' + ' M68,100 Q68,44 100,42 Q132,44 132,100 Q130,132 100,136 Q70,132 68,100 Z' + ' M62,130 Q56,36 100,34 Q146,38 140,132 L126,132 Q130,64 100,60 Q72,64 76,132 Z' },
    anzu: { h: 0.9, parts: () => body({ sw: 56, hw: 42 }) + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M56,110 Q48,36 100,32 Q152,36 144,110 Q160,150 150,200 Q140,230 128,210 Q142,160 126,120 Q124,70 100,64 Q76,70 74,120 Q58,160 72,210 Q60,230 50,200 Q40,150 56,110 Z' + ' M150,230 L178,150 L196,156 L170,238 Z' },
    shizuka: { h: 0.95, parts: () => body({ sw: 54, hw: 36 }) + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M62,100 Q56,34 100,32 Q144,34 138,100 L144,330 L120,330 L122,120 Q120,70 100,64 Q80,70 78,120 L80,330 L56,330 Z' },
    saionji: { h: 1.06, parts: () => body({ sw: 80, hw: 50 }) + ' M70,170 L100,250 L130,170 L150,175 L100,290 L50,175 Z' + ' M70,98 Q68,44 100,40 Q134,44 132,98 Q130,132 100,136 Q70,132 70,98 Z' + ' M64,86 Q60,28 108,30 Q146,34 138,80 Q120,50 90,56 Q72,60 64,86 Z' },
    yamada: { h: 0.9, parts: () => body({ sw: 74, hw: 52, belly: 30 }) + ' M64,100 Q62,40 100,38 Q138,40 136,100 Q134,140 100,144 Q66,140 64,100 Z' },
    reiko: { h: 0.96, parts: () => body({ sw: 62, hw: 44 }) + ' M40,190 Q10,260 26,330 L50,330 Q40,260 70,200 Z' + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M44,110 Q30,30 100,20 Q170,30 156,110 Q150,140 134,130 Q138,70 100,62 Q62,70 66,130 Q50,140 44,110 Z' },
    otaka: { h: 1.14, parts: () => body({ sw: 90, hw: 60, belly: 10 }) + ' M62,100 Q60,36 100,34 Q140,36 138,100 Q136,120 130,130 L100,190 L70,130 Q64,120 62,100 Z' + ' M170,120 L182,120 L182,380 L170,380 Z M150,110 Q190,90 200,140 Q180,150 150,140 Z' },
    yuuki: { h: 0.97, parts: () => body({ sw: 60, hw: 38 }) + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M60,80 L64,40 L80,50 L86,22 L100,44 L112,18 L120,44 L140,30 L138,62 L148,74 L132,80 Q124,58 100,58 Q76,58 68,84 Z' },
    girl: { h: 0.55, parts: () => body({ sw: 56, hw: 46, top: 200 }) + ' M64,130 Q62,64 100,62 Q138,64 136,130 Q134,170 100,174 Q66,170 64,130 Z' + ' M40,110 Q34,90 50,82 Q66,86 62,110 Q56,126 40,110 Z M160,110 Q166,90 150,82 Q134,86 138,110 Q144,126 160,110 Z' },
    mother: { h: 0.9, parts: () => body({ sw: 62, hw: 46, belly: 8 }) + ' M70,100 Q70,48 100,46 Q130,48 130,100 Q128,130 100,134 Q72,130 70,100 Z' + ' M58,96 Q50,34 100,30 Q150,34 142,96 Q146,120 132,110 Q130,60 100,58 Q70,60 68,110 Q54,120 58,96 Z' },
    ghost: { h: 1, ghost: true, parts: () => 'M100,40 Q140,42 140,100 L150,260 Q170,420 140,500 L60,500 Q30,420 50,260 L60,100 Q60,42 100,40 Z M62,100 L40,380 L56,380 Z M138,100 L160,380 L144,380 Z' },
    yuki: { h: 0.22, cat: true, parts: () => 'M30,500 Q20,380 70,360 L60,300 L90,330 Q110,322 130,330 L160,300 L150,360 Q190,380 180,500 Z M180,470 Q220,440 200,380 Q196,370 188,380 Q204,440 170,460 Z' }
  };

  function silhouetteSVG(id) {
    const s = SIL[id];
    if (!s) return '';
    const fill = s.ghost ? 'url(#g-ghost)' : 'url(#g-' + id + ')';
    const grad = s.ghost
      ? '<linearGradient id="g-ghost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0.15"/></linearGradient>'
      : '<linearGradient id="g-' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f7dff"/><stop offset="0.55" stop-color="#1d4fc4"/><stop offset="1" stop-color="#0b2a78"/></linearGradient>';
    const vb = s.cat ? '0 280 220 220' : '0 0 200 500';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMax meet"><defs>' + grad +
      '</defs><path d="' + s.parts().replace(/\s+/g, ' ') + '" fill="' + fill + '" fill-rule="nonzero"/></svg>';
  }

  root.ART = { drawBG: drawBG, silhouetteSVG: silhouetteSVG, SIL: SIL };
})(this);
