// Quick test through the standard Gamepad API: buttons, sticks, triggers, stick drift and a short
// rumble when the browser offers it. Shown for any controller in browsers without WebHID (Firefox,
// Safari, Chrome on Android), and in Chrome or Edge for controllers other than a DualSense.
// Factory data, calibration and telemetry need WebHID and a DualSense.
(function () {
  'use strict';
  const box = document.getElementById('quick');
  if (!box || !('getGamepads' in navigator)) return;
  const hid = !!(window.DualSense && window.DualSense.supported);
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const setText = (id, t) => { const e = $(id); if (e.textContent !== t) e.textContent = t; };
  box.hidden = hid;
  const sony = g => /054c|sony|dualsense|dualshock/i.test(g.id);
  // In Chrome or Edge a DualSense goes through WebHID and the full test, other controllers come here
  const usable = g => g && g.connected && !(hid && sony(g));

  // Standard mapping order (w3c.github.io/gamepad/#remapping), names per controller family
  const LAYOUTS = {
    sony: ['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'Touchpad'],
    nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3', '↑', '↓', '←', '→', 'Home', 'Capture'],
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→', 'Xbox', 'Share'],
  };
  const family = g => sony(g) ? 'sony' : /057e|nintendo|pro controller|joy-con/i.test(g.id) ? 'nintendo' : 'xbox';
  const NAMES = LAYOUTS.sony;
  const grid = $('qButtons');
  NAMES.forEach((n, i) => {
    const b = document.createElement('span');
    b.className = 'qbtn'; b.textContent = n; b.dataset.i = i;
    grid.appendChild(b);
  });
  const seen = new Set();
  let index = null, drift = null, driftText = '';
  let trigMax = [0, 0];
  // Outer contour per stick in 72 angle sectors, same method as the full test
  const BINS = 72;
  let bins = [new Float32Array(BINS), new Float32Array(BINS)];
  function track(k, x, y) {
    const r = Math.hypot(x, y);
    if (r <= 0.5) return;
    const b = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
    if (r > bins[k][b]) bins[k][b] = r;
  }
  function circ(k) {
    let n = 0, sum = 0;
    for (const v of bins[k]) if (v > 0) { n++; sum += Math.abs(v - 1); }
    return { coverage: n / BINS, error: n ? sum / n * 100 : null };
  }

  const pad = () => { const p = index == null ? null : navigator.getGamepads()[index]; return p && p.connected ? p : null; };
  window.addEventListener('gamepadconnected', e => { if (index == null && usable(e.gamepad)) index = e.gamepad.index; });
  window.addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === index) { index = null; seen.clear(); } });

  function stick(cv, x, y, k) {
    const r = Math.min(cv.clientWidth, 180), dpr = window.devicePixelRatio || 1;
    if (cv.width !== r * dpr) { cv.width = cv.height = r * dpr; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, r, r);
    const m = r / 2, R = m - 6;
    c.strokeStyle = css('--line2') || '#334'; c.lineWidth = 1;
    c.beginPath(); c.arc(m, m, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(m - R, m); c.lineTo(m + R, m); c.moveTo(m, m - R); c.lineTo(m, m + R); c.stroke();
    c.strokeStyle = css('--muted') || '#889'; c.beginPath();
    let first = true;
    for (let i = 0; i <= BINS; i++) {
      const v = bins[k][i % BINS]; if (!v) { first = true; continue; }
      const a = ((i % BINS) + 0.5) / BINS * 2 * Math.PI - Math.PI;
      const px = m + Math.cos(a) * v * R, py = m + Math.sin(a) * v * R;
      if (first) c.moveTo(px, py); else c.lineTo(px, py);
      first = false;
    }
    c.stroke();
    c.fillStyle = css('--primary') || '#2563eb';
    c.beginPath(); c.arc(m + x * R, m + y * R, 6, 0, Math.PI * 2); c.fill();
  }

  function frame() {
    requestAnimationFrame(frame);
    let p = pad();
    if (p && !usable(p)) { index = null; p = null; }
    if (!p) { const any = [...navigator.getGamepads()].find(usable); if (any) { index = any.index; p = any; } }
    if (hid) {
      box.hidden = !p;
      setText('qTitle', tr('Test rapide pour une autre manette'));
      setText('qDesc', tr('Cette manette n\'est pas une DualSense : seul le test simple est possible (boutons, sticks, gâchettes et vibration). Les infos usine, la batterie, la calibration et l\'historique d\'usage concernent la DualSense.'));
    }
    setText('qStatus', p ? p.id + (p.mapping === 'standard' ? '' : tr(' (disposition non standard)'))
      : tr('Branchez la manette, puis appuyez sur un bouton pour qu\'elle apparaisse.'));
    if (!p) return;
    const names = LAYOUTS[family(p)];
    if (grid.dataset.family !== family(p)) {
      grid.dataset.family = family(p);
      grid.querySelectorAll('.qbtn').forEach(b => { b.textContent = names[+b.dataset.i]; });
      setText('qL2n', names[6]); setText('qR2n', names[7]);
    }
    const ax = i => p.axes[i] || 0;
    if (!drift) { track(0, ax(0), ax(1)); track(1, ax(2), ax(3)); }
    stick($('qStickL'), ax(0), ax(1), 0); stick($('qStickR'), ax(2), ax(3), 1);
    const ct = (n, k) => { const r = circ(k); return r.error == null ? '' : n + tr(' : ') + r.error.toFixed(1) + ' % (' + tr('contour couvert ') + Math.round(r.coverage * 100) + ' %)'; };
    const cl = ct(tr('Gauche'), 0), cr = ct(tr('Droit'), 1);
    $('qCirc').textContent = cl || cr ? tr('Circularité, faites tourner les sticks en butée') + tr(' : ') + [cl, cr].filter(Boolean).join(' | ') : '';
    $('qValL').textContent = (ax(0) * 100).toFixed(0) + ' / ' + (ax(1) * 100).toFixed(0);
    $('qValR').textContent = (ax(2) * 100).toFixed(0) + ' / ' + (ax(3) * 100).toFixed(0);
    const tv = i => (p.buttons[i] ? p.buttons[i].value : 0);
    // Full travel: a healthy trigger reaches 100 % when pressed to the end
    [[6, 'qL2'], [7, 'qR2']].forEach(([i, id], k) => {
      const v = tv(i); trigMax[k] = Math.max(trigMax[k], v);
      $(id).style.width = (v * 100).toFixed(1) + '%';
      setText(id + 'v', (v * 100).toFixed(0) + ' %' + (trigMax[k] > 0.05 ? tr(' · max ') + (trigMax[k] * 100).toFixed(0) + ' %' + (trigMax[k] >= 0.98 ? ' ✔' : '') : ''));
    });
    grid.querySelectorAll('.qbtn').forEach(b => {
      const k = p.buttons[+b.dataset.i];
      const on = !!(k && k.pressed);
      if (on) seen.add(b.dataset.i);
      b.classList.toggle('on', on);
      b.classList.toggle('seen', seen.has(b.dataset.i));
      b.hidden = !k;
    });
    $('qCount').textContent = tr('{n} / {t} boutons vérifiés', { n: seen.size, t: Math.min(NAMES.length, p.buttons.length) });
    if (drift) {
      drift.s.push([ax(0), ax(1), ax(2), ax(3)]);
      if (performance.now() - drift.t0 > 3000) finishDrift();
    }
  }

  // Same method and limits as the full drift test: mean offset and 95th percentile noise
  function finishDrift() {
    const s = drift.s; drift = null;
    $('qDrift').disabled = false;
    const res = [0, 2].map(i => {
      const k = s.length || 1;
      const mx = s.reduce((a, v) => a + v[i], 0) / k, my = s.reduce((a, v) => a + v[i + 1], 0) / k;
      const d = s.map(v => Math.hypot(v[i] - mx, v[i + 1] - my)).sort((a, b) => a - b);
      const offset = Math.hypot(mx, my) * 100, noise = (d[Math.floor(d.length * 0.95)] || 0) * 100;
      return { offset, noise, deadzone: Math.ceil(offset + noise + 1), moved: (d[d.length - 1] || 0) > 0.08 };
    });
    if (res.some(r => r.moved)) { $('qDriftRes').textContent = tr('Mouvement détecté : relancez sans toucher les sticks.'); return; }
    const q = r => r.noise > 1.5 ? tr('potentiomètre usé') : r.offset <= 1.25 ? tr('parfait') : r.offset <= 3.5 ? tr('bon')
      : r.offset <= 6 ? tr('léger décalage, calibration conseillée') : tr('DÉRIVE');
    const f = (n, r) => n + tr(' : ') + r.offset.toFixed(1) + ' % (' + q(r) + tr('), bruit ') + r.noise.toFixed(1) + tr(' %, zone morte conseillée ') + r.deadzone + ' %';
    driftText = f(tr('Gauche'), res[0]) + ' | ' + f(tr('Droit'), res[1]);
    $('qDriftRes').textContent = driftText + tr('. Le navigateur peut appliquer sa propre zone morte : la valeur exacte demande Chrome ou Edge.');
  }
  $('qDrift').addEventListener('click', () => {
    if (!pad()) return;
    drift = { s: [], t0: performance.now() };
    $('qDrift').disabled = true;
    $('qDriftRes').textContent = tr('Mesure en cours, ne touchez pas les sticks…');
  });

  $('qClear').addEventListener('click', () => { bins = [new Float32Array(BINS), new Float32Array(BINS)]; seen.clear(); trigMax = [0, 0]; driftText = ''; });

  // Plain text summary, handy on a phone for a sale listing
  $('qCopy').addEventListener('click', async () => {
    const p = pad();
    if (!p) return;
    const names = LAYOUTS[family(p)], n = Math.min(names.length, p.buttons.length);
    const missing = names.slice(0, n).filter((x, i) => !seen.has(String(i)));
    const L = [p.id];
    L.push(tr('{n} / {t} boutons vérifiés', { n: seen.size, t: n }) + (missing.length && missing.length < n ? ' (' + tr('non testés : ') + missing.join(' ') + ')' : ''));
    L.push(names[6] + ' / ' + names[7] + tr(' : ') + 'max ' + (trigMax[0] * 100).toFixed(0) + ' % / ' + (trigMax[1] * 100).toFixed(0) + ' %');
    if ($('qCirc').textContent) L.push($('qCirc').textContent);
    if (driftText) L.push(tr('Dérive') + tr(' : ') + driftText);
    L.push('', tr('Test rapide ZerPad') + ' – https://anzher44.github.io/zerpad/');
    const txt = L.join('\n');
    try { await navigator.clipboard.writeText(txt); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* nothing more to try */ }
      ta.remove();
    }
    const b = $('qCopy'); b.textContent = tr('Résumé copié');
    setTimeout(() => { b.textContent = tr('Copier le résumé'); }, 2000);
  });

  $('qRumble').addEventListener('click', () => {
    const p = pad(), a = p && p.vibrationActuator;
    if (!a || !a.playEffect) { $('qRumbleRes').textContent = tr('Ce navigateur ne permet pas la vibration.'); return; }
    a.playEffect('dual-rumble', { duration: 800, strongMagnitude: 1, weakMagnitude: 1 })
      .then(() => { $('qRumbleRes').textContent = tr('Les deux moteurs ont-ils vibré ?'); })
      .catch(() => { $('qRumbleRes').textContent = tr('Ce navigateur ne permet pas la vibration.'); });
  });

  requestAnimationFrame(frame);
})();
