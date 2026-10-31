(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ui = {
    hud: $('hud'), score: $('score'), streak: $('streak'), lightFill: $('lightFill'),
    wrap: $('panelWrap'), title: $('panelTitle'), text: $('panelText'), rules: $('rules'),
    play: $('playBtn'), best: $('best'), install: $('installBtn'),
    pause: $('pauseBtn'), mute: $('muteBtn'),
  };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const mix = (c1, c2, t) =>
    `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;

  // ---------- Skins ----------

  // Hacking these is the point: there is no server and no payment behind them.
  const SKINS = {
    fox: { label: 'Golden Fox', tail: '#ee7428', body: '#f5822e' },
    gold: { label: 'Golden Fox', tail: '#e0a016', body: '#ffc53d' },
    shadow: { label: 'Shadow Fox', tail: '#2f2a55', body: '#463d78' },
    snow: { label: 'Snow Fox', tail: '#d8dcec', body: '#f2f4fb' },
  };
  const SKIN_NAMES = Object.keys(SKINS);
  const savedSkin = store.get('foxdusk-skin');
  let skin = SKIN_NAMES.includes(savedSkin) ? savedSkin : 'fox';

  function syncSkin() {
    const hacked = skin !== 'fox';
    $('skinName').textContent = `${SKINS[skin].label} skin`;
    $('skinPrice').textContent = hacked ? 'Hacked: USD 0' : 'USD 30,000';
    $('skinHint').textContent = hacked ? 'Nice work. Keep it, it is yours.' : 'Too pricey? Try hacking it.';
  }

  function setSkin(name) {
    if (!SKIN_NAMES.includes(name)) return `Unknown skin. Try: ${SKIN_NAMES.join(', ')}`;
    skin = name;
    store.set('foxdusk-skin', name);
    syncSkin();
    return `Skin set to ${name}.`;
  }

  window.foxdusk = {
    skins: SKIN_NAMES,
    skin: setSkin,
    grow: (amount = MAX_MIGHT) => { addMight(amount); return `Fox level ${foxLevel()}.`; },
    power: (type) => (POWER_TYPES.includes(type) ? (grabPower(type), `${type} on.`) : `Try: ${POWER_TYPES.join(', ')}`),
    night: (n) => (state === 'playing' && n > 0 ? (nextNight(n), `Night ${n}.`) : 'Start a game, then pick a night above 0.'),
  };
  console.log("Foxdusk: that skin costs USD 30,000. Or run foxdusk.skin('gold'). See foxdusk.skins for more.");

  // Keyboard hack: type "goldfox". Touch hack: tap the skin icon 7 times to change skin.
  let typed = '';
  addEventListener('keydown', (e) => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-7);
    if (typed === 'goldfox') setSkin('gold');
  });

  let iconTaps = 0;
  $('skinIcon').addEventListener('click', () => {
    iconTaps++;
    if (iconTaps % 7 === 0) setSkin(SKIN_NAMES[(SKIN_NAMES.indexOf(skin) + 1) % SKIN_NAMES.length]);
  });

  // ---------- Scene layout ----------

  let W = 0, H = 0, groundY = 0, unit = 1;
  let stars = [];

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // The canvas box, not innerWidth/Height, which can disagree in an installed app.
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H * 0.84;
    unit = clamp(Math.min(W, H) / 600, 0.65, 1.3);
    stars = Array.from({ length: 90 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.65,
      r: rand(0.5, 1.6),
      phase: rand(0, 6.28),
    }));
    fox.x = clamp(fox.x || W / 2, 0, W);
    target.x = fox.x;
  }

  // ---------- Game state ----------

  const fox = { x: 0, dir: 1, run: 0, moving: false, hurt: 0, scale: 1 };
  const target = { x: 0 };
  const keys = { left: false, right: false };

  let state = 'menu'; // menu | playing | paused | over
  let score = 0, streak = 0, light = 70, elapsed = 0;
  let best = Number(store.get('foxdusk-best')) || 0;
  let flies = [], owls = [], sparks = [], popups = [], pickups = [];
  let flyTimer = 0, owlTimer = 0, powerTimer = 0, shake = 0, clock = 0;
  let night = 1, nightCaught = 0, banner = null;
  const powers = { shield: false, magnet: 0, slow: 0 };

  const POWER_TYPES = ['shield', 'magnet', 'slow'];
  const POWER_COLORS = { shield: '110,190,255', magnet: '255,110,170', slow: '120,240,200' };

  // Might grows with every catch: a bigger, faster, tougher fox, and an easier target.
  const MAX_MIGHT = 40;
  let might = 0;
  const mightRatio = () => might / MAX_MIGHT;
  const foxLevel = () => Math.min(5, 1 + Math.floor(might / 10));
  const foxCenterY = () => groundY - 24 * unit * fox.scale;

  function addMight(amount) {
    const before = foxLevel();
    might = clamp(might + amount, 0, MAX_MIGHT);
    if (foxLevel() > before) {
      const text = might >= MAX_MIGHT ? 'MAX! Owls fear you' : `Level ${foxLevel()}!`;
      popups.push({ x: fox.x, y: foxCenterY() - 60 * unit * fox.scale, text, life: 1.2 });
      audio.power();
    }
  }

  const multiplier = () => (streak >= 10 ? 3 : streak >= 5 ? 2 : 1);
  const nightGoal = () => 6 + night * 4;
  const difficulty = () => clamp((night - 1) / 7, 0, 1);

  function start() {
    score = 0; streak = 0; light = 100; elapsed = 0;
    flies = []; owls = []; sparks = []; popups = []; pickups = [];
    flyTimer = 0.2; owlTimer = 4; powerTimer = 7; shake = 0;
    fox.hurt = 0;
    might = 0;
    night = 1; nightCaught = 0;
    powers.shield = false; powers.magnet = 0; powers.slow = 0;
    banner = { title: 'Night 1', text: `Catch ${nightGoal()} fireflies`, life: 2.2 };
    state = 'playing';
    ui.wrap.hidden = true;
    ui.hud.hidden = false;
    syncHud();
    audio.unlock();
    canvas.focus?.();
  }

  function showPanel(title, text, button, showRules) {
    ui.title.textContent = title;
    ui.text.textContent = text;
    ui.play.textContent = button;
    ui.rules.hidden = !showRules;
    $('skin').hidden = state === 'paused';
    ui.best.textContent = best ? `Best score: ${best}` : '';
    ui.wrap.hidden = false;
    ui.play.focus({ preventScroll: true });
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    showPanel('Paused', 'The fireflies will wait for you.', 'Resume', false);
  }

  function resume() {
    state = 'playing';
    ui.wrap.hidden = true;
  }

  function gameOver() {
    state = 'over';
    audio.over();
    const isBest = score > best;
    if (isBest) {
      best = score;
      store.set('foxdusk-best', String(best));
    }
    ui.hud.hidden = true;
    const seconds = Math.round(elapsed);
    showPanel(
      isBest && score > 0 ? 'New best!' : 'Night fell',
      `You scored ${score} and reached night ${night}, holding off the dark for ${seconds} seconds.`,
      'Play again',
      false,
    );
  }

  function syncHud() {
    ui.score.textContent = score;
    ui.streak.textContent = multiplier() > 1 ? `· ×${multiplier()}` : '';
    ui.lightFill.style.transform = `scaleX(${light / 100})`;
    $('mission').textContent = `Night ${night} · ${nightCaught}/${nightGoal()} caught`;
    const active = [`Fox Lv ${might >= MAX_MIGHT ? 'MAX' : foxLevel()}`];
    if (powers.shield) active.push('Shield');
    if (powers.magnet > 0) active.push(`Magnet ${Math.ceil(powers.magnet)}s`);
    if (powers.slow > 0) active.push(`Slow ${Math.ceil(powers.slow)}s`);
    $('powers').textContent = active.join(' · ');
  }

  function nextNight(to = night + 1) {
    const bonus = night * 10;
    night = to;
    nightCaught = 0;
    score += bonus;
    light = Math.min(100, light + 30);
    const extra = night === 2 ? 'Watch out for purple wisps' : night === 4 ? 'Owls now hunt in pairs' : `Catch ${nightGoal()} fireflies`;
    banner = { title: `Night ${night}`, text: `+${bonus} · ${extra}`, life: 2.4 };
    audio.night();
  }

  function grabPower(type) {
    if (type === 'shield') powers.shield = true;
    if (type === 'magnet') powers.magnet = 7;
    if (type === 'slow') powers.slow = 6;
    audio.power();
  }

  function hurtFox(amount) {
    if (fox.hurt > 0) return;
    const foxY = foxCenterY();
    if (powers.shield) {
      powers.shield = false;
      fox.hurt = 1;
      burst(fox.x, foxY, '#6ebeff', 16);
      popups.push({ x: fox.x, y: foxY - 44 * unit, text: 'Blocked!', life: 0.9 });
      audio.power();
      return;
    }
    // A strong fox takes up to half damage, but every hit costs some of its size.
    light -= amount * (1 - mightRatio() * 0.5);
    addMight(-6);
    streak = 0;
    fox.hurt = 1.3;
    if (!reducedMotion) shake = 0.3;
    burst(fox.x, foxY, '#ff8a3d', 16);
    audio.hit();
  }

  // ---------- Update ----------

  function spawnFly() {
    const playing = state === 'playing';
    const wisp = playing && night >= 2 && Math.random() < Math.min(0.1 + night * 0.025, 0.3);
    const gold = playing && !wisp && Math.random() < 0.1;
    flies.push({
      x: rand(W * 0.06, W * 0.94),
      y: -20,
      // Timed against screen height so tall phones are not slower than laptops.
      vy: (groundY / rand(3.2, 5.2)) * (1 + difficulty() * 0.75),
      phase: rand(0, 6.28),
      sway: rand(10, 28),
      gold,
      wisp,
    });
  }

  function spawnPickup() {
    pickups.push({
      type: POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)],
      x: rand(W * 0.1, W * 0.9),
      y: -20,
      vy: groundY / 4.5,
      phase: rand(0, 6.28),
    });
  }

  function spawnOwl(aimed = true) {
    const x = aimed ? clamp(fox.x + rand(-W * 0.12, W * 0.12), 30, W - 30) : rand(30, W - 30);
    const fromLeft = Math.random() < 0.5;
    owls.push({
      targetX: x,
      startX: x + (fromLeft ? -1 : 1) * Math.max(W * 0.6, 320),
      warn: lerp(1.15, 0.7, difficulty()),
      p: 0,
      x: -999,
      y: -999,
      dir: fromLeft ? 1 : -1,
    });
  }

  function burst(x, y, color, count) {
    if (reducedMotion) count = Math.min(count, 3);
    for (let i = 0; i < count; i++) {
      const a = rand(0, 6.28), s = rand(30, 140);
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
    }
  }

  function moveFox(dt) {
    const previous = fox.x;
    if (keys.left || keys.right) {
      target.x = clamp(fox.x + (keys.right ? 1 : -1) * 90, 0, W);
    }
    if (state === 'menu') {
      target.x = W / 2 + Math.sin(clock * 0.35) * W * 0.28;
    }
    // Keeps the whole fox, tail and snout included, on screen.
    fox.scale += (1 + mightRatio() * 0.9 - fox.scale) * Math.min(1, dt * 6);
    const margin = Math.min(60 * unit * fox.scale, W / 2);
    target.x = clamp(target.x, margin, W - margin);
    const maxStep = 720 * unit * (1 + mightRatio() * 0.3) * dt;
    fox.x += clamp((target.x - fox.x) * Math.min(1, dt * 12), -maxStep, maxStep);
    const speed = Math.abs(fox.x - previous) / Math.max(dt, 0.001);
    fox.moving = speed > 12;
    if (fox.moving) {
      fox.dir = fox.x > previous ? 1 : -1;
      fox.run += dt * clamp(speed / 22, 6, 20);
    }
    fox.hurt = Math.max(0, fox.hurt - dt);
  }

  function update(dt) {
    clock += dt;
    const playing = state === 'playing';
    if (!playing && state !== 'menu') return;

    moveFox(dt);
    if (playing) elapsed += dt;
    const level = difficulty();
    powers.magnet = Math.max(0, powers.magnet - dt);
    powers.slow = Math.max(0, powers.slow - dt);
    // Slow time affects the world, never the fox.
    const worldDt = powers.slow > 0 ? dt * 0.45 : dt;

    flyTimer -= worldDt;
    if (flyTimer <= 0) {
      spawnFly();
      flyTimer = playing ? lerp(0.85, 0.34, level) * rand(0.75, 1.25) : 1.1;
    }

    if (playing) {
      owlTimer -= worldDt;
      if (owlTimer <= 0) {
        spawnOwl();
        if (night >= 4) spawnOwl(false);
        owlTimer = lerp(4.6, 1.9, level) * rand(0.8, 1.2);
      }
      powerTimer -= dt;
      if (powerTimer <= 0) {
        spawnPickup();
        powerTimer = rand(9, 14);
      }
      light -= lerp(4.5, 8.5, level) * worldDt;
    }

    const foxY = foxCenterY();
    const catchRadius = 46 * unit * fox.scale;

    flies = flies.filter((f) => {
      f.y += f.vy * worldDt;
      f.phase += worldDt * 2.4;
      if (powers.magnet > 0 && !f.wisp) {
        f.x += clamp(fox.x - f.x, -1, 1) * 280 * unit * dt;
      }
      f.drawX = f.x + Math.sin(f.phase) * f.sway;
      const caught = Math.hypot(f.drawX - fox.x, f.y - foxY) < catchRadius;
      if (caught && playing && f.wisp) {
        burst(f.drawX, f.y, '#b06bff', 10);
        hurtFox(14);
        return false;
      }
      if (caught && playing) {
        streak++;
        nightCaught++;
        addMight(f.gold ? 3 : 1);
        const points = (f.gold ? 5 : 1) * multiplier();
        score += points;
        light = Math.min(100, light + (f.gold ? 26 : 9));
        burst(f.drawX, f.y, f.gold ? '#ffc53d' : '#ffe27a', f.gold ? 14 : 7);
        popups.push({ x: f.drawX, y: f.y - 8, text: `+${points}`, life: 0.8 });
        audio.catch(f.gold, streak);
        if (nightCaught >= nightGoal()) nextNight();
        return false;
      }
      if (f.y > groundY + 6) {
        if (playing && !f.wisp) streak = 0;
        return false;
      }
      return true;
    });

    pickups = pickups.filter((u) => {
      u.y += u.vy * worldDt;
      u.phase += dt * 3;
      if (Math.hypot(u.x - fox.x, u.y - foxY) < catchRadius) {
        grabPower(u.type);
        burst(u.x, u.y, `rgb(${POWER_COLORS[u.type]})`, 12);
        const names = { shield: 'Shield!', magnet: 'Magnet!', slow: 'Slow time!' };
        popups.push({ x: u.x, y: u.y - 14, text: names[u.type], life: 0.9 });
        return false;
      }
      return u.y < groundY + 6;
    });

    owls = owls.filter((o) => {
      if (o.warn > 0) {
        const before = o.warn;
        o.warn -= worldDt;
        if (playing && before > 0 && o.warn <= 0) audio.owl();
        return true;
      }
      o.p += worldDt / 1.25;
      if (o.p >= 1) return false;
      const arc = 1 - (2 * o.p - 1) ** 2;
      o.x = lerp(o.startX, o.startX + (o.targetX - o.startX) * 2, o.p);
      o.y = lerp(-70, groundY - 26 * unit, arc);
      if (playing && Math.hypot(o.x - fox.x, o.y - foxY) < 44 * unit * (1 + (fox.scale - 1) * 0.6)) {
        if (might >= MAX_MIGHT) {
          score += 10;
          burst(o.x, o.y, '#ffd34d', 18);
          popups.push({ x: o.x, y: o.y - 20, text: 'Owl swatted! +10', life: 1 });
          audio.power();
          return false;
        }
        hurtFox(22);
      }
      return true;
    });

    sparks = sparks.filter((s) => {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt; s.life -= dt;
      return s.life > 0;
    });
    popups = popups.filter((p) => {
      p.y -= 34 * dt; p.life -= dt;
      return p.life > 0;
    });
    shake = Math.max(0, shake - dt);
    if (banner) {
      banner.life -= dt;
      if (banner.life <= 0) banner = null;
    }

    if (playing) {
      syncHud();
      if (light <= 0) {
        light = 0;
        syncHud();
        gameOver();
      }
    }
  }

  // ---------- Draw ----------

  const SKY_DUSK = [[64, 40, 110], [214, 86, 104], [255, 170, 94]];
  const SKY_NIGHT = [[9, 8, 32], [24, 18, 62], [52, 32, 92]];

  function drawSky(n) {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    SKY_DUSK.forEach((c, i) => sky.addColorStop(i / 2, mix(c, SKY_NIGHT[i], n)));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#fff4df';
    for (const s of stars) {
      ctx.globalAlpha = clamp(n * 1.5 - 0.15, 0, 1) * (0.55 + 0.45 * Math.sin(clock * 1.5 + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The sun sinks behind the hills as the light drains.
    const sunY = lerp(groundY * 0.62, groundY * 1.05, n);
    const sunR = 58 * unit;
    const halo = ctx.createRadialGradient(W * 0.68, sunY, sunR * 0.4, W * 0.68, sunY, sunR * 4);
    halo.addColorStop(0, `rgba(255,200,120,${0.5 * (1 - n)})`);
    halo.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = mix([255, 214, 140], [190, 90, 80], n);
    ctx.beginPath();
    ctx.arc(W * 0.68, sunY, sunR, 0, 6.28);
    ctx.fill();
  }

  function drawHill(base, amp, freq, offset, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) {
      const y = base + Math.sin(x * freq + offset) * amp + Math.sin(x * freq * 2.3 + offset * 2) * amp * 0.35;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawLand(n) {
    drawHill(groundY * 0.8, 34 * unit, 0.004, 1.2, mix([120, 58, 110], [28, 22, 66], n));
    drawHill(groundY * 0.9, 24 * unit, 0.007, 3.4, mix([78, 38, 88], [18, 15, 48], n));
    ctx.fillStyle = mix([46, 26, 62], [11, 10, 32], n);
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.beginPath();
    for (let x = 0; x < W; x += 13) {
      const h = 7 + ((x * 7) % 9);
      ctx.moveTo(x, groundY + 1);
      ctx.lineTo(x + 3, groundY - h * unit);
      ctx.lineTo(x + 7, groundY + 1);
    }
    ctx.fill();
  }

  function drawFox() {
    if (fox.hurt > 0 && Math.floor(fox.hurt * 12) % 2) return;
    ctx.save();
    ctx.translate(fox.x, groundY);
    ctx.scale(fox.dir * unit * fox.scale, unit * fox.scale);

    const step = fox.moving ? Math.sin(fox.run) : 0;
    const bob = fox.moving ? Math.abs(step) * 2 : Math.sin(clock * 2) * 0.6;

    // Legs
    ctx.strokeStyle = '#3a1d18';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    [[-15, 1], [-9, -1], [11, -1], [17, 1]].forEach(([x, side]) => {
      ctx.beginPath();
      ctx.moveTo(x, -17);
      ctx.lineTo(x + step * side * 7, -2);
      ctx.stroke();
    });

    ctx.translate(0, -bob);

    // Tail
    const wag = Math.sin(clock * (fox.moving ? 9 : 2.5)) * 4;
    ctx.fillStyle = SKINS[skin].tail;
    ctx.beginPath();
    ctx.moveTo(-18, -29);
    ctx.quadraticCurveTo(-40, -46 + wag, -56, -36 + wag);
    ctx.quadraticCurveTo(-44, -14 + wag, -17, -20);
    ctx.fill();
    ctx.fillStyle = '#fff4df';
    ctx.beginPath();
    ctx.moveTo(-44, -41 + wag);
    ctx.quadraticCurveTo(-52, -41 + wag, -56, -36 + wag);
    ctx.quadraticCurveTo(-52, -28 + wag, -44, -24 + wag);
    ctx.quadraticCurveTo(-48, -32 + wag, -44, -41 + wag);
    ctx.fill();

    // Body
    ctx.fillStyle = SKINS[skin].body;
    ctx.beginPath();
    ctx.ellipse(0, -26, 24, 13, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#fff4df';
    ctx.beginPath();
    ctx.ellipse(14, -21, 10, 7, -0.4, 0, 6.28);
    ctx.fill();

    // Head
    ctx.fillStyle = SKINS[skin].body;
    ctx.beginPath();
    ctx.moveTo(14, -36);
    ctx.lineTo(17, -58); // back ear
    ctx.lineTo(25, -46);
    ctx.lineTo(32, -58); // front ear
    ctx.lineTo(36, -42);
    ctx.lineTo(50, -32); // snout
    ctx.lineTo(32, -24);
    ctx.lineTo(16, -27);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff4df';
    ctx.beginPath();
    ctx.moveTo(28, -33);
    ctx.lineTo(50, -32);
    ctx.lineTo(32, -24);
    ctx.lineTo(20, -27);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a1204';
    ctx.beginPath();
    ctx.arc(49, -32, 2.8, 0, 6.28);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(33, -38, 2.2, 0, 6.28);
    ctx.fill();

    ctx.restore();
  }

  function drawDarkness() {
    const radius = lerp(95, Math.max(W, H) * 1.05, (light / 100) ** 1.3) * (state === 'menu' ? 2 : 1);
    const cy = groundY - 30 * unit;
    const dark = ctx.createRadialGradient(fox.x, cy, radius * 0.25, fox.x, cy, radius);
    dark.addColorStop(0, 'rgba(6,5,22,0)');
    dark.addColorStop(1, 'rgba(6,5,22,0.9)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H);
  }

  function drawWisp(f) {
    const x = f.drawX ?? f.x;
    const size = 24 * unit * (0.85 + 0.15 * Math.sin(clock * 9 + f.phase));
    const glow = ctx.createRadialGradient(x, f.y, size * 0.2, x, f.y, size);
    glow.addColorStop(0, 'rgba(176,107,255,0.95)');
    glow.addColorStop(1, 'rgba(176,107,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - size, f.y - size, size * 2, size * 2);
    ctx.fillStyle = '#17082e';
    ctx.beginPath();
    ctx.arc(x, f.y, 6 * unit, 0, 6.28);
    ctx.fill();
  }

  function drawPickup(u) {
    const r = 17 * unit;
    const y = u.y + Math.sin(u.phase) * 3;
    const color = POWER_COLORS[u.type];
    const glow = ctx.createRadialGradient(u.x, y, r * 0.6, u.x, y, r * 2);
    glow.addColorStop(0, `rgba(${color},0.55)`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(u.x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.fillStyle = `rgb(${color})`;
    ctx.beginPath();
    ctx.arc(u.x, y, r, 0, 6.28);
    ctx.fill();

    ctx.save();
    ctx.translate(u.x, y);
    ctx.scale(unit, unit);
    ctx.fillStyle = ctx.strokeStyle = '#17102f';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (u.type === 'shield') {
      ctx.moveTo(0, -10);
      ctx.lineTo(9, -6);
      ctx.quadraticCurveTo(9, 6, 0, 11);
      ctx.quadraticCurveTo(-9, 6, -9, -6);
      ctx.closePath();
      ctx.fill();
    } else if (u.type === 'magnet') {
      ctx.arc(0, 0, 7, 0, Math.PI);
      ctx.moveTo(-7, 0);
      ctx.lineTo(-7, -9);
      ctx.moveTo(7, 0);
      ctx.lineTo(7, -9);
      ctx.stroke();
    } else {
      ctx.arc(0, 0, 9, 0, 6.28);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -6);
      ctx.moveTo(0, 0);
      ctx.lineTo(4, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFoxAura() {
    if (!powers.shield && powers.magnet <= 0) return;
    const y = groundY - 30 * unit * fox.scale;
    ctx.lineWidth = 3;
    if (powers.shield) {
      ctx.strokeStyle = `rgba(${POWER_COLORS.shield},0.85)`;
      ctx.beginPath();
      ctx.arc(fox.x, y, 58 * unit * fox.scale, 0, 6.28);
      ctx.stroke();
    }
    if (powers.magnet > 0) {
      ctx.strokeStyle = `rgba(${POWER_COLORS.magnet},${0.35 + 0.3 * Math.sin(clock * 8)})`;
      ctx.beginPath();
      ctx.arc(fox.x, y, (70 + 8 * Math.sin(clock * 8)) * unit * fox.scale, 0, 6.28);
      ctx.stroke();
    }
  }

  function drawBanner() {
    if (!banner) return;
    ctx.globalAlpha = clamp(banner.life * 2, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff4df';
    ctx.font = `600 ${Math.round(46 * unit)}px "Iowan Old Style", Palatino, Georgia, serif`;
    ctx.fillText(banner.title, W / 2, H * 0.3);
    ctx.font = `600 ${Math.round(17 * unit)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(banner.text, W / 2, H * 0.3 + 32 * unit);
    ctx.globalAlpha = 1;
  }

  function drawFly(f) {
    if (f.wisp) { drawWisp(f); return; }
    const x = f.drawX ?? f.x;
    const pulse = 0.75 + 0.25 * Math.sin(clock * 7 + f.phase);
    const size = (f.gold ? 26 : 17) * unit * pulse;
    const color = f.gold ? '255,180,50' : '255,232,120';
    const glow = ctx.createRadialGradient(x, f.y, 0, x, f.y, size);
    glow.addColorStop(0, `rgba(${color},0.95)`);
    glow.addColorStop(0.3, `rgba(${color},0.4)`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - size, f.y - size, size * 2, size * 2);
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath();
    ctx.arc(x, f.y, (f.gold ? 3.6 : 2.4) * unit, 0, 6.28);
    ctx.fill();
  }

  function drawOwl(o) {
    if (o.warn > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 16);
      ctx.strokeStyle = `rgba(255,70,70,${0.55 + pulse * 0.45})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(o.targetX, groundY + 4, 44 * unit, 11 * unit, 0, 0, 6.28);
      ctx.stroke();
      return;
    }
    const flap = Math.sin(clock * 22) * 13;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.dir * unit, unit);
    ctx.fillStyle = '#4a3a66';
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.quadraticCurveTo(-30, -18 - flap, -50, -8 - flap);
    ctx.quadraticCurveTo(-30, 4 - flap * 0.3, -6, 8);
    ctx.moveTo(6, -8);
    ctx.quadraticCurveTo(30, -18 - flap, 50, -8 - flap);
    ctx.quadraticCurveTo(30, 4 - flap * 0.3, 6, 8);
    ctx.fill();
    ctx.fillStyle = '#5c4a7c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 22, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    [-7, 7].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, -8, 5.5, 0, 6.28);
      ctx.fill();
    });
    ctx.fillStyle = '#1b1238';
    [-6, 8].forEach((x) => {
      ctx.beginPath();
      ctx.arc(x, -8, 2.4, 0, 6.28);
      ctx.fill();
    });
    ctx.restore();
  }

  function draw() {
    const n = clamp(1 - light / 100, 0, 1);
    // Clears the edge left uncovered while the screen shakes.
    ctx.fillStyle = '#060516';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate(rand(-7, 7) * (shake / 0.3), rand(-7, 7) * (shake / 0.3));

    drawSky(n);
    drawLand(n);
    drawFox();
    drawDarkness();

    owls.forEach(drawOwl);
    flies.forEach(drawFly);
    pickups.forEach(drawPickup);
    drawFoxAura();

    for (const s of sparks) {
      ctx.globalAlpha = clamp(s.life * 2, 0, 1);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }
    ctx.textAlign = 'center';
    ctx.font = `700 ${Math.round(18 * unit)}px ui-sans-serif, system-ui, sans-serif`;
    for (const p of popups) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = '#fff4df';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    if (state === 'playing') drawBanner();
    ctx.restore();
  }

  // ---------- Sound ----------

  const audio = {
    ctx: null,
    muted: store.get('foxdusk-muted') === '1',
    unlock() {
      if (this.ctx) { this.ctx.resume?.(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    },
    tone(freq, duration, type = 'sine', volume = 0.08, slideTo) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration);
    },
    catch(gold, run) {
      this.tone(520 + Math.min(run, 14) * 32, 0.13, 'triangle');
      if (gold) this.tone(1040, 0.22, 'sine', 0.06);
    },
    owl() { this.tone(330, 0.3, 'sine', 0.05, 190); },
    hit() { this.tone(170, 0.32, 'sawtooth', 0.08, 60); },
    over() { this.tone(300, 0.8, 'triangle', 0.09, 70); },
    power() { this.tone(440, 0.25, 'sine', 0.08, 990); },
    night() { this.tone(392, 0.5, 'triangle', 0.08, 784); },
  };

  function syncMute() {
    ui.mute.setAttribute('aria-pressed', String(audio.muted));
    ui.mute.setAttribute('aria-label', audio.muted ? 'Turn sound on' : 'Mute sound');
  }

  // ---------- Input ----------

  canvas.addEventListener('pointerdown', (e) => {
    target.x = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (state === 'playing') target.x = e.clientX;
  });

  const keyMap = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  addEventListener('keydown', (e) => {
    if (keyMap[e.key]) {
      keys[keyMap[e.key]] = true;
      e.preventDefault();
    } else if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && state === 'playing') {
      pause();
    } else if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && state === 'paused') {
      resume();
    }
  });
  addEventListener('keyup', (e) => {
    if (keyMap[e.key]) {
      keys[keyMap[e.key]] = false;
      if (!keys.left && !keys.right) target.x = fox.x;
    }
  });

  ui.play.addEventListener('click', () => {
    if (state === 'paused') resume();
    else start();
  });
  ui.pause.addEventListener('click', pause);
  ui.mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    store.set('foxdusk-muted', audio.muted ? '1' : '0');
    syncMute();
    ui.mute.blur();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  addEventListener('blur', pause);
  addEventListener('resize', resize);

  // ---------- Install ----------

  let installPrompt = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    ui.install.hidden = false;
  });
  ui.install.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    ui.install.hidden = true;
  });
  addEventListener('appinstalled', () => { ui.install.hidden = true; });

  // ---------- Loop ----------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  syncMute();
  syncSkin();
  ui.best.textContent = best ? `Best score: ${best}` : '';
  requestAnimationFrame(frame);
})();
