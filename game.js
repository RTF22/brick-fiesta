// Brick Fiesta - Hauptspiellogik
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // logische Auflösung
  const H = canvas.height;

  // Layout
  const COLS = 10;
  const HUD_H = 56;              // Amiga-Titelleiste
  const WALL_TOP = HUD_H;        // Y-Beginn der oberen Wand
  const WALL_THICK = 18;         // Dicke der oberen Wand
  const PLAYFIELD_TOP = WALL_TOP + WALL_THICK + 4;  // 78
  const PLAYFIELD_BOTTOM = H - 30;
  const BRICK_W = W / COLS;
  const BRICK_H = 32;

  // Lebendige Candy-Palette - jede Spalte bekommt einen Grundfarbton.
  // [light, mid, dark] - für 3D-Verlauf
  const CANDY_PALETTE = [
    ['#ff8fd9', '#ff3ec0', '#a8267e'],  // Pink
    ['#ff6b6b', '#ff2e63', '#a01838'],  // Rot
    ['#ffb347', '#ff7a00', '#a04400'],  // Orange
    ['#ffe066', '#ffc107', '#a07a00'],  // Gelb
    ['#a6ff5c', '#5cff3a', '#2a9618'],  // Lime
    ['#6bffd9', '#1ad4a0', '#0a8060'],  // Mint
    ['#5cd5ff', '#1a9eff', '#0a5a96'],  // Blau
    ['#a08aff', '#6a4aff', '#3a1f96'],  // Lila
    ['#ff8aff', '#d44aff', '#7a1aa8'],  // Magenta
    ['#ffd56b', '#ff9f1a', '#a86018'],  // Aprikose
  ];
  const STEEL_COLORS = ['#c8cad6', '#6a6e80', '#2a2c3a'];
  const GOLD_COLORS  = ['#fff7a0', '#ffd54a', '#8a6818'];

  // HP-Modifier: höhere HP -> kräftigere, gesättigtere Variante
  function paletteForBrick(br, col) {
    if (br.kind === 'wall') return STEEL_COLORS;
    if (br.kind === 'gold') return GOLD_COLORS;
    // Wähle Farbe anhand Spalte + leichter Versatz für Vielfalt
    const idx = (col + (br.row || 0)) % CANDY_PALETTE.length;
    return CANDY_PALETTE[idx];
  }

  // === Game State =============================================
  const state = {
    running: false,
    paused: false,
    level: 1,
    score: 0,
    lives: 3,
    bricks: [],
    paddle: { x: W/2, y: H - 70, w: 150, h: 26, vx: 0, scale: 1 },
    balls: [],
    powerups: [],
    particles: [],
    keys: {},
    pointer: { x: W/2, active: false },
    launchPending: true,
    levelStartedAt: 0,
    paddleSticky: false,
    laser: { active: false, until: 0 },
    laserBolts: [],
    shake: 0,
  };

  // === Eingabe ================================================
  let canvasRect = null;
  function updateRect() { canvasRect = canvas.getBoundingClientRect(); }
  window.addEventListener('resize', updateRect);
  window.addEventListener('orientationchange', updateRect);
  updateRect();

  function pointerFromEvent(e) {
    const r = canvasRect || canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    const px = (t.clientX - r.left) / r.width * W;
    return Math.max(0, Math.min(W, px));
  }

  canvas.addEventListener('mousemove', (e) => {
    state.pointer.x = pointerFromEvent(e);
    state.pointer.active = true;
  });
  function hitTestHud(e) {
    const r = canvasRect || canvas.getBoundingClientRect();
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    const cx = (t.clientX - r.left) / r.width * W;
    const cy = (t.clientY - r.top) / r.height * H;
    for (const [name, b] of Object.entries(hudButtons)) {
      if (!b) continue;
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) return name;
    }
    return null;
  }

  canvas.addEventListener('mousedown', (e) => {
    const hit = hitTestHud(e);
    if (hit === 'pause') { togglePause(); return; }
    if (hit === 'sfx')   { toggleSfx(); return; }
    if (hit === 'music') { toggleMusic(); return; }
    state.pointer.x = pointerFromEvent(e);
    handleAction();
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const hit = hitTestHud(e);
    if (hit === 'pause') { togglePause(); return; }
    if (hit === 'sfx')   { toggleSfx(); return; }
    if (hit === 'music') { toggleMusic(); return; }
    state.pointer.x = pointerFromEvent(e);
    state.pointer.active = true;
    handleAction();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    state.pointer.x = pointerFromEvent(e);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') { e.preventDefault(); handleAction(); }
    if (e.key.toLowerCase() === 'p') togglePause();
    if (e.key.toLowerCase() === 'm') toggleMusic();
    if (e.key.toLowerCase() === 'n') toggleSfx();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') state.pointer.active = false;
  });
  window.addEventListener('keyup', (e) => { state.keys[e.key.toLowerCase()] = false; });

  function handleAction() {
    Audio16.resume();
    if (state.launchPending && state.balls.length) {
      const b = state.balls[0];
      const angle = -Math.PI/2 + (Math.random()*0.6 - 0.3);
      const sp = baseBallSpeed();
      b.vx = Math.cos(angle) * sp;
      b.vy = Math.sin(angle) * sp;
      b.stuck = false;
      state.launchPending = false;
      Audio16.sfx.paddle();
    } else if (state.paddleSticky) {
      // Sticky-Paddle: alle haftenden Bälle freigeben
      state.balls.forEach(b => {
        if (b.stuck) {
          const angle = -Math.PI/2 + (Math.random()*0.6 - 0.3);
          const sp = baseBallSpeed();
          b.vx = Math.cos(angle) * sp;
          b.vy = Math.sin(angle) * sp;
          b.stuck = false;
        }
      });
      if (state.laser.active && performance.now() < state.laser.until) {
        fireLaser();
      }
    } else if (state.laser.active && performance.now() < state.laser.until) {
      fireLaser();
    }
  }

  // === Level laden ============================================
  function baseBallSpeed() {
    return 7.0 * ballSpeedForLevel(state.level);
  }

  function loadLevel(n) {
    const idx = (n - 1) % LEVELS.length;
    const def = LEVELS[idx];
    state.bricks = [];
    const offsetY = PLAYFIELD_TOP;
    for (let r = 0; r < def.rows.length; r++) {
      const row = def.rows[r];
      for (let c = 0; c < Math.min(COLS, row.length); c++) {
        const ch = row[c];
        if (ch === '.') continue;
        let hp = 1, kind = 'normal';
        if (ch === 'X') { hp = -1; kind = 'wall'; }
        else if (ch === '*') { hp = 1; kind = 'power'; }
        else if (ch === '$') { hp = 1; kind = 'gold'; }
        else if (/[1-9]/.test(ch)) { hp = parseInt(ch, 10); kind = 'normal'; }
        else continue;
        state.bricks.push({
          x: c * BRICK_W + 2,
          y: offsetY + r * BRICK_H + 2,
          w: BRICK_W - 4,
          h: BRICK_H - 4,
          col: c, row: r,
          hp, maxHp: hp, kind,
          shake: 0,
          shimmer: Math.random() * Math.PI * 2,
        });
      }
    }
    state.paddle.w = 150 * paddleScaleForLevel(n);
    state.paddle.scale = paddleScaleForLevel(n);
    state.balls = [makeBall()];
    state.powerups = [];
    state.particles = [];
    state.laserBolts = [];
    state.laser.active = false;
    state.paddleSticky = false;
    state.launchPending = true;
    state.levelStartedAt = performance.now();
    updateHUD();
  }

  function makeBall() {
    return {
      x: state.paddle.x,
      y: state.paddle.y - 12,
      r: 9,
      vx: 0, vy: 0,
      stuck: true,
    };
  }

  // === Powerups ===============================================
  // Typen: wide, narrow, slow, fast, multi, life, sticky, laser
  const POWER_TYPES = ['wide', 'multi', 'slow', 'life', 'sticky', 'laser', 'narrow', 'fast'];
  const POWER_COLORS = {
    wide: '#5cff7a', multi: '#5cffe2', slow: '#7c5cff', life: '#ff5cd2',
    sticky: '#ffb84a', laser: '#ff5c5c', narrow: '#888', fast: '#ff8a3d',
  };
  const POWER_LABELS = {
    wide: 'W', multi: 'M', slow: 'S', life: '+', sticky: 'G', laser: 'L', narrow: 'N', fast: 'F',
  };

  function spawnPowerup(x, y) {
    // 80% positiv, 20% negativ
    const positive = ['wide', 'multi', 'slow', 'life', 'sticky', 'laser'];
    const negative = ['narrow', 'fast'];
    const type = Math.random() < 0.8
      ? positive[Math.floor(Math.random() * positive.length)]
      : negative[Math.floor(Math.random() * negative.length)];
    state.powerups.push({ x, y, vy: 2.2, type, w: 28, h: 28 });
  }

  function applyPowerup(type) {
    Audio16.sfx.powerup();
    switch (type) {
      case 'wide':
        state.paddle.w = Math.min(260, state.paddle.w * 1.4);
        break;
      case 'narrow':
        state.paddle.w = Math.max(60, state.paddle.w * 0.7);
        break;
      case 'multi': {
        const extras = [];
        state.balls.forEach(b => {
          if (b.stuck) return;
          for (let i = 0; i < 2; i++) {
            const a = Math.atan2(b.vy, b.vx) + (i === 0 ? 0.4 : -0.4);
            const sp = Math.hypot(b.vx, b.vy);
            extras.push({ x: b.x, y: b.y, r: b.r, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, stuck: false });
          }
        });
        state.balls.push(...extras);
        if (state.balls.length > 12) state.balls.length = 12;
        break;
      }
      case 'slow':
        state.balls.forEach(b => { b.vx *= 0.75; b.vy *= 0.75; });
        break;
      case 'fast':
        state.balls.forEach(b => { b.vx *= 1.25; b.vy *= 1.25; });
        break;
      case 'life':
        state.lives = Math.min(9, state.lives + 1);
        break;
      case 'sticky':
        state.paddleSticky = true;
        break;
      case 'laser':
        state.laser.active = true;
        state.laser.until = performance.now() + 10000;
        break;
    }
    updateHUD();
  }

  function fireLaser() {
    const x1 = state.paddle.x - state.paddle.w/2 + 10;
    const x2 = state.paddle.x + state.paddle.w/2 - 10;
    state.laserBolts.push({ x: x1, y: state.paddle.y - 10, vy: -14 });
    state.laserBolts.push({ x: x2, y: state.paddle.y - 10, vy: -14 });
    Audio16.sfx.wall();
  }

  // === Update =================================================
  function update(dt) {
    if (state.paused || !state.running) return;

    // Paddle
    const speed = 14;
    if (state.keys['arrowleft'] || state.keys['a']) {
      state.paddle.x -= speed; state.pointer.active = false;
    }
    if (state.keys['arrowright'] || state.keys['d']) {
      state.paddle.x += speed; state.pointer.active = false;
    }
    if (state.pointer.active) {
      // sanftes Folgen für Touch/Maus
      const dx = state.pointer.x - state.paddle.x;
      state.paddle.x += dx * 0.35;
    }
    state.paddle.x = Math.max(state.paddle.w/2, Math.min(W - state.paddle.w/2, state.paddle.x));

    // Bälle
    for (let i = state.balls.length - 1; i >= 0; i--) {
      const b = state.balls[i];
      if (b.stuck) {
        b.x = state.paddle.x;
        b.y = state.paddle.y - state.paddle.h/2 - b.r - 1;
        continue;
      }
      b.x += b.vx;
      b.y += b.vy;

      // Wände
      if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx; Audio16.sfx.wall(); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -b.vx; Audio16.sfx.wall(); }
      if (b.y - b.r < PLAYFIELD_TOP - 4) { b.y = PLAYFIELD_TOP - 4 + b.r; b.vy = -b.vy; Audio16.sfx.wall(); }

      // Schläger
      if (b.vy > 0 && b.y + b.r >= state.paddle.y - state.paddle.h/2 &&
          b.y - b.r <= state.paddle.y + state.paddle.h/2 &&
          b.x >= state.paddle.x - state.paddle.w/2 - b.r &&
          b.x <= state.paddle.x + state.paddle.w/2 + b.r) {
        const rel = (b.x - state.paddle.x) / (state.paddle.w/2);
        const angle = rel * (Math.PI/3); // -60°..+60°
        const sp = Math.max(baseBallSpeed(), Math.hypot(b.vx, b.vy));
        b.vx = Math.sin(angle) * sp;
        b.vy = -Math.abs(Math.cos(angle) * sp);
        b.y = state.paddle.y - state.paddle.h/2 - b.r - 1;
        if (state.paddleSticky) {
          b.stuck = true;
          b.vx = 0; b.vy = 0;
        }
        Audio16.sfx.paddle();
      }

      // Verloren
      if (b.y - b.r > H) {
        state.balls.splice(i, 1);
        continue;
      }

      // Bricks
      for (let j = state.bricks.length - 1; j >= 0; j--) {
        const br = state.bricks[j];
        if (circleRect(b, br)) {
          hitBrick(br, b);
          // einfache Reflexion: anhand der nächsten Seite
          const overlapX = (b.r + br.w/2) - Math.abs(b.x - (br.x + br.w/2));
          const overlapY = (b.r + br.h/2) - Math.abs(b.y - (br.y + br.h/2));
          if (overlapX < overlapY) b.vx = -b.vx; else b.vy = -b.vy;
          break;
        }
      }
    }

    // Powerups fallen
    for (let i = state.powerups.length - 1; i >= 0; i--) {
      const p = state.powerups[i];
      p.y += p.vy;
      if (rectOverlap(p, {
        x: state.paddle.x - state.paddle.w/2,
        y: state.paddle.y - state.paddle.h/2,
        w: state.paddle.w, h: state.paddle.h
      })) {
        applyPowerup(p.type);
        state.powerups.splice(i, 1);
      } else if (p.y > H) {
        state.powerups.splice(i, 1);
      }
    }

    // Laserbolts
    for (let i = state.laserBolts.length - 1; i >= 0; i--) {
      const lb = state.laserBolts[i];
      lb.y += lb.vy;
      let removed = false;
      for (let j = state.bricks.length - 1; j >= 0; j--) {
        const br = state.bricks[j];
        if (lb.x >= br.x && lb.x <= br.x + br.w && lb.y >= br.y && lb.y <= br.y + br.h) {
          hitBrick(br, null);
          state.laserBolts.splice(i, 1);
          removed = true;
          break;
        }
      }
      if (!removed && lb.y < 0) state.laserBolts.splice(i, 1);
    }

    // Partikel
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    // Ball verloren?
    if (state.balls.length === 0) {
      state.lives--;
      Audio16.sfx.lose();
      updateHUD();
      if (state.lives < 0) {
        gameOver();
      } else {
        state.balls = [makeBall()];
        state.launchPending = true;
        state.laser.active = false;
      }
    }

    // Level geschafft? (nur zerstörbare zählen)
    const remaining = state.bricks.filter(b => b.kind !== 'wall').length;
    if (remaining === 0) {
      levelComplete();
    }

    // Shake decay
    state.shake *= 0.85;
  }

  function hitBrick(br, ball) {
    if (br.kind === 'wall') { Audio16.sfx.hard(); state.shake = 3; return; }
    br.hp--;
    br.shake = 6;
    state.score += 10;
    Audio16.sfx.brick(br.maxHp - br.hp);
    spawnParticles(br.x + br.w/2, br.y + br.h/2, brickColor(br), 6);
    if (br.hp <= 0) {
      state.score += br.maxHp * 50;
      if (br.kind === 'gold') state.score += 500;
      if (br.kind === 'power' || Math.random() < 0.08) {
        spawnPowerup(br.x + br.w/2, br.y + br.h/2);
      }
      const idx = state.bricks.indexOf(br);
      if (idx >= 0) state.bricks.splice(idx, 1);
      spawnParticles(br.x + br.w/2, br.y + br.h/2, brickColor(br), 14);
    }
    updateHUD();
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.7) * 6,
        life: 25 + Math.random() * 20,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function levelComplete() {
    Audio16.sfx.win();
    const completed = state.level;
    const lifeBonus = state.lives * 200;
    state.score += 1000 + lifeBonus;
    state.level++;
    state.running = false;
    Audio16.stopMusic();

    const nextIdx = (state.level - 1) % LEVELS.length;
    const nextName = LEVELS[nextIdx].name;
    const nextBg = Backgrounds.nameForLevel(state.level);
    const msg = `
      <div class="lvl-stats">
        <div><span class="lbl">Level-Bonus</span><span>+1000</span></div>
        <div><span class="lbl">Leben-Bonus</span><span>+${lifeBonus}</span></div>
        <div class="sep"></div>
        <div class="big"><span class="lbl">Gesamtpunkte</span><span>${state.score}</span></div>
        <div class="sep"></div>
        <div><span class="lbl">Als Nächstes</span><span>Level ${state.level}</span></div>
        <div class="next-name">„${nextName}"</div>
        <div><span class="lbl">Schauplatz</span><span>${nextBg}</span></div>
      </div>`;
    showOverlay(`✨ Level ${completed} geschafft!`, msg, () => {
      loadLevel(state.level);
      Audio16.startMusic(state.level);
      state.running = true;
    }, false, 'Weiter →');
  }

  function gameOver() {
    state.running = false;
    Audio16.sfx.gameover();
    Audio16.stopMusic();
    showOverlay('Game Over', `Erreichte Punkte: ${state.score}<br>Level: ${state.level}`, () => {
      state.level = 1; state.score = 0; state.lives = 3;
      loadLevel(1);
      Audio16.startMusic(1);
      state.running = true;
    });
  }

  // === Collision Helpers ======================================
  function circleRect(c, r) {
    const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
    const dx = c.x - cx, dy = c.y - cy;
    return dx*dx + dy*dy < c.r*c.r;
  }
  function rectOverlap(a, b) {
    return a.x - a.w/2 < b.x + b.w &&
           a.x + a.w/2 > b.x &&
           a.y - a.h/2 < b.y + b.h &&
           a.y + a.h/2 > b.y;
  }

  // === Rendering ==============================================
  function brickColor(br) {
    const pal = paletteForBrick(br, br.col || 0);
    return pal[1];
  }
  function brickColorDark(br) {
    const pal = paletteForBrick(br, br.col || 0);
    return pal[2];
  }

  function draw() {
    // Shake (ganzzahlig, sonst flackern Wand-Kanten subpixelweise)
    ctx.save();
    if (state.shake > 0.1) {
      ctx.translate(
        Math.round((Math.random() - 0.5) * state.shake * 2),
        Math.round((Math.random() - 0.5) * state.shake * 2)
      );
    }

    // Dynamischer Hintergrund pro Level
    Backgrounds.draw(state.level, performance.now(), ctx, W, H);

    // Leichtes Dunkel-Overlay, damit Bricks/Schläger immer gut lesbar bleiben
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, PLAYFIELD_TOP - 4, W, H - PLAYFIELD_TOP + 4);

    // Seiten-/Top-Walls (vor den Bricks, damit Bricks am Rand sauber clippen)
    drawWalls();

    // Bricks
    for (const br of state.bricks) {
      const sh = br.shake;
      const dx = sh ? (Math.random() - 0.5) * sh : 0;
      const dy = sh ? (Math.random() - 0.5) * sh : 0;
      if (br.shake > 0) br.shake -= 1;
      drawBrick(br, dx, dy);
    }

    // Powerups
    for (const p of state.powerups) {
      drawPowerup(p);
    }

    // Laserbolts
    ctx.fillStyle = '#ff5c5c';
    for (const lb of state.laserBolts) {
      ctx.fillRect(lb.x - 2, lb.y - 8, 4, 14);
      ctx.fillStyle = 'rgba(255,200,200,0.5)';
      ctx.fillRect(lb.x - 1, lb.y - 12, 2, 4);
      ctx.fillStyle = '#ff5c5c';
    }

    // Paddle
    drawPaddle();

    // Bälle
    for (const b of state.balls) drawBall(b);

    // Partikel
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 40);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Launch-Hinweis
    if (state.launchPending && state.running) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = 'bold 20px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('▶ Klick / Tippen / Leertaste zum Starten', W/2, H - 100);
    }

    // Laser-Anzeige
    if (state.laser.active) {
      const left = Math.max(0, state.laser.until - performance.now());
      if (left <= 0) state.laser.active = false;
      else {
        ctx.fillStyle = 'rgba(255,92,92,0.8)';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'left';
        ctx.fillText('LASER ' + (left/1000).toFixed(1) + 's', 10, H - 8);
      }
    }
    if (state.paddleSticky) {
      ctx.fillStyle = 'rgba(255,184,74,0.8)';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('STICKY', W - 10, H - 8);
    }

    // HUD ganz oben - immer obenauf
    drawHUD();

    ctx.restore();
  }

  function drawBrick(br, dx, dy) {
    const x = br.x + dx, y = br.y + dy;
    const pal = paletteForBrick(br, br.col || 0);
    const [light, mid, dark] = pal;
    const r = 7;

    // 1) Schlagschatten unten
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, x + 2, y + 3, br.w, br.h, r, true, false);

    // 2) Dunkle Basis (Tiefenkante)
    ctx.fillStyle = dark;
    roundRect(ctx, x, y, br.w, br.h, r, true, false);

    // 3) Hauptkörper - vertikaler Verlauf von hell nach mid nach dark
    const g = ctx.createLinearGradient(x, y, x, y + br.h);
    g.addColorStop(0, light);
    g.addColorStop(0.45, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    roundRect(ctx, x + 1, y + 1, br.w - 2, br.h - 3, r - 1, true, false);

    // 4) Bevel: heller Rand oben/links
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y + 1.5);
    ctx.lineTo(x + br.w - r, y + 1.5);
    ctx.moveTo(x + 1.5, y + r);
    ctx.lineTo(x + 1.5, y + br.h - r - 2);
    ctx.stroke();

    // 5) Bevel: dunkler Rand unten/rechts
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y + br.h - 1.5);
    ctx.lineTo(x + br.w - r, y + br.h - 1.5);
    ctx.moveTo(x + br.w - 1.5, y + r);
    ctx.lineTo(x + br.w - 1.5, y + br.h - r - 2);
    ctx.stroke();

    // 6) Spekular-Highlight oben (glänzendes Plastik)
    const hg = ctx.createLinearGradient(x, y, x, y + br.h * 0.5);
    hg.addColorStop(0, 'rgba(255,255,255,0.55)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    roundRect(ctx, x + 3, y + 2, br.w - 6, br.h * 0.45, r - 2, true, false);

    // 7) Glanzpunkt-Sparkle links oben
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(x + 8, y + 5, 4, 2, 0, 0, Math.PI*2);
    ctx.fill();

    // 8) HP-Indikator bei mehrstufigen Bricks (Punkte statt Zahl - Amiga-Stil)
    if (br.maxHp > 1 && br.kind !== 'wall') {
      const dots = br.hp;
      const dotSize = 3;
      const spacing = 6;
      const totalW = dots * spacing - (spacing - dotSize);
      const startX = x + br.w/2 - totalW/2;
      const cy = y + br.h - 7;
      for (let i = 0; i < dots; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(startX + i * spacing + 1, cy + 1, dotSize, dotSize);
        ctx.fillStyle = '#fff';
        ctx.fillRect(startX + i * spacing, cy, dotSize, dotSize);
      }
    }

    // 9) Goldblock: animierter Stern
    if (br.kind === 'gold') {
      const t = performance.now() * 0.003 + br.shimmer;
      const a = 0.6 + Math.sin(t) * 0.4;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', x + br.w/2, y + br.h/2);
    }

    // 10) Powerup-Brick: nur subtiler funkelnder Punkt in der Ecke
    if (br.kind === 'power') {
      const t = performance.now() * 0.004 + br.shimmer;
      const a = 0.35 + Math.sin(t) * 0.35;
      // winziges schimmerndes Pixel oben rechts
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x + br.w - 6, y + 3, 2, 2);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.5})`;
      ctx.fillRect(x + br.w - 7, y + 4, 1, 1);
      ctx.fillRect(x + br.w - 5, y + 4, 1, 1);
      ctx.fillRect(x + br.w - 6, y + 2, 1, 1);
      ctx.fillRect(x + br.w - 6, y + 6, 1, 1);
    }

    // 11) Stahlblock: Schraffur / Nieten
    if (br.kind === 'wall') {
      // Vier Nieten in den Ecken
      const rivets = [
        [x + 5, y + 5], [x + br.w - 6, y + 5],
        [x + 5, y + br.h - 7], [x + br.w - 6, y + br.h - 7]
      ];
      for (const [rx, ry] of rivets) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(rx, ry + 1, 2, 0, Math.PI*2); ctx.fill();
        const rg = ctx.createRadialGradient(rx - 0.7, ry - 0.7, 0.3, rx, ry, 2.2);
        rg.addColorStop(0, '#fff');
        rg.addColorStop(0.5, '#a0a4b4');
        rg.addColorStop(1, '#3a3c4a');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(rx, ry, 2.2, 0, Math.PI*2); ctx.fill();
      }
      // Schraffur Mitte
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 10; i < br.w - 10; i += 4) {
        ctx.moveTo(x + i, y + 10);
        ctx.lineTo(x + i + 4, y + br.h - 10);
      }
      ctx.stroke();
    }
  }

  function drawPaddle() {
    const p = state.paddle;
    const x = p.x - p.w/2, y = p.y - p.h/2;
    const r = p.h / 2;

    // Schlagschatten
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x + 3, y + 4, p.w, p.h, r, true, false);

    // Hauptkörper - mehrstufiger metallischer Verlauf (keine separate Tiefenkante)
    const body = ctx.createLinearGradient(x, y, x, y + p.h);
    body.addColorStop(0,    '#a4f5ff');
    body.addColorStop(0.3,  '#5cc8ff');
    body.addColorStop(0.55, '#3a6aff');
    body.addColorStop(0.85, '#1a2580');
    body.addColorStop(1,    '#0f1640');
    ctx.fillStyle = body;
    roundRect(ctx, x, y, p.w, p.h, r, true, false);

    // 3) Glas-Highlight oben
    const hi = ctx.createLinearGradient(x, y, x, y + p.h * 0.5);
    hi.addColorStop(0, 'rgba(255,255,255,0.7)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    roundRect(ctx, x + 6, y + 3, p.w - 12, p.h * 0.4, r - 3, true, false);

    // 4) Energie-Kern in der Mitte (pulsierend, türkis-magenta)
    const pulse = 0.6 + Math.sin(performance.now() * 0.006) * 0.4;
    const coreW = p.w * 0.4;
    const coreX = p.x - coreW/2;
    const coreY = y + p.h/2 - 3;
    const coreG = ctx.createLinearGradient(coreX, coreY, coreX + coreW, coreY);
    coreG.addColorStop(0,   `rgba(92,255,226,${pulse * 0.9})`);
    coreG.addColorStop(0.5, `rgba(255,255,255,${pulse})`);
    coreG.addColorStop(1,   `rgba(255,92,210,${pulse * 0.9})`);
    ctx.fillStyle = coreG;
    roundRect(ctx, coreX, coreY, coreW, 6, 3, true, false);

    // 5) Helle Bevel-Kante oben
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + r, y + 2.5);
    ctx.lineTo(x + p.w - r, y + 2.5);
    ctx.stroke();

    // Laser-Geschütze nur bei aktivem Laser-Powerup
    if (state.laser.active) {
      [x + 9, x + p.w - 11].forEach(gx => {
        // Pylon
        ctx.fillStyle = '#3a1010';
        ctx.fillRect(gx - 2, y - 8, 6, 9);
        // Mündung mit Glow
        const mg = ctx.createRadialGradient(gx + 1, y - 6, 0, gx + 1, y - 6, 4);
        mg.addColorStop(0, '#fff');
        mg.addColorStop(0.4, '#ff5c5c');
        mg.addColorStop(1, 'rgba(255,92,92,0)');
        ctx.fillStyle = mg;
        ctx.fillRect(gx - 4, y - 11, 10, 8);
      });
    }
  }

  function drawBall(b) {
    const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.5, '#fff36b');
    g.addColorStop(1, '#ff8a3d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fill();
  }

  function drawPowerup(p) {
    const col = POWER_COLORS[p.type];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(performance.now() * 0.005) * 0.15);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -p.w/2 + 2, -p.h/2 + 2, p.w, p.h, 6, true, false);
    const g = ctx.createLinearGradient(0, -p.h/2, 0, p.h/2);
    g.addColorStop(0, col);
    g.addColorStop(1, '#222');
    ctx.fillStyle = g;
    roundRect(ctx, -p.w/2, -p.h/2, p.w, p.h, 6, true, false);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWER_LABELS[p.type], 0, 1);
    ctx.restore();
  }

  // === Amiga-HUD und Wände ====================================
  // Hit-Bereiche für die Canvas-Buttons (für Click-Erkennung)
  const hudButtons = { pause: null, sound: null };

  function drawHUD() {
    const t = performance.now();

    // 1) Copper-Bar-Hintergrund: horizontale Regenbogenstreifen (integer-aligned -> kein Flackern)
    // 8 Streifen à 7 px = 56 px (genau HUD_H)
    const stripes = [
      '#2a0055', '#6a00aa', '#a020c0', '#ff5ca0',
      '#ffb84a', '#ff8a5c', '#a020c0', '#3a0066',
    ];
    const stripeH = 7;
    // Animation: ganzzahliger Versatz, 2 px/sekunde, scrollt sanft
    const offsetPx = Math.floor(t * 0.002) % stripeH;
    const totalStripes = Math.ceil(HUD_H / stripeH) + 2;
    for (let i = -1; i < totalStripes; i++) {
      const y = Math.floor(i * stripeH - offsetPx);
      const idx = ((i % stripes.length) + stripes.length) % stripes.length;
      ctx.fillStyle = stripes[idx];
      ctx.fillRect(0, y, W, stripeH);
    }

    // 2) Dunkles Overlay für besseren Text-Kontrast (außer in den Buttons)
    ctx.fillStyle = 'rgba(10,5,20,0.45)';
    ctx.fillRect(0, 0, W, HUD_H);

    // 3) Chrom-Rahmen oben und unten (3D-Bevel)
    // Oberkante: heller Streifen
    const topG = ctx.createLinearGradient(0, 0, 0, 4);
    topG.addColorStop(0, '#ffffff');
    topG.addColorStop(1, '#9aa4c0');
    ctx.fillStyle = topG;
    ctx.fillRect(0, 0, W, 3);
    // Unterkante: chromartiger Übergang zur Wand
    const botG = ctx.createLinearGradient(0, HUD_H - 6, 0, HUD_H);
    botG.addColorStop(0, '#6a7290');
    botG.addColorStop(0.5, '#3a4060');
    botG.addColorStop(1, '#10142a');
    ctx.fillStyle = botG;
    ctx.fillRect(0, HUD_H - 6, W, 6);

    // 4) Felder (LEVEL · SCORE · LIVES · PAUSE · SOUND)
    const padX = 14;
    const cellY = 8;
    const cellH = HUD_H - 16;

    // Layout: drei Info-Felder links/mitte/rechts, zwei Buttons ganz rechts
    const btnSize = 36;
    const btnGap = 6;
    const btnAreaW = btnSize * 2 + btnGap + 6;
    const infoW = W - btnAreaW - padX * 2;
    const infoCellW = infoW / 3;

    drawHudCell(padX,                          cellY, infoCellW - 4, cellH, 'LEVEL', String(state.level));
    drawHudCell(padX + infoCellW,              cellY, infoCellW - 4, cellH, 'SCORE', String(state.score));
    drawHudCell(padX + infoCellW * 2,          cellY, infoCellW - 4, cellH, 'LIVES', '♥'.repeat(Math.max(0, state.lives)) || '–');

    // Buttons rechts: Pause · SFX · Musik
    const btnX1 = W - padX - btnSize * 3 - btnGap * 2;
    const btnX2 = W - padX - btnSize * 2 - btnGap;
    const btnX3 = W - padX - btnSize;
    const btnY = cellY + (cellH - btnSize) / 2;
    drawHudButton(btnX1, btnY, btnSize, state.paused ? '▶' : 'II', 'pause', false);
    drawHudButton(btnX2, btnY, btnSize, '🔊', 'sfx', Audio16.isSfxMuted());
    drawHudButton(btnX3, btnY, btnSize, '♪',  'music', Audio16.isMusicMuted());
    hudButtons.pause = { x: btnX1, y: btnY, w: btnSize, h: btnSize };
    hudButtons.sfx   = { x: btnX2, y: btnY, w: btnSize, h: btnSize };
    hudButtons.music = { x: btnX3, y: btnY, w: btnSize, h: btnSize };
  }

  function drawHudCell(x, y, w, h, label, value) {
    // Eingelassener metallischer Look
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#10162a');
    g.addColorStop(1, '#1a2238');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 6, true, false);

    // Dunkle Inset-Kante oben
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 1); ctx.lineTo(x + w - 4, y + 1);
    ctx.stroke();
    // Helle Kante unten
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h - 1); ctx.lineTo(x + w - 4, y + h - 1);
    ctx.stroke();

    // Label: gleicher spaciger Gold-Stil, nur kleiner
    const labelY = y + 4;
    ctx.font = 'bold 12px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelGrad = ctx.createLinearGradient(0, labelY, 0, labelY + 12);
    labelGrad.addColorStop(0,   '#fff7c4');
    labelGrad.addColorStop(0.5, '#ffd54a');
    labelGrad.addColorStop(1,   '#c4781a');
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.strokeText(label, x + w/2, labelY);
    ctx.fillStyle = labelGrad;
    ctx.fillText(label, x + w/2, labelY);

    // Wert: großer Gold-Metallic-Gradient mit dunkler Outline
    const vy = y + h - 6;
    ctx.font = 'bold 22px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const grad = ctx.createLinearGradient(0, y + 18, 0, y + h);
    grad.addColorStop(0,   '#fff7c4');
    grad.addColorStop(0.4, '#ffd54a');
    grad.addColorStop(0.7, '#ff8a3d');
    grad.addColorStop(1,   '#8a4010');
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(value, x + w/2, vy);
    ctx.fillStyle = grad;
    ctx.fillText(value, x + w/2, vy);
  }

  function drawHudButton(x, y, size, label, kind, disabled) {
    // Metallischer Knopf - bei "disabled" entsättigt/dunkler
    const g = ctx.createLinearGradient(x, y, x, y + size);
    if (disabled) {
      g.addColorStop(0, '#5a5e6a');
      g.addColorStop(0.5, '#3a3e4a');
      g.addColorStop(1, '#1a1e2a');
    } else {
      g.addColorStop(0, '#d8dce8');
      g.addColorStop(0.5, '#8a92aa');
      g.addColorStop(1, '#3a4060');
    }
    ctx.fillStyle = g;
    roundRect(ctx, x, y, size, size, 6, true, false);
    // Inset
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.stroke();
    // Glanz oben
    ctx.fillStyle = `rgba(255,255,255,${disabled ? 0.15 : 0.4})`;
    roundRect(ctx, x + 3, y + 3, size - 6, size * 0.3, 3, true, false);
    // Symbol
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = disabled ? '#5a6080' : '#101428';
    ctx.fillText(label, x + size/2, y + size/2 + 1);
    // Roter Diagonalstrich bei "stumm"
    if (disabled) {
      ctx.strokeStyle = '#ff3a3a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 6, y + size - 6);
      ctx.lineTo(x + size - 6, y + 6);
      ctx.stroke();
    }
  }

  function drawWalls() {
    // === Obere Wand ============================================
    const wy = WALL_TOP;
    const wh = WALL_THICK;

    // Basisplatte mit metallischem Vertikal-Gradient
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0,    '#9aa0b8');
    g.addColorStop(0.4,  '#5a607a');
    g.addColorStop(0.6,  '#3a4060');
    g.addColorStop(1,    '#181c30');
    ctx.fillStyle = g;
    ctx.fillRect(0, wy, W, wh);

    // Helle Kante oben (Bevel)
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, wy, W, 2);
    // Dunkle Kante unten
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, wy + wh - 2, W, 2);

    // Diagonale Schraffur (Gefahrenstreifen)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, wy + 4, W, wh - 8);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let xx = -wh; xx < W + wh; xx += 12) {
      ctx.moveTo(xx, wy);
      ctx.lineTo(xx + wh, wy + wh);
    }
    ctx.stroke();
    ctx.restore();

    // Nieten alle ~80 Pixel
    for (let xx = 24; xx < W - 10; xx += 80) {
      drawRivet(xx, wy + wh/2);
    }

    // === Seitenwände (dünner, dekorativ) =======================
    const sw = 5;
    const sy = wy + wh;
    const sh = PLAYFIELD_BOTTOM - sy + 30;
    [0, W - sw].forEach(sx => {
      const sg = ctx.createLinearGradient(sx, 0, sx + sw, 0);
      sg.addColorStop(0,   '#5a607a');
      sg.addColorStop(0.5, '#3a4060');
      sg.addColorStop(1,   '#181c30');
      ctx.fillStyle = sg;
      ctx.fillRect(sx, sy, sw, sh);
      // Helle Kante innen
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(sx === 0 ? sw - 1 : sx, sy, 1, sh);
    });
  }

  function drawRivet(cx, cy) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.arc(cx + 1, cy + 1, 3, 0, Math.PI*2); ctx.fill();
    const rg = ctx.createRadialGradient(cx - 1, cy - 1, 0.3, cx, cy, 3);
    rg.addColorStop(0, '#fff');
    rg.addColorStop(0.5, '#a0a8c0');
    rg.addColorStop(1, '#2a3050');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (w < 2*r) r = w/2;
    if (h < 2*r) r = h/2;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // HUD wird komplett im Canvas gezeichnet (siehe drawHUD)
  function updateHUD() { /* no-op: canvas-HUD aktualisiert sich jeden Frame */ }

  // === Overlay ================================================
  const overlay = document.getElementById('overlay');
  const panelTitle = overlay.querySelector('h1');
  const panelTagline = overlay.querySelector('.tagline');
  const btnStart = document.getElementById('btn-start');
  const btnContinue = document.getElementById('btn-continue');
  const startLevelInput = document.getElementById('start-level');

  function hideOverlay() { overlay.classList.remove('show'); }
  function showOverlay(title, msg, onContinue, autoHide, btnLabel) {
    panelTitle.textContent = title;
    panelTagline.innerHTML = msg;
    btnStart.style.display = 'none';
    btnContinue.style.display = 'block';
    btnContinue.textContent = btnLabel || 'Weiter';
    btnContinue.onclick = () => {
      hideOverlay();
      if (onContinue) onContinue();
    };
    overlay.classList.add('show');
    if (autoHide) {
      setTimeout(() => {
        if (overlay.classList.contains('show')) btnContinue.onclick();
      }, 1500);
    }
  }

  btnStart.addEventListener('click', () => {
    const lvl = Math.max(1, Math.min(LEVELS.length, parseInt(startLevelInput.value, 10) || 1));
    state.level = lvl;
    state.score = 0;
    state.lives = 3;
    Audio16.resume();
    loadLevel(lvl);
    Audio16.startMusic(lvl);
    hideOverlay();
    state.running = true;
  });

  function togglePause() {
    if (!state.running && !state.paused) return;
    state.paused = !state.paused;
    if (state.paused) Audio16.stopMusic();
    else Audio16.startMusic(state.level);
  }
  function toggleSfx() {
    Audio16.setSfxMuted(!Audio16.isSfxMuted());
  }
  function toggleMusic() {
    const newMuted = !Audio16.isMusicMuted();
    Audio16.setMusicMuted(newMuted);
    if (!newMuted && state.running) Audio16.startMusic(state.level);
  }

  // === Game Loop ==============================================
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(33, t - lastT);
    lastT = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // initial Position
  state.paddle.x = W/2;
  state.balls = [makeBall()];
  updateHUD();
})();
