// Quick test for browsers without WebHID (Firefox, Safari, Chrome on Android), through the
// standard Gamepad API: buttons, sticks, triggers, stick drift and a short rumble when the
// browser offers it. Factory data, calibration and telemetry need WebHID and stay unavailable.
(function () {
  'use strict';
  if (window.DualSense && window.DualSense.supported) return;
  const box = document.getElementById('quick');
  if (!box || !('getGamepads' in navigator)) return;
  const $ = id => document.getElementById(id);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  box.hidden = false;

  // Standard mapping order (w3c.github.io/gamepad/#remapping), DualSense names
  const NAMES = ['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'Touchpad'];
  const grid = $('qButtons');
  NAMES.forEach((n, i) => {
    const b = document.createElement('span');
    b.className = 'qbtn'; b.textContent = n; b.dataset.i = i;
    grid.appendChild(b);
  });
  const seen = new Set();
  let index = null, drift = null;

  const pad = () => { const p = index == null ? null : navigator.getGamepads()[index]; return p && p.connected ? p : null; };
  window.addEventListener('gamepadconnected', e => { if (index == null) index = e.gamepad.index; });
  window.addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === index) { index = null; seen.clear(); } });

  function stick(cv, x, y) {
    const r = Math.min(cv.clientWidth, 180), dpr = window.devicePixelRatio || 1;
    if (cv.width !== r * dpr) { cv.width = cv.height = r * dpr; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, r, r);
    const m = r / 2, R = m - 6;
    c.strokeStyle = css('--line2') || '#334'; c.lineWidth = 1;
    c.beginPath(); c.arc(m, m, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(m - R, m); c.lineTo(m + R, m); c.moveTo(m, m - R); c.lineTo(m, m + R); c.stroke();
    c.fillStyle = css('--primary') || '#2563eb';
    c.beginPath(); c.arc(m + x * R, m + y * R, 6, 0, Math.PI * 2); c.fill();
  }

  function frame() {
    requestAnimationFrame(frame);
    let p = pad();
    if (!p) { const any = [...navigator.getGamepads()].find(g => g && g.connected); if (any) { index = any.index; p = any; } }
    $('qStatus').textContent = p ? p.id + (p.mapping === 'standard' ? '' : tr(' (disposition non standard)'))
      : tr('Branchez la manette, puis appuyez sur un bouton pour qu\'elle apparaisse.');
    if (!p) return;
    const ax = i => p.axes[i] || 0;
    stick($('qStickL'), ax(0), ax(1)); stick($('qStickR'), ax(2), ax(3));
    $('qValL').textContent = (ax(0) * 100).toFixed(0) + ' / ' + (ax(1) * 100).toFixed(0);
    $('qValR').textContent = (ax(2) * 100).toFixed(0) + ' / ' + (ax(3) * 100).toFixed(0);
    const tv = i => (p.buttons[i] ? p.buttons[i].value : 0);
    $('qL2').style.width = (tv(6) * 100).toFixed(1) + '%'; $('qL2v').textContent = (tv(6) * 100).toFixed(0) + ' %';
    $('qR2').style.width = (tv(7) * 100).toFixed(1) + '%'; $('qR2v').textContent = (tv(7) * 100).toFixed(0) + ' %';
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
      return { offset: Math.hypot(mx, my) * 100, noise: (d[Math.floor(d.length * 0.95)] || 0) * 100, moved: (d[d.length - 1] || 0) > 0.08 };
    });
    if (res.some(r => r.moved)) { $('qDriftRes').textContent = tr('Mouvement détecté : relancez sans toucher les sticks.'); return; }
    const q = r => r.noise > 1.5 ? tr('potentiomètre usé') : r.offset <= 1.25 ? tr('parfait') : r.offset <= 3.5 ? tr('bon')
      : r.offset <= 6 ? tr('léger décalage, calibration conseillée') : tr('DÉRIVE');
    const f = (n, r) => n + ' : ' + r.offset.toFixed(1) + ' % (' + q(r) + ')';
    $('qDriftRes').textContent = f(tr('Gauche'), res[0]) + ' | ' + f(tr('Droit'), res[1]) +
      tr('. Le navigateur peut appliquer sa propre zone morte : la valeur exacte demande Chrome ou Edge.');
  }
  $('qDrift').addEventListener('click', () => {
    if (!pad()) return;
    drift = { s: [], t0: performance.now() };
    $('qDrift').disabled = true;
    $('qDriftRes').textContent = tr('Mesure en cours, ne touchez pas les sticks…');
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
