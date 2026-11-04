// Mini games played with the controller. They double as informal checks: buttons and reaction
// time, stick precision, fine trigger control. Best scores stay in this browser.
(function () {
  'use strict';
  const { TriggerFx } = window.DSUtil;
  const ds = window.ds;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const STORE = 'zerpad.games';

  function loadBest() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } }
  function saveBest(b) { try { localStorage.setItem(STORE, JSON.stringify(b)); } catch (e) { /* storage unavailable */ } }
  let best = loadBest();

  const DEFAULT_OUT = { r: 0, g: 64, b: 255, motorL: 0, motorR: 0, playerLeds: 0, trigL: TriggerFx.off(), trigR: TriggerFx.off() };
  const flash = (r, g, b) => ds.device && ds.update({ r, g, b });
  const buzz = (ms = 120, strength = 160) => {
    if (!ds.device) return;
    ds.update({ motorL: strength });
    setTimeout(() => ds.device && ds.update({ motorL: 0 }), ms);
  };

  // Sets up the canvas for the screen's pixel density and returns a 2D context in CSS pixels
  function ctxOf(cv) {
    const r = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    const c = cv.getContext('2d');
    c.setTransform(r, 0, 0, r, 0, 0);
    return { c, w, h };
  }
  function centerText(c, w, h, lines) {
    c.fillStyle = css('--muted'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '15px ' + css('--font');
    lines.forEach((l, i) => c.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 22));
  }

  // Common game shell: start/stop button, status line, best score, stop when the tab is left
  function Game(id, def) {
    const g = Object.assign({ id, running: false }, def);
    const btn = $(id + 'Start');
    g.setStatus = t => { $(id + 'Status').textContent = t; };
    g.showBest = () => {
      const b = best[id];
      $(id + 'Best').textContent = b != null ? tr('Record : ') + g.fmtScore(b) : tr('Pas encore de record');
    };
    g.stop = (finished) => {
      if (!g.running) return;
      g.running = false;
      btn.textContent = tr('Jouer');
      btn.className = 'primary';
      if (ds.device) ds.update(DEFAULT_OUT);
      if (finished && g.score != null) {
        const rec = best[id] == null || g.better(g.score, best[id]);
        if (rec) { best[id] = g.score; saveBest(best); }
        g.setStatus(tr('Terminé : ') + g.fmtScore(g.score) + (rec ? tr(' (nouveau record)') : ''));
        g.showBest();
      } else if (!finished) g.setStatus(tr('Partie arrêtée.'));
    };
    btn.addEventListener('click', () => {
      if (g.running) { g.stop(false); return; }
      if (!ds.device || !ds.state) { g.setStatus(tr('Connectez d\'abord la manette.')); return; }
      if (ds.simpleMode) { g.setStatus(tr('Mode Bluetooth simplifié : reconnectez la manette.')); return; }
      g.running = true; g.score = null;
      btn.textContent = tr('Arrêter');
      btn.className = 'ghost';
      g.start(performance.now());
    });
    g.showBest();
    return g;
  }

  // 1. Reaction: press the button shown as fast as possible
  const PROMPTS = [['cross', '✕'], ['circle', '○'], ['square', '□'], ['triangle', '△'],
    ['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→'], ['l1', 'L1'], ['r1', 'R1']];
  const ROUNDS = 15;
  const reaction = Game('gReact', {
    fmtScore: v => v + ' ms',
    better: (a, b) => a < b,
    start(now) {
      this.round = 0; this.times = []; this.errors = 0; this.prev = {};
      this.next(now);
    },
    next(now) {
      this.round++;
      this.prompt = null;
      this.showAt = now + 700 + Math.random() * 1300;
      this.setStatus(tr('Manche ') + this.round + ' / ' + ROUNDS + tr(' : attendez le symbole…'));
    },
    frame(now, st) {
      const pressed = PROMPTS.filter(([k]) => st.buttons[k] && !this.prev[k]).map(([k]) => k);
      PROMPTS.forEach(([k]) => { this.prev[k] = st.buttons[k]; });
      if (!this.prompt) {
        if (pressed.length) { this.errors++; buzz(); flash(255, 40, 0); this.setStatus(tr('Trop tôt ! Attendez le symbole.')); this.showAt = now + 900 + Math.random() * 1000; }
        else if (now >= this.showAt) {
          let p; do { p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; } while (this.last && p[0] === this.last[0]);
          this.prompt = p; this.last = p; this.t0 = now; flash(255, 255, 255);
          this.setStatus(tr('Manche ') + this.round + ' / ' + ROUNDS);
        }
        return;
      }
      if (!pressed.length) {
        if (now - this.t0 > 3000) { this.errors++; this.times.push(3000); buzz(); this.after(now); }
        return;
      }
      if (pressed.includes(this.prompt[0])) {
        this.times.push(Math.round(now - this.t0)); flash(0, 200, 60);
      } else { this.errors++; buzz(); flash(255, 0, 0); return; }
      this.after(now);
    },
    after(now) {
      this.prompt = null;
      if (this.round >= ROUNDS) {
        const avg = Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length);
        this.score = avg + this.errors * 100;   // each mistake costs 100 ms
        this.stop(true);
        this.setStatus(tr('Terminé : moyenne ') + avg + tr(' ms, meilleur ') + Math.min(...this.times) + tr(' ms, erreurs ') + this.errors +
          tr(', score ') + this.score + ' ms' + (best.gReact === this.score ? tr(' (nouveau record)') : ''));
        return;
      }
      this.next(now);
    },
    draw(now) {
      const { c, w, h } = ctxOf($('gReactCv'));
      c.clearRect(0, 0, w, h);
      if (!this.running) { centerText(c, w, h, [tr('Appuyez le plus vite possible sur le bouton affiché.'), tr('15 manches, chaque erreur coûte 100 ms.')]); return; }
      if (this.prompt) {
        c.fillStyle = css('--text'); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '600 ' + Math.min(110, h * 0.6) + 'px ' + css('--font');
        c.fillText(this.prompt[1], w / 2, h / 2 + 4);
      } else centerText(c, w, h, ['…']);
      // progress dots
      for (let i = 0; i < ROUNDS; i++) {
        c.fillStyle = i < this.round - (this.prompt ? 1 : 0) ? css('--accent') : css('--line');
        c.beginPath(); c.arc(w / 2 + (i - (ROUNDS - 1) / 2) * 14, h - 14, 4, 0, 7); c.fill();
      }
    },
  });

  // 2. Target: keep the stick cursor inside a moving circle
  const TRACK_MS = 30000;
  const target = Game('gTrack', {
    fmtScore: v => v + ' %',
    better: (a, b) => a > b,
    start(now) { this.t0 = now; this.last = now; this.inside = 0; this.total = 0; this.trail = []; },
    pos(t) {
      // Lissajous path that speeds up over the game
      const k = t / 1000, sp = 0.5 + k / 30 * 0.9;
      return [0.62 * Math.sin(k * sp * 1.3), 0.62 * Math.sin(k * sp * 1.7 + 1.1)];
    },
    frame(now, st) {
      const el = now - this.t0, dt = Math.min(now - this.last, 50); this.last = now;
      const useR = $('gTrackStick').value === 'R';
      const x = ((useR ? st.rx : st.lx) - 127.5) / 127.5, y = ((useR ? st.ry : st.ly) - 127.5) / 127.5;
      const [tx, ty] = this.pos(el);
      this.cursor = [x, y]; this.targetPos = [tx, ty];
      this.on = Math.hypot(x - tx, y - ty) < 0.16;
      this.total += dt; if (this.on) this.inside += dt;
      if ((this.wasOn !== this.on)) { flash(this.on ? 0 : 255, this.on ? 200 : 60, this.on ? 60 : 0); this.wasOn = this.on; }
      const pct = Math.round(this.inside / (this.total || 1) * 100);
      ds.update({ playerLeds: (1 << Math.min(5, Math.ceil(el / TRACK_MS * 5))) - 1 });
      this.setStatus(tr('Temps sur la cible : ') + pct + ' %, ' + Math.max(0, Math.ceil((TRACK_MS - el) / 1000)) + ' s');
      if (el >= TRACK_MS) { this.score = pct; this.stop(true); }
    },
    draw() {
      const { c, w, h } = ctxOf($('gTrackCv'));
      c.clearRect(0, 0, w, h);
      const R = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
      c.strokeStyle = css('--line'); c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
      if (!this.running) { centerText(c, w, h, [tr('Gardez le point dans le cercle qui bouge.'), tr('30 secondes, de plus en plus vite.')]); return; }
      const [tx, ty] = this.targetPos || [0, 0];
      c.fillStyle = this.on ? css('--okbg') : css('--panel2');
      c.strokeStyle = this.on ? css('--ok') : css('--muted'); c.lineWidth = 2;
      c.beginPath(); c.arc(cx + tx * R, cy + ty * R, 0.16 * R, 0, 7); c.fill(); c.stroke();
      if (this.cursor) {
        c.fillStyle = css('--accent');
        c.beginPath(); c.arc(cx + this.cursor[0] * R, cy + this.cursor[1] * R, 6, 0, 7); c.fill();
      }
    },
  });

  // 3. Trigger control: hold the trigger inside a band that moves, against adaptive resistance
  const DOSE_MS = 30000;
  const dose = Game('gDose', {
    fmtScore: v => v + ' %',
    better: (a, b) => a > b,
    start(now) {
      this.t0 = now; this.last = now; this.inside = 0; this.total = 0; this.band = 128; this.moveAt = now;
      this.key = $('gDoseTrig').value;
      ds.update({ [this.key === 'l2' ? 'trigL' : 'trigR']: TriggerFx.feedback(1, 3) });
    },
    frame(now, st) {
      const el = now - this.t0, dt = Math.min(now - this.last, 50); this.last = now;
      if (now >= this.moveAt) {
        let b; do { b = 40 + Math.random() * 190; } while (Math.abs(b - this.band) < 50);
        this.from = this.band; this.to = b; this.moveStart = now; this.moveAt = now + 2500;
      }
      const k = Math.min(1, (now - this.moveStart) / 400);
      this.band = this.from + (this.to - this.from) * (1 - Math.pow(1 - k, 3));
      this.val = st[this.key];
      this.on = Math.abs(this.val - this.band) <= 14;
      this.total += dt; if (this.on) this.inside += dt;
      if (this.wasOn !== this.on) { flash(this.on ? 0 : 255, this.on ? 200 : 60, this.on ? 60 : 0); this.wasOn = this.on; }
      const pct = Math.round(this.inside / (this.total || 1) * 100);
      this.setStatus(tr('Dans la zone : ') + pct + ' %, ' + Math.max(0, Math.ceil((DOSE_MS - el) / 1000)) + ' s');
      if (el >= DOSE_MS) { this.score = pct; this.stop(true); }
    },
    draw() {
      const { c, w, h } = ctxOf($('gDoseCv'));
      c.clearRect(0, 0, w, h);
      if (!this.running) { centerText(c, w, h, [tr('Maintenez la gâchette dans la zone verte.'), tr('La zone change toutes les 2,5 s, 30 secondes.')]); return; }
      const x0 = 24, x1 = w - 24, y = h / 2 - 14, bh = 28, sx = v => x0 + (x1 - x0) * v / 255;
      c.fillStyle = css('--panel2'); c.fillRect(x0, y, x1 - x0, bh);
      c.fillStyle = this.on ? css('--ok') : css('--okbg');
      c.fillRect(sx(this.band - 14), y - 6, sx(this.band + 14) - sx(this.band - 14), bh + 12);
      c.fillStyle = css('--accent'); c.fillRect(sx(this.val) - 2, y - 12, 4, bh + 24);
      c.fillStyle = css('--muted'); c.font = '12px ' + css('--font'); c.textAlign = 'left'; c.fillText('0', x0, y + bh + 26);
      c.textAlign = 'right'; c.fillText('255', x1, y + bh + 26);
    },
  });

  const games = [reaction, target, dose];
  function loop(now) {
    requestAnimationFrame(loop);
    const visible = $('tab-games').classList.contains('active');
    for (const g of games) {
      if (g.running && (!visible || !ds.device)) { g.stop(false); continue; }
      if (g.running && ds.state) g.frame(now, ds.state);
      if (visible) g.draw(now);
    }
  }
  requestAnimationFrame(loop);
  document.addEventListener('langchange', () => games.forEach(g => { g.showBest(); if (!g.running) $(g.id + 'Start').textContent = tr('Jouer'); }));
})();
