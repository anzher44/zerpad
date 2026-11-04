// ZP Arena: a twin-stick arcade game. Waves of enemies, a boss every 5 waves, power-ups and combos.
// Played with a DualSense over WebHID (adaptive triggers, rumble, light bar and player LEDs follow
// the game), with any controller through the Gamepad API, or with keyboard and mouse.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const cv = $('arena'), ctx = cv.getContext('2d');
  const W = 1280, H = 720;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = {};
  function readColors() {
    for (const k of ['bg', 'panel', 'panel2', 'line', 'line2', 'text', 'muted', 'accent', 'accent2', 'ok', 'bad', 'warn', 'font', 'mono']) C[k] = css('--' + k);
    C.purple = '#b48cff';
  }
  readColors();
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const STORE = 'zerpad.arena';
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  let saved = store.get();

  // ---------- DualSense over WebHID ----------
  const hidOk = !!(window.DualSense && window.DualSense.supported);
  const ds = hidOk ? new DualSense() : null;
  const Fx = window.DSUtil ? window.DSUtil.TriggerFx : null;
  if (ds) {
    navigator.hid.getDevices().then(devs => {
      const d = devs.find(d => DualSense.filters.some(f => f.vendorId === d.vendorId && f.productId === d.productId));
      if (d) ds.open(d).catch(() => {});
    });
    navigator.hid.addEventListener('disconnect', e => { if (ds.device && e.device === ds.device) ds.detach(); });
    navigator.hid.addEventListener('connect', e => {
      if (!ds.device && DualSense.filters.some(f => f.productId === e.device.productId && f.vendorId === e.device.vendorId)) ds.open(e.device).catch(() => {});
    });
    ds.addEventListener('ready', () => { lastOut = ''; renderPad(); });
    ds.addEventListener('closed', renderPad);
    $('btnPad').addEventListener('click', () => { ds.request().catch(() => {}); });
    // leave the controller quiet when the page goes away
    window.addEventListener('pagehide', () => { if (ds.device) { ds.update(idleOut()); } });
  }
  const hidActive = () => !!(ds && ds.device && ds.state);
  function renderPad() {
    const on = hidActive() || !!gamepad();
    $('padStatus').className = 'pill ' + (on ? 'on' : 'off');
    $('padStatus').textContent = hidActive() ? tr('DualSense connectée') : gamepad() ? tr('Manette détectée') : tr('Clavier et souris');
    $('btnPad').hidden = !ds || !!ds.device;
    $('btnPad').textContent = tr('Connecter la DualSense');
  }

  // ---------- Input: DualSense, other controller, keyboard and mouse ----------
  const keys = new Set();
  const tapped = new Set();   // presses since the last frame, so a quick tap is never missed
  const mouse = { x: W / 2, y: H / 2, down: false, right: false, moved: 0 };
  window.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    keys.add(e.code);
    if (!e.repeat) tapped.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    lastSource = 'kb';
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = mouse.right = false; if (state === 'play') state = 'pause'; });
  const toWorld = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  cv.addEventListener('mousemove', e => { [mouse.x, mouse.y] = toWorld(e); mouse.moved = performance.now(); lastSource = 'kb'; });
  cv.addEventListener('mousedown', e => { if (e.button === 2) { mouse.right = true; tapped.add('MouseRight'); } else { mouse.down = true; tapped.add('Mouse'); } lastSource = 'kb'; e.preventDefault(); });
  window.addEventListener('mouseup', e => { if (e.button === 2) mouse.right = false; else mouse.down = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  let lastSource = 'kb';

  function gamepad() {
    if (!navigator.getGamepads) return null;
    for (const g of navigator.getGamepads()) {
      // with WebHID active the DualSense is read directly, not twice
      if (g && g.connected && !(hidActive() && /054c|dualsense/i.test(g.id))) return g;
    }
    return null;
  }
  const dead = (x, y, d = 0.18) => {
    const m = Math.hypot(x, y);
    if (m < d) return [0, 0];
    const k = Math.min(1, (m - d) / (1 - d)) / m;
    return [x * k, y * k];
  };
  const prev = {};
  function edge(name, now) { const was = prev[name]; prev[name] = now; return now && !was; }

  function readInput() {
    const inp = { mx: 0, my: 0, ax: 0, ay: 0, aim: false, fire: 0, dash: false, pause: false, start: false };
    let pad = false;
    if (hidActive()) {
      const s = ds.state, b = s.buttons || {};
      [inp.mx, inp.my] = dead((s.lx - 127.5) / 127.5, (s.ly - 127.5) / 127.5);
      const [ax, ay] = dead((s.rx - 127.5) / 127.5, (s.ry - 127.5) / 127.5, 0.3);
      if (ax || ay) { inp.ax = ax; inp.ay = ay; inp.aim = true; }
      inp.fire = Math.max(s.r2 / 255, b.r1 ? 1 : 0);
      inp.dashBtn = s.l2 > 170 || b.l1;
      inp.pauseBtn = b.options; inp.startBtn = b.cross || b.options;
      if (inp.mx || inp.my || inp.aim || inp.fire > 0.1 || inp.dashBtn || inp.startBtn) lastSource = 'ds';
      pad = true;
    } else {
      const g = gamepad();
      if (g) {
        const a = i => g.axes[i] || 0, bt = i => g.buttons[i] || { pressed: false, value: 0 };
        [inp.mx, inp.my] = dead(a(0), a(1));
        if (bt(12).pressed) inp.my = -1; if (bt(13).pressed) inp.my = 1; if (bt(14).pressed) inp.mx = -1; if (bt(15).pressed) inp.mx = 1;
        const [ax, ay] = dead(a(2), a(3), 0.3);
        if (ax || ay) { inp.ax = ax; inp.ay = ay; inp.aim = true; }
        inp.fire = Math.max(bt(7).value, bt(5).pressed ? 1 : 0);
        inp.dashBtn = bt(6).value > 0.65 || bt(4).pressed;
        inp.pauseBtn = bt(9).pressed; inp.startBtn = bt(0).pressed || bt(9).pressed;
        if (inp.mx || inp.my || inp.aim || inp.fire > 0.1 || inp.dashBtn || inp.startBtn) lastSource = 'pad';
        pad = true;
      }
    }
    // keyboard and mouse add to whatever the controller gives
    const k = c => keys.has(c);
    const kx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    const ky = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
    if (kx || ky) { const m = Math.hypot(kx, ky); inp.mx = kx / m; inp.my = ky / m; }
    if (player && !inp.aim && lastSource === 'kb' && performance.now() - mouse.moved < 60000) {
      inp.ax = mouse.x - player.x; inp.ay = mouse.y - player.y; inp.aim = Math.hypot(inp.ax, inp.ay) > 4;
    }
    if (mouse.down || k('KeyJ')) inp.fire = 1;
    const tap = (...c) => c.some(x => tapped.has(x));
    inp.dash = edge('dash', !!inp.dashBtn) || tap('ShiftLeft', 'ShiftRight', 'KeyK', 'MouseRight');
    inp.pause = edge('pause', !!inp.pauseBtn) || tap('Escape', 'KeyP');
    inp.start = edge('start', !!inp.startBtn) || tap('Enter', 'Space', 'Mouse');
    tapped.clear();
    inp.pad = pad;
    return inp;
  }

  // ---------- Sound (small synthesised effects, no files) ----------
  let actx = null, soundOn = saved.sound !== false;
  function audio() {
    if (!soundOn) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { soundOn = false; return null; } }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.12) {
    const a = audio(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = buf; g.gain.value = vol;
    s.connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    shot: () => tone(880, 0.05, 'square', 0.025, 0.6),
    hit: () => tone(220, 0.06, 'triangle', 0.05, 0.7),
    boom: () => { noise(0.25, 0.1); tone(120, 0.25, 'sine', 0.08, 0.4); },
    hurt: () => { noise(0.3, 0.16); tone(90, 0.35, 'sawtooth', 0.06, 0.5); },
    pick: () => { tone(660, 0.08, 'sine', 0.06); setTimeout(() => tone(990, 0.1, 'sine', 0.06), 70); },
    dash: () => tone(300, 0.12, 'sine', 0.05, 2.2),
    wave: () => { tone(440, 0.12, 'triangle', 0.06); setTimeout(() => tone(660, 0.16, 'triangle', 0.06), 120); },
    bomb: () => { noise(0.6, 0.18); tone(60, 0.6, 'sine', 0.12, 0.5); },
  };

  // ---------- Controller feedback ----------
  const rumble = { strong: 0, weak: 0, sUntil: 0, wUntil: 0 };
  function shake(strong, weak, ms) {
    const t = performance.now();
    if (strong) { rumble.strong = Math.max(strong, t < rumble.sUntil ? rumble.strong : 0); rumble.sUntil = Math.max(rumble.sUntil, t + ms); }
    if (weak) { rumble.weak = Math.max(weak, t < rumble.wUntil ? rumble.weak : 0); rumble.wUntil = Math.max(rumble.wUntil, t + ms); }
    if (!hidActive()) {
      const g = gamepad(), a = g && g.vibrationActuator;
      if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong / 255, weakMagnitude: weak / 255 }).catch(() => {});
    }
  }
  function idleOut() {
    return { motorL: 0, motorR: 0, r: 0, g: 64, b: 255, playerLeds: 0, trigL: Fx ? Fx.off() : undefined, trigR: Fx ? Fx.off() : undefined };
  }
  let lastOut = '', flashUntil = 0;
  function feedback(now, inp) {
    if (!hidActive()) return;
    const o = {};
    o.motorL = now < rumble.sUntil ? rumble.strong : 0;
    o.motorR = now < rumble.wUntil ? rumble.weak : 0;
    if (state === 'play' || state === 'pause') {
      // light bar: health from green to red, white flash when hit, blue while dashing
      const k = player.hp / player.maxHp;
      if (now < flashUntil) { o.r = 255; o.g = 255; o.b = 255; }
      else if (player.dashT > 0) { o.r = 40; o.g = 120; o.b = 255; }
      else { o.r = Math.round(255 * (1 - k)); o.g = Math.round(200 * k); o.b = 30; }
      o.playerLeds = (1 << clamp(player.hp, 0, 5)) - 1;
      // R2: light resistance, buzzing while firing (faster with the rapid-fire bonus)
      o.trigR = inp.fire > 0.15 && state === 'play' ? Fx.vibration(2, now < player.rapidUntil ? 6 : 4, now < player.rapidUntil ? 34 : 20) : Fx.feedback(1, 2);
      // L2: a wall to press through, softer while the dash recharges
      o.trigL = player.dashCd > 0 ? Fx.feedback(3, 2) : Fx.feedback(5, 7);
    } else {
      Object.assign(o, { r: 0, g: 64, b: 255, playerLeds: 0, trigL: Fx.off(), trigR: Fx.off() });
    }
    const key = JSON.stringify(o);
    if (key !== lastOut) { lastOut = key; ds.update(o); }
  }

  // ---------- Game state ----------
  let state = 'title', wave = 0, score = 0, mult = 1, chain = 0, chainUntil = 0, waveBanner = 0, spawnQueue = [], spawnAt = 0, shakeCam = 0;
  let player, bullets = [], enemies = [], pickups = [], parts = [], texts = [], stars;
  const best = () => saved.best || 0;
  function reset() {
    player = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 15, hp: 5, maxHp: 5, inv: 0, dashCd: 0, dashT: 0, aim: -Math.PI / 2, fireCd: 0, rapidUntil: 0 };
    bullets = []; enemies = []; pickups = []; parts = []; texts = [];
    wave = 0; score = 0; mult = 1; chain = 0; spawnQueue = []; nextWave();
  }
  stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.5, 1.6) }));

  const TYPES = {
    chaser: { r: 13, hp: 1, speed: 125, pts: 10, color: () => C.bad },
    drifter: { r: 11, hp: 1, speed: 210, pts: 15, color: () => C.warn },
    shooter: { r: 15, hp: 3, speed: 90, pts: 30, color: () => C.accent2 },
    tank: { r: 27, hp: 7, speed: 55, pts: 50, color: () => C.purple },
    mini: { r: 8, hp: 1, speed: 175, pts: 5, color: () => C.purple },
    boss: { r: 50, hp: 60, speed: 45, pts: 600, color: () => C.bad },
  };
  function nextWave() {
    wave++;
    waveBanner = 2.2;
    const list = [];
    if (wave % 5 === 0) {
      list.push('boss');
      for (let i = 0; i < 4 + wave / 5; i++) list.push('chaser');
    } else {
      const n = 5 + wave * 2;
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        list.push(wave >= 4 && r < 0.14 ? 'shooter' : wave >= 3 && r < 0.26 ? 'tank' : wave >= 2 && r < 0.5 ? 'drifter' : 'chaser');
      }
    }
    spawnQueue = list; spawnAt = performance.now() + 1600;
    if (wave > 1) sfx.wave();
  }
  function spawn(type, x, y) {
    const T = TYPES[type];
    if (x == null) {
      // from a point on the border, away from the player
      do {
        const side = Math.floor(Math.random() * 4);
        x = side === 0 ? rand(40, W - 40) : side === 1 ? W - 40 : side === 2 ? rand(40, W - 40) : 40;
        y = side === 0 ? 40 : side === 1 ? rand(40, H - 40) : side === 2 ? H - 40 : rand(40, H - 40);
      } while (Math.hypot(x - player.x, y - player.y) < 260);
    }
    const ang = rand(0, Math.PI * 2);
    const hp = type === 'boss' ? T.hp + wave * 8 : T.hp;
    enemies.push({ type, x, y, vx: Math.cos(ang) * T.speed, vy: Math.sin(ang) * T.speed, r: T.r, hp, maxHp: hp,
      warm: type === 'mini' ? 0 : 0.7, t: 0, cd: rand(1.2, 2.4), hitT: 0 });
  }
  function burst(x, y, color, n = 14, sp = 260) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(sp * 0.3, sp);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), max: 0.7, color, size: rand(2, 4) });
    }
  }
  function floatText(x, y, t, color) { texts.push({ x, y, t, color, life: 0.9 }); }

  function kill(e) {
    const T = TYPES[e.type];
    const now = performance.now();
    chain = now < chainUntil ? chain + 1 : 1; chainUntil = now + 2000;
    mult = Math.min(8, 1 + Math.floor(chain / 5));
    const pts = T.pts * mult; score += pts;
    floatText(e.x, e.y - e.r, '+' + pts, mult > 1 ? C.warn : C.text);
    burst(e.x, e.y, T.color(), e.type === 'boss' ? 60 : e.type === 'tank' ? 26 : 14, e.type === 'boss' ? 420 : 260);
    if (e.type === 'boss') { shake(255, 255, 600); shakeCam = 14; sfx.bomb(); } else { shake(0, e.type === 'tank' ? 160 : 90, 70); sfx.boom(); }
    if (e.type === 'tank') for (let i = 0; i < 3; i++) spawn('mini', e.x + rand(-12, 12), e.y + rand(-12, 12));
    const drop = e.type === 'boss' ? 1 : e.type === 'tank' ? 0.25 : 0.06;
    if (Math.random() < drop) {
      const r = Math.random();
      const type = player.hp < player.maxHp && r < 0.4 ? 'heal' : r < 0.8 ? 'rapid' : 'bomb';
      pickups.push({ type, x: e.x, y: e.y, t: 10 });
    }
  }
  function hurtPlayer() {
    if (player.inv > 0 || player.dashT > 0) return;
    player.hp--; player.inv = 1.3;
    flashUntil = performance.now() + 160; shakeCam = 10;
    shake(255, 120, 260); sfx.hurt();
    burst(player.x, player.y, C.accent, 18, 300);
    if (player.hp <= 0) gameOver();
  }
  function gameOver() {
    state = 'over';
    const rec = score > best();
    if (rec) { saved.best = score; saved.bestWave = wave; store.set(saved); }
    saved.lastRecord = rec;
    shake(200, 200, 500);
  }

  // ---------- Update ----------
  function update(dt, now, inp) {
    const p = player;
    // movement with a little inertia
    const speed = 330;
    p.vx += (inp.mx * speed - p.vx) * Math.min(1, dt * 12);
    p.vy += (inp.my * speed - p.vy) * Math.min(1, dt * 12);
    if (inp.dash && p.dashCd <= 0) {
      const m = Math.hypot(inp.mx, inp.my);
      const dx = m > 0.2 ? inp.mx / m : Math.cos(p.aim), dy = m > 0.2 ? inp.my / m : Math.sin(p.aim);
      p.vx = dx * 1100; p.vy = dy * 1100; p.dashT = 0.16; p.dashCd = 1.1;
      sfx.dash(); shake(0, 120, 90);
    }
    if (p.dashT > 0) { p.dashT -= dt; burst(p.x, p.y, C.accent, 1, 40); }
    p.dashCd = Math.max(0, p.dashCd - dt); p.inv = Math.max(0, p.inv - dt);
    p.x = clamp(p.x + p.vx * dt, p.r, W - p.r); p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);
    if (inp.aim) p.aim = Math.atan2(inp.ay, inp.ax);
    else if (Math.hypot(inp.mx, inp.my) > 0.3 && !inp.pad) p.aim = Math.atan2(inp.my, inp.mx);

    // firing: the harder R2 is pressed, the faster it fires
    p.fireCd -= dt;
    if (inp.fire > 0.15 && p.fireCd <= 0) {
      const rapid = now < p.rapidUntil;
      p.fireCd = (0.24 - 0.14 * clamp((inp.fire - 0.15) / 0.8, 0, 1)) * (rapid ? 0.55 : 1);
      const spread = rapid ? [-0.12, 0, 0.12] : [0];
      for (const s of spread) {
        const a = p.aim + s + rand(-0.03, 0.03);
        bullets.push({ x: p.x + Math.cos(a) * 18, y: p.y + Math.sin(a) * 18, vx: Math.cos(a) * 920, vy: Math.sin(a) * 920, life: 0.85, from: 'p' });
      }
      sfx.shot();
    }

    // spawning
    if (spawnQueue.length && now >= spawnAt) { spawn(spawnQueue.shift()); spawnAt = now + Math.max(180, 650 - wave * 30); }
    if (!spawnQueue.length && !enemies.length && waveBanner <= 0) nextWave();
    waveBanner = Math.max(0, waveBanner - dt);

    // enemies
    for (const e of enemies) {
      const T = TYPES[e.type];
      e.t += dt; e.hitT = Math.max(0, e.hitT - dt);
      if (e.warm > 0) { e.warm -= dt; continue; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const sp = T.speed * (1 + Math.min(0.6, wave * 0.03));
      if (e.type === 'chaser' || e.type === 'mini' || e.type === 'tank') {
        e.vx += (dx / d * sp - e.vx) * Math.min(1, dt * 2.5); e.vy += (dy / d * sp - e.vy) * Math.min(1, dt * 2.5);
      } else if (e.type === 'shooter') {
        // keeps its distance and fires
        const want = d > 360 ? 1 : d < 260 ? -1 : 0;
        e.vx += (dx / d * sp * want + -dy / d * sp * 0.6 - e.vx) * Math.min(1, dt * 2); e.vy += (dy / d * sp * want + dx / d * sp * 0.6 - e.vy) * Math.min(1, dt * 2);
        e.cd -= dt;
        if (e.cd <= 0) { e.cd = rand(1.6, 2.6); const a = Math.atan2(dy, dx); bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 3, from: 'e' }); tone(500, 0.08, 'sine', 0.03, 0.5); }
      } else if (e.type === 'boss') {
        e.vx += (dx / d * sp - e.vx) * Math.min(1, dt); e.vy += (dy / d * sp - e.vy) * Math.min(1, dt);
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = e.hp < e.maxHp / 2 ? 1.1 : 1.6;
          const n = e.hp < e.maxHp / 2 ? 14 : 10, off = e.t;
          for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2; bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, life: 4, from: 'e' }); }
          if (Math.random() < 0.5) spawn('chaser');
          shake(140, 0, 120);
        }
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.x < e.r || e.x > W - e.r) { e.vx = -e.vx; e.x = clamp(e.x, e.r, W - e.r); }
      if (e.y < e.r || e.y > H - e.r) { e.vy = -e.vy; e.y = clamp(e.y, e.r, H - e.r); }
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r - 3) hurtPlayer();
    }

    // bullets
    for (const b of bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) b.life = 0;
      if (b.life <= 0) continue;
      if (b.from === 'p') {
        for (const e of enemies) {
          if (e.hp > 0 && e.warm <= 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
            b.life = 0; e.hp--; e.hitT = 0.08;
            e.vx += b.vx * (e.type === 'boss' ? 0.005 : 0.04); e.vy += b.vy * (e.type === 'boss' ? 0.005 : 0.04);
            if (e.hp <= 0) kill(e); else { sfx.hit(); burst(b.x, b.y, TYPES[e.type].color(), 3, 140); }
            break;
          }
        }
      } else if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) { b.life = 0; hurtPlayer(); }
    }
    bullets = bullets.filter(b => b.life > 0);
    enemies = enemies.filter(e => e.hp > 0);

    // power-ups
    for (const k of pickups) {
      k.t -= dt;
      if (dist(k, p) < p.r + 14) {
        k.t = 0; sfx.pick(); shake(0, 140, 120);
        if (k.type === 'heal') { p.hp = Math.min(p.maxHp, p.hp + 1); floatText(p.x, p.y - 30, tr('+1 vie'), C.ok); }
        if (k.type === 'rapid') { p.rapidUntil = now + 8000; floatText(p.x, p.y - 30, tr('Tir rapide'), C.accent2); }
        if (k.type === 'bomb') {
          floatText(p.x, p.y - 30, tr('Onde de choc'), C.warn); sfx.bomb(); shake(255, 255, 450); shakeCam = 16;
          bullets = bullets.filter(b => b.from === 'p');
          for (const e of enemies) { if (e.type === 'boss') { e.hp -= 12; if (e.hp <= 0) kill(e); } else { e.hp = 0; kill(e); } }
          enemies = enemies.filter(e => e.hp > 0);
          parts.push({ ring: true, x: p.x, y: p.y, life: 0.5, max: 0.5 });
        }
      }
    }
    pickups = pickups.filter(k => k.t > 0);
    if (now > chainUntil) { chain = 0; mult = 1; }
  }
  function updateFx(dt) {
    for (const q of parts) { q.life -= dt; if (!q.ring) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; } }
    parts = parts.filter(q => q.life > 0);
    for (const t of texts) { t.life -= dt; t.y -= 40 * dt; }
    texts = texts.filter(t => t.life > 0);
    shakeCam = Math.max(0, shakeCam - dt * 40);
  }

  // ---------- Drawing ----------
  function resize() {
    const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  }
  function text(t, x, y, size, color, align = 'center', weight = 600, font = C.font) {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.font = weight + ' ' + size + 'px ' + font; ctx.fillText(t, x, y);
  }
  function shape(n, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath();
  }
  function drawWorld(now) {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shakeCam > 0) ctx.translate(rand(-shakeCam, shakeCam), rand(-shakeCam, shakeCam));
    // grid and stars
    ctx.strokeStyle = C.line2; ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = C.muted;
    for (const s of stars) { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now / 900 + s.x); ctx.fillRect(s.x, s.y, s.s, s.s); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    if (!player) { ctx.restore(); return; }

    for (const k of pickups) {
      if (k.t < 2.5 && Math.floor(k.t * 8) % 2) continue;
      const col = k.type === 'heal' ? C.ok : k.type === 'rapid' ? C.accent2 : C.warn;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      shape(4, k.x, k.y, 13, now / 400); ctx.stroke();
      text(k.type === 'heal' ? '+' : k.type === 'rapid' ? '»' : '✷', k.x, k.y + 1, 16, col);
    }
    for (const e of enemies) {
      const col = e.hitT > 0 ? C.text : TYPES[e.type].color();
      if (e.warm > 0) {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + e.warm * 40, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 3;
      if (e.type === 'chaser' || e.type === 'mini') { shape(3, e.x, e.y, e.r, Math.atan2(player.y - e.y, player.x - e.x)); ctx.fill(); }
      else if (e.type === 'drifter') { shape(4, e.x, e.y, e.r, e.t * 4); ctx.stroke(); }
      else if (e.type === 'shooter') { ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, 7); ctx.fill(); }
      else if (e.type === 'tank') { shape(6, e.x, e.y, e.r, e.t); ctx.stroke(); shape(6, e.x, e.y, e.r * 0.5, -e.t); ctx.fill(); }
      else if (e.type === 'boss') {
        shape(8, e.x, e.y, e.r, e.t * 0.6); ctx.stroke();
        shape(8, e.x, e.y, e.r * 0.62, -e.t); ctx.stroke();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.25, 0, 7); ctx.fill();
        // boss health bar
        ctx.fillStyle = C.line; ctx.fillRect(W / 2 - 200, 54, 400, 8);
        ctx.fillStyle = C.bad; ctx.fillRect(W / 2 - 200, 54, 400 * Math.max(0, e.hp / e.maxHp), 8);
      }
    }
    for (const b of bullets) {
      ctx.fillStyle = b.from === 'p' ? C.text : C.bad;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.from === 'p' ? 3.5 : 5, 0, 7); ctx.fill();
    }
    for (const q of parts) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      if (q.ring) { ctx.strokeStyle = C.warn; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(q.x, q.y, (1 - q.life / q.max) * 900, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); }
    }
    ctx.globalAlpha = 1;
    // player
    const p = player;
    if (!(p.inv > 0 && Math.floor(now / 80) % 2) && state !== 'over') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.aim);
      ctx.fillStyle = now < p.rapidUntil ? C.accent2 : C.accent;
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-12, 12); ctx.lineTo(-6, 0); ctx.lineTo(-12, -12); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (p.dashCd > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + (1 - p.dashCd / 1.1) * Math.PI * 2); ctx.stroke(); }
    }
    for (const t of texts) { ctx.globalAlpha = Math.min(1, t.life * 2); text(t.t, t.x, t.y, 18, t.color); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function drawHud(now) {
    text(tr('Score') + ' ' + score.toLocaleString(I18N.locale), 24, 30, 22, C.text, 'left', 600, C.mono);
    if (mult > 1) text('x' + mult, 24 + 22 + ctx.measureText(tr('Score') + ' ' + score.toLocaleString(I18N.locale)).width, 30, 22, C.warn, 'left', 600, C.mono);
    text(tr('Vague') + ' ' + wave, W / 2, 30, 20, C.muted, 'center', 500, C.mono);
    for (let i = 0; i < player.maxHp; i++) {
      ctx.fillStyle = i < player.hp ? C.accent : C.line;
      shape(4, W - 30 - i * 26, 30, 9, Math.PI / 4); ctx.fill();
    }
    if (now < player.rapidUntil) text(tr('Tir rapide') + ' ' + Math.ceil((player.rapidUntil - now) / 1000) + ' s', W - 24, 58, 14, C.accent2, 'right', 500);
    if (waveBanner > 0) {
      ctx.globalAlpha = Math.min(1, waveBanner);
      text(wave % 5 === 0 ? tr('Vague {n} : boss', { n: wave }) : tr('Vague {n}', { n: wave }), W / 2, H / 2 - 40, 48, C.text);
      ctx.globalAlpha = 1;
    }
  }
  function controlsLines() {
    if (lastSource === 'ds' || lastSource === 'pad' || hidActive() || gamepad()) {
      return [tr('Stick gauche : se déplacer · Stick droit : viser'), tr('R2 : tirer (plus vous appuyez, plus ça tire vite) · L2 : esquive'), tr('Options : pause')];
    }
    return [tr('ZQSD / WASD ou flèches : se déplacer · Souris : viser'), tr('Clic gauche : tirer · Maj ou clic droit : esquive'), tr('Échap : pause')];
  }
  function overlay(title, lines, prompt, now) {
    ctx.fillStyle = 'rgba(7,11,21,0.78)'; ctx.fillRect(0, 0, W, H);
    text(title, W / 2, H / 2 - 120, 64, C.text, 'center', 700);
    lines.forEach((l, i) => text(l, W / 2, H / 2 - 30 + i * 34, 20, C.muted, 'center', 400));
    if (Math.floor(now / 500) % 2 === 0) text(prompt, W / 2, H / 2 + 150, 22, C.accent, 'center', 600);
  }
  const startPrompt = () => (lastSource === 'kb' && !hidActive() && !gamepad()) ? tr('Clic ou Entrée pour jouer') : tr('✕ ou Options pour jouer');

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    resize();
    if (now - padCheck > 1000) { padCheck = now; renderPad(); }
    const inp = readInput();
    if (state === 'title') {
      if (inp.start) { reset(); state = 'play'; audio(); }
    } else if (state === 'play') {
      if (inp.pause) state = 'pause';
      else update(dt, now, inp);
    } else if (state === 'pause') {
      if (inp.pause || inp.start) state = 'play';
    } else if (state === 'over') {
      if (inp.start && now - overAt > 900) { reset(); state = 'play'; }
    }
    if (state === 'over' && !overAt) overAt = now;
    if (state !== 'over') overAt = 0;
    if (state !== 'pause') updateFx(dt);
    feedback(now, inp);

    drawWorld(now);
    if (state === 'title') {
      const b = best();
      overlay('ZP ARENA', [...controlsLines(), b ? tr('Record : {s} points (vague {w})', { s: b.toLocaleString(I18N.locale), w: saved.bestWave || 1 }) : ''], startPrompt(), now);
    } else {
      drawHud(now);
      if (state === 'pause') overlay(tr('Pause'), controlsLines(), tr('Appuyez encore pour reprendre'), now);
      if (state === 'over') overlay(tr('Partie terminée'), [tr('Score : {s} · vague {w}', { s: score.toLocaleString(I18N.locale), w: wave }),
        saved.lastRecord ? tr('Nouveau record !') : best() ? tr('Record : {s} points (vague {w})', { s: best().toLocaleString(I18N.locale), w: saved.bestWave || 1 }) : ''], startPrompt(), now);
    }
  }
  let overAt = 0, padCheck = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') state = 'pause'; });

  // ---------- Page chrome ----------
  function renderText() {
    $('arenaSub').textContent = tr('Jeu d\'arcade de ZerPad');
    $('arenaHelp').textContent = tr('Survivez aux vagues, enchaînez les éliminations pour monter le multiplicateur. Un boss arrive toutes les 5 vagues.');
    $('btnFull').textContent = tr('Plein écran');
    $('btnSound').textContent = soundOn ? tr('Son : activé') : tr('Son : coupé');
    $('backHome').title = tr('Retour à ZerPad');
    readColors(); renderPad();
  }
  $('btnFull').addEventListener('click', () => {
    const box = $('arenaBox');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
  });
  $('btnSound').addEventListener('click', () => { soundOn = !soundOn; saved.sound = soundOn; store.set(saved); renderText(); });
  document.addEventListener('langchange', renderText);
  window.addEventListener('gamepadconnected', renderPad);
  window.addEventListener('gamepaddisconnected', renderPad);
  // keep the language in the link back home
  if (I18N.lang !== 'fr') $('backHome').href = './?lang=' + I18N.lang;
  document.addEventListener('langchange', () => { $('backHome').href = I18N.lang === 'fr' ? './' : './?lang=' + I18N.lang; });
  renderText();
  requestAnimationFrame(frame);

  // debugging and automated checks
  window.__arena = { get ds() { return ds; }, get state() { return state; }, get score() { return score; }, get wave() { return wave; }, get player() { return player; }, get enemies() { return enemies; }, spawn: t => spawn(t) };
})();
