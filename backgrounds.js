// Brick Fiesta - Animierte Level-Hintergründe
// Jede Funktion zeichnet einen kompletten Hintergrund (ohne Sterne-Overlay).
// Pro Level rotiert die Auswahl - 8 Stile insgesamt.

const Backgrounds = (() => {
  const W_REF = 800, H_REF = 1000;

  // Lookup: Level -> Background-Index (mod 8)
  function nameForLevel(level) {
    return STYLES[(level - 1) % STYLES.length].name;
  }

  function draw(level, t, ctx, W, H) {
    const style = STYLES[(level - 1) % STYLES.length];
    style.fn(ctx, W, H, t);
  }

  // === 1) Sternenfeld (Parallax) =================================
  function starfield(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0418');
    g.addColorStop(1, '#1a0a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Drei Schichten Sterne mit unterschiedlicher Geschwindigkeit
    const layers = [
      { count: 60, speed: 0.02, size: 1, alpha: 0.4 },
      { count: 40, speed: 0.05, size: 2, alpha: 0.7 },
      { count: 20, speed: 0.10, size: 2, alpha: 1.0 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.count; i++) {
        const seed = i * 73.13 + L.speed * 1000;
        const x = (seed * 17 + i * 11) % W;
        const y = (((seed * 31 + i * 7) + t * L.speed) % (H + 50)) - 20;
        const tw = (Math.sin(t * 0.002 + i) + 1) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${L.alpha * (0.5 + tw * 0.5)})`;
        ctx.fillRect(x, y, L.size, L.size);
      }
    }
  }

  // === 2) Synthwave-Grid =========================================
  function synthwave(ctx, W, H, t) {
    // Himmel-Gradient
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0,   '#2a0a4a');
    g.addColorStop(0.5, '#a02a8a');
    g.addColorStop(1,   '#ff5c8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.6);

    // Sonne
    const sx = W / 2, sy = H * 0.45;
    const sr = 120;
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, sr);
    sg.addColorStop(0, '#fff3b0');
    sg.addColorStop(0.5, '#ffb04a');
    sg.addColorStop(1, 'rgba(255,80,140,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();

    // Horizontale Schnitt-Linien durch die Sonne
    ctx.fillStyle = 'rgba(20,5,40,1)';
    for (let i = 0; i < 6; i++) {
      const y = sy - 20 + i * 14;
      const w = sr * 1.8 * (1 - i / 7);
      ctx.fillRect(sx - w/2, y, w, 5);
    }

    // Boden
    const bg = ctx.createLinearGradient(0, H * 0.6, 0, H);
    bg.addColorStop(0, '#1a0428');
    bg.addColorStop(1, '#000010');
    ctx.fillStyle = bg;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);

    // Perspektivisches Grid
    ctx.strokeStyle = 'rgba(255,92,210,0.6)';
    ctx.lineWidth = 2;
    const horizon = H * 0.6;
    // Horizontale Linien (in die Tiefe)
    const offset = (t * 0.04) % 60;
    for (let i = 0; i < 20; i++) {
      const dist = (i * 60 + offset) / 60;
      const y = horizon + (H - horizon) * (dist * dist) / 20;
      if (y > H) continue;
      ctx.globalAlpha = Math.max(0, 1 - dist / 6);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Vertikale Linien (Fluchtpunkt-Mitte)
    for (let i = -10; i <= 10; i++) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(W/2 + i * W * 0.08, horizon);
      ctx.lineTo(W/2 + i * W * 0.5, H + 50);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // === 3) Nebel/Nebula ==========================================
  function nebula(ctx, W, H, t) {
    ctx.fillStyle = '#080418';
    ctx.fillRect(0, 0, W, H);

    // Drei rotierende Farbwolken
    const clouds = [
      { col: 'rgba(255,92,210,0.5)', rx: 0.3, ry: 0.3, r: 350, sp: 0.0003, ph: 0 },
      { col: 'rgba(92,200,255,0.4)', rx: 0.7, ry: 0.6, r: 400, sp: -0.0002, ph: 2 },
      { col: 'rgba(255,200,92,0.35)', rx: 0.5, ry: 0.8, r: 320, sp: 0.0004, ph: 4 },
    ];
    for (const c of clouds) {
      const cx = c.rx * W + Math.cos(t * c.sp + c.ph) * 120;
      const cy = c.ry * H + Math.sin(t * c.sp + c.ph) * 100;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, c.r);
      g.addColorStop(0, c.col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Sterne dünn überlagern
    for (let i = 0; i < 30; i++) {
      const x = (i * 137 + 23) % W;
      const y = (i * 191 + 71) % H;
      const a = 0.3 + 0.5 * ((Math.sin(t * 0.002 + i) + 1) * 0.5);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // === 4) Aurora (Polarlicht) ===================================
  function aurora(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#020a18');
    g.addColorStop(1, '#0a1a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sterne
    for (let i = 0; i < 80; i++) {
      const x = (i * 137) % W;
      const y = (i * 89) % H;
      ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.sin(t*0.003 + i) * 0.3})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Drei vertikal hängende Lichtschleier
    const bands = [
      { col1: 'rgba(92,255,180,0.6)', col2: 'rgba(92,255,180,0)', x: 0.2, w: 0.35, sp: 0.0008, ph: 0 },
      { col1: 'rgba(180,92,255,0.55)', col2: 'rgba(180,92,255,0)', x: 0.5, w: 0.4, sp: 0.0006, ph: 2 },
      { col1: 'rgba(255,180,92,0.45)', col2: 'rgba(255,180,92,0)', x: 0.75, w: 0.3, sp: 0.0010, ph: 4 },
    ];
    for (const b of bands) {
      ctx.save();
      const cx = b.x * W + Math.sin(t * b.sp + b.ph) * 60;
      const grad = ctx.createLinearGradient(cx, 0, cx + b.w * W, 0);
      grad.addColorStop(0, b.col2);
      grad.addColorStop(0.5, b.col1);
      grad.addColorStop(1, b.col2);
      ctx.fillStyle = grad;
      // Welliger Pfad
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const y = (H / steps) * i;
        const wave = Math.sin(t * 0.001 + i * 0.4 + b.ph) * 40;
        ctx.lineTo(cx + b.w * W * 0.5 + wave, y);
      }
      for (let i = steps; i >= 0; i--) {
        const y = (H / steps) * i;
        const wave = Math.sin(t * 0.001 + i * 0.4 + b.ph + 1.5) * 40;
        ctx.lineTo(cx + b.w * W - wave, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // === 5) Hyperraum-Tunnel (radiale Linien aus der Mitte) ========
  function hyperspace(ctx, W, H, t) {
    ctx.fillStyle = '#000005';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H * 0.4;
    const count = 80;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5;
      // Strich mit Lebensdauer
      const phase = ((t * 0.001 + i * 0.13) % 1);
      const dist = phase * Math.max(W, H);
      const x1 = cx + Math.cos(angle) * dist;
      const y1 = cy + Math.sin(angle) * dist;
      const x2 = cx + Math.cos(angle) * (dist + 60 + phase * 100);
      const y2 = cy + Math.sin(angle) * (dist + 60 + phase * 100);
      const a = Math.min(1, phase * 2);
      const hue = (i * 7) % 360;
      ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${a})`;
      ctx.lineWidth = 1 + phase * 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // === 6) Plasma (Low-Res-Pixel) ================================
  function plasma(ctx, W, H, t) {
    const cell = 16; // Pixelgröße - klein genug für Plasma-Feel, schnell genug
    const tt = t * 0.001;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const v = Math.sin(x * 0.01 + tt) +
                  Math.sin(y * 0.015 + tt * 1.3) +
                  Math.sin((x + y) * 0.008 + tt * 0.7) +
                  Math.sin(Math.sqrt(x*x + y*y) * 0.01 + tt);
        const hue = (v * 60 + 200) % 360;
        ctx.fillStyle = `hsl(${hue}, 70%, 35%)`;
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  // === 7) Matrix-Regen (fallende Glyphen) ========================
  const matrixGlyphs = '01アイウエオカキクケコサシスセソタチツテト'.split('');
  let matrixCols = null;
  function matrix(ctx, W, H, t) {
    ctx.fillStyle = 'rgba(0,8,0,0.95)';
    ctx.fillRect(0, 0, W, H);

    if (!matrixCols) {
      const colW = 18;
      const n = Math.ceil(W / colW);
      matrixCols = [];
      for (let i = 0; i < n; i++) {
        matrixCols.push({
          x: i * colW,
          y: Math.random() * H,
          speed: 1.5 + Math.random() * 3,
          len: 6 + Math.floor(Math.random() * 10),
        });
      }
    }
    ctx.font = 'bold 16px "Lucida Console", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const c of matrixCols) {
      c.y += c.speed;
      if (c.y - c.len * 18 > H) {
        c.y = -Math.random() * H;
        c.speed = 1.5 + Math.random() * 3;
      }
      for (let i = 0; i < c.len; i++) {
        const gy = c.y - i * 18;
        if (gy < -20 || gy > H + 20) continue;
        const ch = matrixGlyphs[Math.floor((t * 0.01 + c.x + gy) / 37) % matrixGlyphs.length];
        if (i === 0) ctx.fillStyle = '#cfffd0';
        else ctx.fillStyle = `rgba(50,255,80,${1 - i / c.len})`;
        ctx.fillText(ch, c.x + 9, gy);
      }
    }
  }

  // === 8) Unterwasser/Bubbles ===================================
  let bubbles = null;
  function bubblesBg(ctx, W, H, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a2a4a');
    g.addColorStop(0.5, '#1a4a7a');
    g.addColorStop(1, '#062040');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Lichtstrahlen von oben
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 5; i++) {
      const x = (i / 5) * W + Math.sin(t * 0.0005 + i) * 40;
      const grad = ctx.createLinearGradient(x, 0, x + 80, H);
      grad.addColorStop(0, 'rgba(180,230,255,0.6)');
      grad.addColorStop(1, 'rgba(180,230,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - 20, 0);
      ctx.lineTo(x + 100, 0);
      ctx.lineTo(x + 200, H);
      ctx.lineTo(x + 60, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Bubbles initialisieren
    if (!bubbles) {
      bubbles = [];
      for (let i = 0; i < 35; i++) {
        bubbles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 4 + Math.random() * 14,
          sp: 0.5 + Math.random() * 1.5,
          wob: Math.random() * Math.PI * 2,
        });
      }
    }
    for (const b of bubbles) {
      b.y -= b.sp;
      b.wob += 0.05;
      const x = b.x + Math.sin(b.wob) * 12;
      if (b.y + b.r < 0) {
        b.y = H + b.r;
        b.x = Math.random() * W;
      }
      // Outer ring
      ctx.strokeStyle = 'rgba(200,240,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, Math.PI*2); ctx.stroke();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.2, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // === Style-Index ===============================================
  const STYLES = [
    { name: 'Starfield',  fn: starfield },
    { name: 'Synthwave',  fn: synthwave },
    { name: 'Nebula',     fn: nebula },
    { name: 'Aurora',     fn: aurora },
    { name: 'Hyperspace', fn: hyperspace },
    { name: 'Plasma',     fn: plasma },
    { name: 'Matrix',     fn: matrix },
    { name: 'Bubbles',    fn: bubblesBg },
  ];

  return { draw, nameForLevel };
})();
