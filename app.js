/* app.js — interface, visualisation et tests de validation. */
(function () {
  'use strict';
  const VERSION = '1.0.0';
  const { hex, hexDump, TriggerFx, fwString, TOUCH_W, TOUCH_H } = window.DSUtil;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ds = new DualSense();
  window.ds = ds; // pratique pour le débogage dans la console

  // ================= Onglets =================
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
  }));

  // ================= Connexion =================
  if (!DualSense.supported) {
    $('unsupported').hidden = false;
    $('btnConnect').disabled = true;
  }

  $('btnConnect').addEventListener('click', async () => {
    try { await ds.request(); }
    catch (e) { log('Connexion annulée ou impossible : ' + e.message); }
  });
  $('btnDisconnect').addEventListener('click', () => ds.close());

  if (DualSense.supported) {
    // Reconnexion automatique à une manette déjà autorisée
    navigator.hid.getDevices().then(devs => {
      const d = devs.find(d => DualSense.filters.some(f => f.vendorId === d.vendorId && f.productId === d.productId));
      if (d) ds.open(d).catch(e => log('Reconnexion impossible : ' + e.message));
    });
    navigator.hid.addEventListener('disconnect', e => {
      if (ds.device && e.device === ds.device) {
        log('Manette débranchée');
        ds.device = null;
        ds.dispatchEvent(new Event('closed'));
      }
    });
    navigator.hid.addEventListener('connect', e => {
      if (!ds.device && DualSense.filters.some(f => f.productId === e.device.productId && f.vendorId === e.device.vendorId)) {
        ds.open(e.device).catch(err => log('Reconnexion impossible : ' + err.message));
      }
    });
  }

  ds.addEventListener('log', e => log(e.detail));
  ds.addEventListener('ready', () => {
    $('connStatus').textContent = 'Connectée — ' + ds.model;
    $('connStatus').className = 'pill on';
    $('btnConnect').hidden = true;
    $('btnDisconnect').hidden = false;
    $('hint').hidden = true;
    renderInfo();
    renderFeatures();
    buildButtonGrid();
    buildTests();
  });
  ds.addEventListener('transport', () => { renderInfo(); });
  ds.addEventListener('info', () => { renderInfo(); renderFeatures(); });
  ds.addEventListener('closed', () => {
    $('connStatus').textContent = 'Non connectée';
    $('connStatus').className = 'pill off';
    $('btnConnect').hidden = false;
    $('btnDisconnect').hidden = true;
    $('bthint').hidden = true;
  });

  function log(msg) {
    const el = $('log');
    const t = new Date().toLocaleTimeString();
    el.textContent = '[' + t + '] ' + msg + '\n' + el.textContent.slice(0, 8000);
  }

  // ================= Infos =================
  function renderInfo() {
    const i = ds.info;
    $('i-model').textContent = i.model || '—';
    $('i-name').textContent = i.productName || '—';
    $('i-vidpid').textContent = i.vendorId != null ? '0x' + hex(i.vendorId, 4) + ' : 0x' + hex(i.productId, 4) : '—';
    $('i-conn').textContent = ds.transport === 'bt' ? 'Bluetooth' : ds.transport === 'usb' ? 'USB (câble)' : '—';
    $('bthint').hidden = ds.transport !== 'bt';
    $('i-mac').textContent = i.mac || '—';
    $('i-fw').textContent = fwString(i.fwVersion);
    $('i-upd').textContent = i.updateVersion != null ? hex(i.updateVersion >> 8) + '.' + hex(i.updateVersion & 0xff) + '  (0x' + hex(i.updateVersion, 4) + ')' : '—';
    $('i-hw').textContent = i.hwVersion != null ? '0x' + hex(i.hwVersion, 8) : '—';
    $('i-build').textContent = i.buildDate ? i.buildDate + ' ' + (i.buildTime || '') : '—';
    $('i-fwtype').textContent = i.fwType != null ? '0x' + hex(i.fwType, 4) + ' / 0x' + hex(i.swSeries, 4) : '—';
    const c = ds.calib;
    const body = $('calibBody');
    if (!c) { body.innerHTML = '<tr><td>—</td></tr>'; return; }
    const rows = [
      ['Validité', c.valid ? '✔ cohérente' : '✘ incohérente (valeurs par défaut utilisées)'],
      ['Biais gyro (P/Y/R)', c.gyroPitchBias + ' / ' + c.gyroYawBias + ' / ' + c.gyroRollBias],
      ['Gyro pitch +/-', c.gyroPitchPlus + ' / ' + c.gyroPitchMinus],
      ['Gyro yaw +/-', c.gyroYawPlus + ' / ' + c.gyroYawMinus],
      ['Gyro roll +/-', c.gyroRollPlus + ' / ' + c.gyroRollMinus],
      ['Vitesse ref +/-', c.gyroSpeedPlus + ' / ' + c.gyroSpeedMinus],
      ['Accél X +/-', c.accXPlus + ' / ' + c.accXMinus],
      ['Accél Y +/-', c.accYPlus + ' / ' + c.accYMinus],
      ['Accél Z +/-', c.accZPlus + ' / ' + c.accZMinus],
    ];
    body.innerHTML = rows.map(r => '<tr><th>' + r[0] + '</th><td class="mono">' + r[1] + '</td></tr>').join('');
  }

  function renderFeatures() {
    const names = { 0x05: 'Calibration IMU', 0x09: 'Appairage / MAC', 0x20: 'Firmware' };
    $('rawFeature').textContent = Object.keys(ds.features).map(id =>
      '# 0x' + hex(+id) + ' ' + (names[id] || '') + ' (' + ds.features[id].length + ' octets)\n' + hexDump(ds.features[id])
    ).join('\n\n') || '—';
  }

  // ================= Boutons =================
  const BUTTONS = [
    ['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→'],
    ['triangle', '△'], ['circle', '○'], ['cross', '✕'], ['square', '□'],
    ['l1', 'L1'], ['r1', 'R1'], ['l2', 'L2'], ['r2', 'R2'],
    ['l3', 'L3'], ['r3', 'R3'], ['create', 'Create'], ['options', 'Options'],
    ['ps', 'PS'], ['touchpad', 'Pavé (clic)'], ['mute', 'Micro'],
  ];
  const EDGE_BUTTONS = [['fnL', 'Fn G'], ['fnR', 'Fn D'], ['paddleL', 'Palette G'], ['paddleR', 'Palette D']];
  const buttonList = () => ds.model === 'DualSense Edge' ? BUTTONS.concat(EDGE_BUTTONS) : BUTTONS;
  const btnEls = {};
  function buildButtonGrid() {
    const g = $('btnGrid'); g.innerHTML = '';
    for (const [k, label] of buttonList()) {
      const d = document.createElement('div');
      d.className = 'btn'; d.textContent = label; d.title = k;
      g.appendChild(d); btnEls[k] = d;
    }
  }
  buildButtonGrid();

  // ================= Statistiques sticks (circularité) =================
  const BINS = 72;
  function newStickStats() {
    return { bins: new Float32Array(BINS), minX: 255, maxX: 0, minY: 255, maxY: 0, trace: [] };
  }
  const stickStats = { L: newStickStats(), R: newStickStats() };
  const norm = v => (v - 127.5) / 127.5;
  function updateStick(s, x, y) {
    s.minX = Math.min(s.minX, x); s.maxX = Math.max(s.maxX, x);
    s.minY = Math.min(s.minY, y); s.maxY = Math.max(s.maxY, y);
    const nx = norm(x), ny = norm(y), r = Math.hypot(nx, ny);
    if (r > 0.5) {
      const b = Math.floor(((Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
      if (r > s.bins[b]) s.bins[b] = r;
    }
    s.trace.push([nx, ny]); if (s.trace.length > 400) s.trace.shift();
  }
  function circularity(s) {
    let n = 0, sum = 0;
    for (let i = 0; i < BINS; i++) if (s.bins[i] > 0) { n++; sum += (s.bins[i] - 1) ** 2; }
    return { coverage: n / BINS, error: n ? Math.sqrt(sum / n) * 100 : null };
  }
  $('btnClearTrace').addEventListener('click', () => { stickStats.L = newStickStats(); stickStats.R = newStickStats(); });

  // ================= Historique mouvement / tactile =================
  const motionHist = [];
  const touchTrails = [[], []];

  // ================= Réception des états =================
  ds.addEventListener('state', e => {
    const st = e.detail;
    updateStick(stickStats.L, st.lx, st.ly);
    updateStick(stickStats.R, st.rx, st.ry);
    if (st.gyro) { motionHist.push(st.gyro.slice()); if (motionHist.length > 320) motionHist.shift(); }
    (st.touches || []).forEach((t, k) => {
      if (t.active) { touchTrails[k].push([t.x, t.y]); if (touchTrails[k].length > 200) touchTrails[k].shift(); }
      else touchTrails[k].length = 0;
    });
    for (const t of tests) if (t.status === 'running' && t.onState) t.onState(st);
  });

  // ================= Boucle d'affichage =================
  let lastRawDraw = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const st = ds.state;
    if (!st) return;
    for (const [k] of buttonList()) if (btnEls[k]) btnEls[k].classList.toggle('on', !!st.buttons[k]);
    drawStick($('cvL'), stickStats.L, st.lx, st.ly);
    drawStick($('cvR'), stickStats.R, st.rx, st.ry);
    const cL = circularity(stickStats.L), cR = circularity(stickStats.R);
    $('txL').textContent = st.lx + ',' + st.ly + (cL.error != null ? ' · circ. ' + cL.error.toFixed(1) + '%' : '');
    $('txR').textContent = st.rx + ',' + st.ry + (cR.error != null ? ' · circ. ' + cR.error.toFixed(1) + '%' : '');
    $('barL2').style.width = (st.l2 / 2.55) + '%'; $('valL2').textContent = st.l2;
    $('barR2').style.width = (st.r2 / 2.55) + '%'; $('valR2').textContent = st.r2;
    if (st.gyro) {
      ['gx', 'gy', 'gz'].forEach((id, i) => $(id).textContent = st.gyro[i].toFixed(1) + '  (brut ' + st.gyroRaw[i] + ')');
      ['ax', 'ay', 'az'].forEach((id, i) => $(id).textContent = st.accel[i].toFixed(3) + '  (brut ' + st.accelRaw[i] + ')');
      $('amag').textContent = Math.hypot(...st.accel).toFixed(3);
      drawMotion();
    }
    drawTouch(st);
    if (st.battery) {
      $('i-bat').textContent = st.battery.pct != null ? st.battery.pct + ' %' : '—';
      $('batFill').style.width = (st.battery.pct || 0) + '%';
      $('batFill').className = st.battery.pct != null && st.battery.pct <= 20 ? 'low' : '';
      $('i-charge').textContent = st.battery.label;
      $('i-jack').textContent = (st.plug.headphones ? 'Casque détecté' : 'Rien de branché') + (st.plug.mic ? ' · micro externe' : '') + '  (0x' + hex(st.plug.raw) + ')';
      $('i-ts').textContent = st.sensorTs;
    }
    $('i-rate').textContent = ds.reportRate ? ds.reportRate + ' rapports/s (≈ ' + (1000 / ds.reportRate).toFixed(1) + ' ms)' : '—';
    $('i-mode').textContent = ds.simpleMode ? 'Simplifié (Bluetooth sans capteurs)' : 'Complet — rapport 0x' + hex(st.reportId);
    if (now - lastRawDraw > 100 && ds.lastRaw) {
      lastRawDraw = now;
      $('rawInput').textContent = '# rapport 0x' + hex(ds.lastRaw.id) + ' (' + ds.lastRaw.data.length + ' octets, sans ID)\n' + hexDump(ds.lastRaw.data);
    }
    for (const t of tests) if (t.status === 'running' && t.tick) t.tick(now);
  }
  requestAnimationFrame(frame);

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawStick(cv, s, x, y) {
    const ctx = cv.getContext('2d'), W = cv.width, R = W / 2 - 10, C = W / 2;
    ctx.clearRect(0, 0, W, W);
    ctx.strokeStyle = css('--line'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(C, C, R, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(C - R, C); ctx.lineTo(C + R, C); ctx.moveTo(C, C - R); ctx.lineTo(C, C + R); ctx.stroke();
    // zone de tolérance dérive (10 %)
    ctx.strokeStyle = css('--muted'); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(C, C, R * 0.1, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // contour max mesuré
    ctx.strokeStyle = css('--accent2'); ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    for (let i = 0; i <= BINS; i++) {
      const b = i % BINS, r = s.bins[b];
      if (!r) { started = false; continue; }
      const a = (b + 0.5) / BINS * 2 * Math.PI - Math.PI;
      const px = C + Math.cos(a) * r * R, py = C + Math.sin(a) * r * R;
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // trace
    ctx.fillStyle = css('--muted');
    for (const [tx, ty] of s.trace) ctx.fillRect(C + tx * R - 1, C + ty * R - 1, 2, 2);
    ctx.fillStyle = css('--accent');
    ctx.beginPath(); ctx.arc(C + norm(x) * R, C + norm(y) * R, 7, 0, 7); ctx.fill();
  }

  function drawMotion() {
    const cv = $('cvMotion'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = css('--line'); ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    const cols = [css('--c1'), css('--c2'), css('--c3')];
    for (let a = 0; a < 3; a++) {
      ctx.strokeStyle = cols[a]; ctx.beginPath();
      motionHist.forEach((g, i) => {
        const y = H / 2 - Math.max(-1, Math.min(1, g[a] / 500)) * (H / 2 - 2);
        i ? ctx.lineTo(i, y) : ctx.moveTo(i, y);
      });
      ctx.stroke();
    }
  }

  // Couverture du pavé tactile pour le test
  const TGX = 12, TGY = 6;
  let touchGrid = new Uint8Array(TGX * TGY);
  let touchShowGrid = false;
  function drawTouch(st) {
    const cv = $('cvTouch'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = css('--panel2'); ctx.fillRect(0, 0, W, H);
    if (touchShowGrid) {
      for (let gy = 0; gy < TGY; gy++) for (let gx = 0; gx < TGX; gx++) {
        ctx.fillStyle = touchGrid[gy * TGX + gx] ? css('--okbg') : 'transparent';
        ctx.fillRect(gx * W / TGX + 1, gy * H / TGY + 1, W / TGX - 2, H / TGY - 2);
      }
    }
    const cols = [css('--accent'), css('--accent2')];
    (st.touches || []).forEach((t, k) => {
      ctx.strokeStyle = cols[k]; ctx.lineWidth = 3; ctx.beginPath();
      touchTrails[k].forEach(([x, y], i) => { const px = x / TOUCH_W * W, py = y / TOUCH_H * H; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.stroke();
      if (t.active) {
        ctx.fillStyle = cols[k];
        ctx.beginPath(); ctx.arc(t.x / TOUCH_W * W, t.y / TOUCH_H * H, 22, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(String(k + 1), t.x / TOUCH_W * W, t.y / TOUCH_H * H + 6);
      }
    });
    $('touchTxt').textContent = (st.touches || []).map((t, k) =>
      'Doigt ' + (k + 1) + ' : ' + (t.active ? 'x=' + t.x + ' y=' + t.y + ' (id ' + t.id + ')' : 'aucun')).join('   ·   ') +
      (st.buttons.touchpad ? '   ·   CLIC' : '');
  }

  // ================= Sorties =================
  const motL = $('motL'), motR = $('motR');
  motL.addEventListener('input', () => { $('motLv').textContent = motL.value; ds.update({ motorL: +motL.value }); });
  motR.addEventListener('input', () => { $('motRv').textContent = motR.value; ds.update({ motorR: +motR.value }); });
  $('btnMotStop').addEventListener('click', () => {
    motL.value = motR.value = 0; $('motLv').textContent = $('motRv').textContent = '0';
    ds.update({ motorL: 0, motorR: 0 });
  });
  $('lbColor').addEventListener('input', e => {
    const v = e.target.value; ds.update({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16) });
  });
  $('ledBright').addEventListener('change', e => ds.update({ ledBrightness: +e.target.value }));
  $('muteLed').addEventListener('change', e => ds.update({ muteLed: +e.target.value }));
  const pl = $('playerLeds');
  for (let i = 0; i < 5; i++) {
    const c = document.createElement('input'); c.type = 'checkbox'; c.title = 'LED ' + (i + 1);
    c.addEventListener('change', () => {
      let m = 0; pl.querySelectorAll('input').forEach((x, j) => { if (x.checked) m |= 1 << j; });
      ds.update({ playerLeds: m });
    });
    pl.appendChild(c);
  }
  ['fxStart', 'fxEnd', 'fxForce', 'fxFreq'].forEach(id => $(id).addEventListener('input', () => { $(id + 'V').textContent = $(id).value; }));
  $('btnFxApply').addEventListener('click', () => {
    const mode = $('fxMode').value, s = +$('fxStart').value, e = +$('fxEnd').value, f = +$('fxForce').value, hz = +$('fxFreq').value;
    let fx;
    switch (mode) {
      case 'feedback': fx = TriggerFx.feedback(s, f); break;
      case 'weapon': fx = TriggerFx.weapon(s, e, f); break;
      case 'vibration': fx = TriggerFx.vibration(s, f, hz); break;
      case 'rigid': fx = TriggerFx.rigid(); break;
      default: fx = TriggerFx.off();
    }
    const side = $('fxSide').value, patch = {};
    if (side !== 'R') patch.trigL = fx;
    if (side !== 'L') patch.trigR = fx;
    ds.update(patch);
  });

  // ---- Audio de la manette (USB) ----
  let audioOut = null, audioIn = null, micStream = null, micRAF = 0;
  const isPadAudio = d => /wireless controller|dualsense/i.test(d.label);
  $('btnAudioScan').addEventListener('click', scanAudio);
  async function scanAudio() {
    try {
      // L'autorisation micro est nécessaire pour obtenir les noms des périphériques
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      audioOut = devs.find(d => d.kind === 'audiooutput' && isPadAudio(d)) || null;
      audioIn = devs.find(d => d.kind === 'audioinput' && isPadAudio(d)) || null;
      $('audioStatus').textContent = 'Haut-parleur : ' + (audioOut ? audioOut.label : 'non trouvé') + ' · Micro : ' + (audioIn ? audioIn.label : 'non trouvé');
      $('btnSpeaker').disabled = !audioOut;
      $('btnMic').disabled = !audioIn;
      return { out: !!audioOut, in: !!audioIn };
    } catch (e) {
      $('audioStatus').textContent = 'Accès audio refusé ou indisponible : ' + e.message;
      return { out: false, in: false };
    }
  }
  async function beepPad() {
    if (!audioOut) return false;
    const ctx = new AudioContext();
    try {
      if (ctx.setSinkId) await ctx.setSinkId(audioOut.deviceId);
      else { $('audioStatus').textContent = 'Ce navigateur ne permet pas de choisir la sortie audio.'; return false; }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.4;
      o.connect(g).connect(ctx.destination);
      o.start(); o.frequency.setValueAtTime(660, ctx.currentTime + 0.4); o.stop(ctx.currentTime + 1.2);
      await new Promise(r => setTimeout(r, 1300));
      return true;
    } finally { ctx.close(); }
  }
  $('btnSpeaker').addEventListener('click', beepPad);
  let micPeak = 0;
  async function toggleMic(force) {
    if (micStream && force !== true) {
      micStream.getTracks().forEach(t => t.stop()); micStream = null; cancelAnimationFrame(micRAF);
      $('btnMic').textContent = 'Écouter le micro'; $('micLevel').style.width = '0';
      return;
    }
    if (!audioIn || micStream) return;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: audioIn.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    $('btnMic').textContent = 'Arrêter le micro';
    const ctx = new AudioContext(), an = ctx.createAnalyser();
    ctx.createMediaStreamSource(micStream).connect(an);
    const buf = new Float32Array(an.fftSize);
    micPeak = 0;
    const loop = () => {
      if (!micStream) { ctx.close(); return; }
      an.getFloatTimeDomainData(buf);
      let rms = 0; for (const v of buf) rms += v * v; rms = Math.sqrt(rms / buf.length);
      const lvl = Math.min(1, rms * 8); micPeak = Math.max(micPeak, lvl);
      $('micLevel').style.width = (lvl * 100) + '%';
      micRAF = requestAnimationFrame(loop);
    };
    loop();
  }
  $('btnMic').addEventListener('click', () => toggleMic().catch(e => log('Micro : ' + e.message)));

  // ================= Tests de validation =================
  let tests = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function T(def) {
    return Object.assign({ status: 'pending', detail: '', required: true, data: {} }, def);
  }

  function manual(id, title, instructions, action, opts = {}) {
    return T(Object.assign({
      id, title, instructions, kind: 'manual',
      async start(t) {
        t.status = 'running'; t.detail = 'En cours… puis confirmez ci-dessous.'; renderTests();
        try { await action(t); } catch (e) { t.detail = 'Erreur : ' + e.message; }
        t.awaitingConfirm = true; renderTests();
      },
    }, opts));
  }

  function buildTests() {
    stopAllRunning();
    const btnSet = buttonList().map(b => b[0]);
    tests = [
      T({
        id: 'conn', title: 'Communication & identité',
        instructions: 'Vérifie que la manette répond : rapports d\'entrée, firmware, adresse MAC, calibration.',
        kind: 'auto',
        async start(t) {
          t.status = 'running'; renderTests();
          const c0 = ds.reportCount; await sleep(1200);
          const n = ds.reportCount - c0;
          const okFw = ds.info.fwVersion != null, okMac = !!ds.info.mac, okCal = !!(ds.calib && ds.calib.valid);
          const okRate = n > 50;
          t.data = { reportsPerSec: Math.round(n / 1.2), firmware: okFw, mac: okMac, calibration: okCal, simpleMode: ds.simpleMode };
          t.detail = [
            (okRate ? '✔' : '✘') + ' ' + Math.round(n / 1.2) + ' rapports/s',
            (okFw ? '✔' : '✘') + ' firmware', (okMac ? '✔' : '✘') + ' MAC', (okCal ? '✔' : '✘') + ' calibration IMU',
            ds.simpleMode ? '✘ mode simplifié (capteurs non disponibles)' : '✔ rapport complet',
          ].join(' · ');
          finish(t, okRate && okFw && okMac && okCal && !ds.simpleMode);
        },
      }),
      T({
        id: 'battery', title: 'Batterie & charge',
        instructions: 'Lit l\'état de la batterie. En USB, la manette doit indiquer « En charge » ou « Chargée ». Échoue en cas d\'erreur de charge/température.',
        kind: 'auto',
        async start(t) {
          t.status = 'running'; renderTests(); await sleep(500);
          const b = ds.state && ds.state.battery;
          if (!b) { t.detail = 'Aucune donnée batterie (mode simplifié ?)'; return finish(t, false); }
          t.data = { percent: b.pct, state: b.label, raw: '0x' + hex(b.raw), transport: ds.transport };
          let ok = !b.error, note = '';
          if (ds.transport === 'usb' && b.label === 'Sur batterie') { ok = false; note = ' — branchée en USB mais ne charge pas (câble, port ou circuit de charge ?)'; }
          t.detail = (b.pct != null ? b.pct + ' % · ' : '') + b.label + note;
          finish(t, ok);
        },
      }),
      T({
        id: 'buttons', title: 'Tous les boutons (' + btnSet.length + ')',
        instructions: 'Appuyez puis relâchez chaque bouton une fois, y compris L3/R3 (cliquer les sticks), PS, Create, Options, Micro et le clic du pavé tactile.',
        kind: 'auto',
        start(t) { t.status = 'running'; t.data = { pressed: {}, done: {} }; renderTests(); },
        onState(st) {
          const d = this.data;
          for (const k of btnSet) {
            if (st.buttons[k]) d.pressed[k] = true;
            else if (d.pressed[k]) d.done[k] = true;
          }
          const n = Object.keys(d.done).length;
          const missing = btnSet.filter(k => !d.done[k]).map(k => (buttonList().find(b => b[0] === k) || [k, k])[1]);
          const txt = n + '/' + btnSet.length + (missing.length ? ' — reste : ' + missing.join(' ') : '');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (n === btnSet.length) finish(this, true);
        },
      }),
      T({
        id: 'drift', title: 'Sticks au repos (dérive / drift)',
        instructions: 'Lâchez complètement les deux sticks, posez la manette, puis cliquez « Lancer ». Mesure pendant 3 s. Tolérance : écart ≤ 10 %.',
        kind: 'auto',
        start(t) {
          t.status = 'running'; t.data = { s: [], t0: performance.now() }; t.detail = 'Ne touchez pas les sticks…'; renderTests();
        },
        onState(st) { this.data.s.push([st.lx, st.ly, st.rx, st.ry]); },
        tick(now) {
          const d = this.data;
          if (now - d.t0 < 3000) return;
          const res = {};
          [['L', 0], ['R', 2]].forEach(([n, i]) => {
            let mx = 0, sx = 0, sy = 0;
            for (const s of d.s) { const x = norm(s[i]), y = norm(s[i + 1]); mx = Math.max(mx, Math.hypot(x, y)); sx += x; sy += y; }
            const k = d.s.length || 1;
            res[n] = { maxDev: +(mx * 100).toFixed(1), meanX: +(sx / k * 100).toFixed(1), meanY: +(sy / k * 100).toFixed(1) };
          });
          this.data = { left: res.L, right: res.R, samples: d.s.length };
          const okL = res.L.maxDev <= 10, okR = res.R.maxDev <= 10;
          const q = v => v <= 5 ? 'excellent' : v <= 10 ? 'bon' : v <= 15 ? 'dérive légère' : 'DÉRIVE';
          this.detail = 'Gauche : ' + res.L.maxDev + ' % (' + q(res.L.maxDev) + ') · Droit : ' + res.R.maxDev + ' % (' + q(res.R.maxDev) + ')';
          finish(this, okL && okR && d.s.length > 20);
        },
      }),
      T({
        id: 'sticks', title: 'Sticks — amplitude & circularité',
        instructions: 'Faites tourner lentement chaque stick en butée, plusieurs tours complets. Exige : butées atteintes sur les 2 axes, contour couvert ≥ 90 %, erreur de circularité < 15 %.',
        kind: 'auto',
        start(t) { stickStats.L = newStickStats(); stickStats.R = newStickStats(); t.status = 'running'; renderTests(); },
        onState() {
          const r = {};
          let allOk = true;
          for (const n of ['L', 'R']) {
            const s = stickStats[n], c = circularity(s);
            const ext = s.minX <= 8 && s.maxX >= 247 && s.minY <= 8 && s.maxY >= 247;
            const ok = ext && c.coverage >= 0.9 && c.error != null && c.error < 15;
            r[n] = { ext, coverage: Math.round(c.coverage * 100), error: c.error != null ? +c.error.toFixed(1) : null, ok,
              range: [s.minX, s.maxX, s.minY, s.maxY] };
            allOk = allOk && ok;
          }
          this.data = { left: r.L, right: r.R };
          const f = (n, x) => n + ' : butées ' + (x.ext ? '✔' : '…') + ' · contour ' + x.coverage + ' %' + (x.error != null ? ' · circ. ' + x.error + ' %' : '');
          const txt = f('Gauche', r.L) + ' | ' + f('Droit', r.R);
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (allOk) finish(this, true);
        },
      }),
      T({
        id: 'triggers', title: 'Gâchettes analogiques L2 / R2',
        instructions: 'Enfoncez L2 puis R2 à fond, puis relâchez complètement. Exige : course 0 → ≥ 250 et retour au repos ≤ 5, bit numérique cohérent.',
        kind: 'auto',
        start(t) { t.status = 'running'; t.data = { L: { max: 0, back: false, dig: false }, R: { max: 0, back: false, dig: false } }; renderTests(); },
        onState(st) {
          const d = this.data;
          for (const [n, v, b] of [['L', st.l2, st.buttons.l2], ['R', st.r2, st.buttons.r2]]) {
            const x = d[n];
            x.max = Math.max(x.max, v);
            if (b && v > 100) x.dig = true;
            if (x.max >= 250 && v <= 5) x.back = true;
          }
          const ok = n => d[n].max >= 250 && d[n].back && d[n].dig;
          const txt = 'L2 max ' + d.L.max + (ok('L') ? ' ✔' : '') + ' · R2 max ' + d.R.max + (ok('R') ? ' ✔' : '');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (ok('L') && ok('R')) finish(this, true);
        },
      }),
      T({
        id: 'touchpad', title: 'Pavé tactile — surface & multi-touch',
        instructions: 'Glissez un doigt sur toute la surface du pavé (cases vertes sur le dessin, onglet Entrées), puis posez 2 doigts en même temps. Exige ≥ 95 % de surface.',
        kind: 'auto',
        start(t) { touchGrid = new Uint8Array(TGX * TGY); touchShowGrid = true; t.status = 'running'; t.data = { two: false }; renderTests(); },
        onState(st) {
          const ts = st.touches || [];
          ts.forEach(p => {
            if (!p.active) return;
            const gx = Math.min(TGX - 1, Math.floor(p.x / TOUCH_W * TGX)), gy = Math.min(TGY - 1, Math.floor(p.y / TOUCH_H * TGY));
            touchGrid[gy * TGX + gx] = 1;
          });
          if (ts.length === 2 && ts[0].active && ts[1].active) this.data.two = true;
          const cov = touchGrid.reduce((a, b) => a + b, 0) / touchGrid.length;
          this.data.coverage = Math.round(cov * 100);
          const txt = 'Surface ' + this.data.coverage + ' % · 2 doigts ' + (this.data.two ? '✔' : '…');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (cov >= 0.95 && this.data.two) { touchShowGrid = false; finish(this, true); }
        },
      }),
      T({
        id: 'imuStill', title: 'Capteurs au repos (gyroscope / accéléromètre)',
        instructions: 'Posez la manette à plat sur une table, ne la touchez plus, cliquez « Lancer ». Exige : gyro moyen < 3 °/s, bruit faible, |accélération| entre 0,9 et 1,1 g.',
        kind: 'auto',
        start(t) {
          if (ds.simpleMode || !ds.state || !ds.state.gyro) { t.detail = 'Capteurs indisponibles'; return finish(t, false); }
          t.status = 'running'; t.data = { g: [], a: [], t0: performance.now() }; t.detail = 'Mesure 3 s…'; renderTests();
        },
        onState(st) { if (st.gyro) { this.data.g.push(st.gyro); this.data.a.push(Math.hypot(...st.accel)); } },
        tick(now) {
          const d = this.data;
          if (now - d.t0 < 3000) return;
          const n = d.g.length || 1;
          const mean = [0, 1, 2].map(i => d.g.reduce((s, g) => s + g[i], 0) / n);
          const sd = [0, 1, 2].map(i => Math.sqrt(d.g.reduce((s, g) => s + (g[i] - mean[i]) ** 2, 0) / n));
          const am = d.a.reduce((s, v) => s + v, 0) / (d.a.length || 1);
          const maxMean = Math.max(...mean.map(Math.abs)), maxSd = Math.max(...sd);
          this.data = { gyroMean: mean.map(v => +v.toFixed(2)), gyroNoise: sd.map(v => +v.toFixed(2)), accelMagnitude: +am.toFixed(3), samples: d.g.length };
          const ok = maxMean < 3 && maxSd < 2 && am > 0.9 && am < 1.1 && d.g.length > 20;
          this.detail = 'Gyro moyen max ' + maxMean.toFixed(2) + ' °/s · bruit ' + maxSd.toFixed(2) + ' °/s · |a| = ' + am.toFixed(3) + ' g';
          finish(this, ok);
        },
      }),
      T({
        id: 'imuMove', title: 'Capteurs en mouvement',
        instructions: 'Tournez la manette dans tous les sens (comme un volant, en avant/arrière, à plat) et inclinez-la sur chaque côté. Exige : chaque axe gyro > 150 °/s et chaque axe accéléro atteint ±0,7 g.',
        kind: 'auto',
        start(t) {
          if (ds.simpleMode || !ds.state || !ds.state.gyro) { t.detail = 'Capteurs indisponibles'; return finish(t, false); }
          t.status = 'running'; t.data = { g: [0, 0, 0], ap: [0, 0, 0], an: [0, 0, 0] }; renderTests();
        },
        onState(st) {
          if (!st.gyro) return;
          const d = this.data;
          for (let i = 0; i < 3; i++) {
            d.g[i] = Math.max(d.g[i], Math.abs(st.gyro[i]));
            d.ap[i] = Math.max(d.ap[i], st.accel[i]); d.an[i] = Math.min(d.an[i], st.accel[i]);
          }
          const gOk = d.g.map(v => v > 150), aOk = [0, 1, 2].map(i => d.ap[i] > 0.7 && d.an[i] < -0.7);
          const ax = ['X', 'Y', 'Z'];
          const txt = 'Gyro ' + ax.map((a, i) => a + (gOk[i] ? '✔' : ' ' + Math.round(d.g[i]))).join(' ') +
            ' · Accél ' + ax.map((a, i) => a + (aOk[i] ? '✔' : '…')).join(' ');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (gOk.every(Boolean) && aOk.every(Boolean)) finish(this, true);
        },
      }),
      manual('rumbleL', 'Vibration — moteur gauche (fort)', 'Tenez la manette, cliquez « Lancer » : seul le côté gauche doit vibrer fortement pendant 1,5 s.',
        async () => { ds.update({ motorL: 255, motorR: 0 }); await sleep(1500); ds.update({ motorL: 0 }); }),
      manual('rumbleR', 'Vibration — moteur droit (léger)', 'Cliquez « Lancer » : le côté droit doit vibrer (vibration plus fine) pendant 1,5 s.',
        async () => { ds.update({ motorL: 0, motorR: 255 }); await sleep(1500); ds.update({ motorR: 0 }); }),
      manual('adaptL', 'Gâchette adaptative L2', 'Cliquez « Lancer », puis appuyez sur L2 : forte résistance, puis point dur « arme », puis vibration (≈ 3 s chacun). La gâchette doit revenir libre ensuite.',
        async () => { await trigSequence('trigL'); }),
      manual('adaptR', 'Gâchette adaptative R2', 'Cliquez « Lancer », puis appuyez sur R2 : forte résistance, puis point dur « arme », puis vibration (≈ 3 s chacun).',
        async () => { await trigSequence('trigR'); }),
      manual('lightbar', 'Barre lumineuse (RVB)', 'Cliquez « Lancer » : les bandes autour du pavé tactile passent en ROUGE, VERT, BLEU puis BLANC. Chaque couleur doit être nette, des deux côtés.',
        async () => {
          for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]) { ds.update({ r, g, b }); await sleep(1200); }
          ds.update({ r: 0, g: 64, b: 255 });
        }),
      manual('playerLeds', 'LED joueur (5 points blancs)', 'Cliquez « Lancer » : les 5 LED sous le pavé s\'allument une par une, puis toutes ensemble.',
        async () => {
          for (let i = 0; i < 5; i++) { ds.update({ playerLeds: 1 << i, ledBrightness: 0 }); await sleep(500); }
          ds.update({ playerLeds: 0x1f }); await sleep(1000); ds.update({ playerLeds: 0x04 });
        }),
      manual('muteLed', 'LED du bouton micro', 'Cliquez « Lancer » : la LED orange du bouton micro s\'allume, puis clignote.',
        async () => { ds.update({ muteLed: 1 }); await sleep(1500); ds.update({ muteLed: 2 }); await sleep(2500); ds.update({ muteLed: 0 }); }),
      manual('speaker', 'Haut-parleur interne (USB)', 'USB uniquement. Cliquez « Lancer » (autorisez le micro si demandé) : un bip doit sortir du haut-parleur de la manette.',
        async t => {
          const r = await scanAudio();
          if (!r.out) { t.detail = 'Haut-parleur de la manette introuvable (Bluetooth ? pilote audio ?). Vous pouvez passer ce test.'; return; }
          await beepPad(); await sleep(200); await beepPad();
        }, { required: false }),
      T({
        id: 'mic', title: 'Microphone interne (USB)', required: false, kind: 'auto',
        instructions: 'USB uniquement. Cliquez « Lancer », puis parlez ou soufflez près du micro (petit trou à côté du port de charge). Le niveau doit monter.',
        async start(t) {
          t.status = 'running'; t.detail = 'Recherche du micro…'; renderTests();
          const r = await scanAudio();
          if (!r.in) { t.detail = 'Micro de la manette introuvable (Bluetooth ?). Vous pouvez passer ce test.'; return finish(t, false); }
          try { await toggleMic(true); } catch (e) { t.detail = 'Erreur micro : ' + e.message; return finish(t, false); }
          t.data = { t0: performance.now() }; t.detail = 'Parlez maintenant…'; micPeak = 0; renderTestBody(t);
        },
        tick(now) {
          if (!this.data.t0) return;
          if (micPeak > 0.25) { this.data = { peak: +micPeak.toFixed(2) }; toggleMic(); this.detail = 'Son capté (crête ' + Math.round(micPeak * 100) + ' %)'; finish(this, true); }
          else if (now - this.data.t0 > 10000) { this.data = { peak: +micPeak.toFixed(2) }; toggleMic(); this.detail = 'Aucun son suffisant capté en 10 s'; finish(this, false); }
        },
      }),
      T({
        id: 'jack', title: 'Prise jack 3,5 mm', required: false, kind: 'auto',
        instructions: 'Branchez un casque ou des écouteurs dans la prise jack de la manette. La détection doit passer à « Casque détecté ».',
        start(t) { t.status = 'running'; t.detail = 'Branchez un casque…'; renderTests(); },
        onState(st) { if (st.plug && st.plug.headphones) { this.data = { raw: '0x' + hex(st.plug.raw) }; this.detail = 'Casque détecté'; finish(this, true); } },
      }),
    ];
    renderTests();
  }

  async function trigSequence(key) {
    ds.update({ [key]: TriggerFx.feedback(1, 8) }); await sleep(3000);
    ds.update({ [key]: TriggerFx.weapon(3, 6, 8) }); await sleep(3000);
    ds.update({ [key]: TriggerFx.vibration(1, 8, 25) }); await sleep(3000);
    ds.update({ [key]: TriggerFx.off() });
  }

  function finish(t, ok) {
    t.status = ok ? 'pass' : 'fail';
    t.awaitingConfirm = false;
    t.finishedAt = new Date().toISOString();
    renderTests();
  }
  function stopAllRunning() {
    touchShowGrid = false;
    for (const t of tests) if (t.status === 'running') t.status = 'pending';
  }

  const STATUS_TXT = { pending: 'À faire', running: 'En cours', pass: 'OK', fail: 'ÉCHEC', skip: 'Passé' };
  function renderTests() {
    const box = $('testList');
    if (!tests.length) { box.innerHTML = '<div class="card small">Connectez une manette pour afficher les tests.</div>'; renderVerdict(); return; }
    box.innerHTML = '';
    tests.forEach((t, idx) => {
      const el = document.createElement('div');
      el.className = 'test ' + t.status;
      el.id = 'test-' + t.id;
      el.innerHTML =
        '<div class="thead"><span class="num">' + (idx + 1) + '</span><h3>' + t.title + (t.required ? '' : ' <small>(optionnel)</small>') + '</h3>' +
        '<span class="badge ' + t.status + '">' + STATUS_TXT[t.status] + '</span></div>' +
        '<p class="small">' + t.instructions + '</p>' +
        '<p class="detail mono small"></p><div class="tact"></div>';
      el.querySelector('.detail').textContent = t.detail;
      const act = el.querySelector('.tact');
      const mk = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.addEventListener('click', fn); act.appendChild(b); };
      if (t.status === 'running' && t.awaitingConfirm) {
        mk('✔ Fonctionne', 'ok', () => { t.detail = 'Confirmé par l\'opérateur'; finish(t, true); });
        mk('✘ Ne fonctionne pas', 'bad', () => { t.detail = 'Signalé défectueux par l\'opérateur'; finish(t, false); });
        mk('Relancer', 'ghost', () => t.start(t));
      } else if (t.status === 'running') {
        if (t.kind === 'auto') mk('Abandonner (échec)', 'bad', () => { t.detail += ' — abandonné'; finish(t, false); });
        mk('Passer', 'ghost', () => { t.status = 'skip'; touchShowGrid = false; renderTests(); });
      } else {
        mk(t.status === 'pending' ? 'Lancer' : 'Relancer', 'primary', () => {
          if (!ds.device) { alert('Connectez d\'abord la manette.'); return; }
          t.detail = ''; t.start(t);
        });
        if (t.status === 'pending') mk('Passer', 'ghost', () => { t.status = 'skip'; renderTests(); });
      }
      box.appendChild(el);
    });
    renderVerdict();
  }
  function renderTestBody(t) {
    const el = $('test-' + t.id);
    if (el) el.querySelector('.detail').textContent = t.detail;
  }

  function computeVerdict() {
    if (!tests.length) return { key: 'none', label: 'Aucun test lancé', detail: '' };
    const req = tests.filter(t => t.required);
    const failed = tests.filter(t => t.status === 'fail' && t.required);
    const optFailed = tests.filter(t => t.status === 'fail' && !t.required);
    const done = req.filter(t => t.status === 'pass').length;
    const notDone = req.filter(t => t.status !== 'pass' && t.status !== 'fail');
    if (failed.length) return { key: 'bad', label: 'NON VALIDÉE', detail: 'Échec : ' + failed.map(t => t.title).join(', ') };
    if (notDone.length) {
      if (!tests.some(t => t.status !== 'pending')) return { key: 'none', label: 'Aucun test lancé', detail: req.length + ' tests obligatoires à réaliser.' };
      return { key: 'partial', label: 'INCOMPLÈTE', detail: done + '/' + req.length + ' tests obligatoires réussis. Restants : ' + notDone.map(t => t.title).join(', ') };
    }
    return { key: 'ok', label: 'VALIDÉE ✔', detail: 'Tous les tests obligatoires sont réussis (' + req.length + '/' + req.length + ').' + (optFailed.length ? ' Optionnels en échec : ' + optFailed.map(t => t.title).join(', ') : '') };
  }
  function renderVerdict() {
    const v = computeVerdict();
    $('verdict').className = 'verdict ' + v.key;
    $('verdict').textContent = v.label;
    $('verdictDetail').textContent = v.detail;
  }

  $('btnResetTests').addEventListener('click', () => { if (ds.device) buildTests(); });

  // ================= Rapport =================
  function buildReport() {
    const v = computeVerdict();
    const i = ds.info;
    return {
      tool: 'Testeur DualSense', toolVersion: VERSION,
      date: new Date().toISOString(),
      unit: $('unitLabel').value, notes: $('unitNotes').value,
      verdict: v.label, verdictDetail: v.detail,
      device: {
        model: i.model, productName: i.productName,
        vidPid: i.vendorId != null ? '0x' + hex(i.vendorId, 4) + ':0x' + hex(i.productId, 4) : null,
        transport: ds.transport, mac: i.mac || null,
        firmware: i.fwVersion != null ? '0x' + hex(i.fwVersion, 8) : null,
        updateVersion: i.updateVersion != null ? '0x' + hex(i.updateVersion, 4) : null,
        hardware: i.hwVersion != null ? '0x' + hex(i.hwVersion, 8) : null,
        firmwareBuild: i.buildDate ? i.buildDate + ' ' + i.buildTime : null,
        battery: ds.state && ds.state.battery ? { percent: ds.state.battery.pct, state: ds.state.battery.label } : null,
        reportRate: ds.reportRate,
        imuCalibrationValid: ds.calib ? ds.calib.valid : null,
      },
      tests: tests.map(t => ({ id: t.id, title: t.title, required: t.required, status: t.status, detail: t.detail, data: t.data, at: t.finishedAt || null })),
    };
  }
  function saveHistory(r) {
    try {
      const h = JSON.parse(localStorage.getItem('dsTester.history') || '[]');
      h.unshift({ date: r.date, unit: r.unit, mac: r.device.mac, verdict: r.verdict, model: r.device.model });
      localStorage.setItem('dsTester.history', JSON.stringify(h.slice(0, 50)));
    } catch (e) { /* stockage indisponible */ }
    renderHistory();
  }
  function renderHistory() {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('dsTester.history') || '[]'); } catch (e) { /* ignore */ }
    $('history').innerHTML = h.length ? '<table class="kv"><tbody>' + h.map(x =>
      '<tr><td>' + new Date(x.date).toLocaleString() + '</td><td>' + esc(x.model || '') + '</td><td class="mono">' + esc(x.mac || '') + '</td><td>' + esc(x.unit || '') + '</td><td><b>' + esc(x.verdict) + '</b></td></tr>'
    ).join('') + '</tbody></table>' : 'Aucun rapport enregistré.';
  }
  renderHistory();

  $('btnExportJson').addEventListener('click', () => {
    const r = buildReport(); saveHistory(r);
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rapport-dualsense-' + (r.device.mac || 'inconnue').replace(/:/g, '') + '-' + r.date.slice(0, 19).replace(/[:T]/g, '-') + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('btnPrint').addEventListener('click', () => {
    const r = buildReport(); saveHistory(r);
    const d = r.device;
    const rows = [['Modèle', d.model], ['Nom', d.productName], ['VID:PID', d.vidPid], ['Connexion', d.transport === 'bt' ? 'Bluetooth' : 'USB'],
      ['Adresse MAC', d.mac], ['Firmware', d.firmware], ['Version MAJ', d.updateVersion], ['Matériel', d.hardware], ['Compilation FW', d.firmwareBuild],
      ['Batterie', d.battery ? (d.battery.percent != null ? d.battery.percent + ' % — ' : '') + d.battery.state : null],
      ['Fréquence', d.reportRate ? d.reportRate + ' rapports/s' : null]];
    $('printReport').innerHTML =
      '<h1>Rapport de test — Manette ' + esc(d.model || 'DualSense') + '</h1>' +
      '<p>' + new Date(r.date).toLocaleString() + (r.unit ? ' · <b>' + esc(r.unit) + '</b>' : '') + '</p>' +
      '<div class="pverdict ' + computeVerdict().key + '">' + esc(r.verdict) + '</div><p>' + esc(r.verdictDetail) + '</p>' +
      (r.notes ? '<p><b>Notes :</b> ' + esc(r.notes) + '</p>' : '') +
      '<h2>Identité</h2><table>' + rows.map(x => '<tr><th>' + x[0] + '</th><td>' + esc(x[1] == null ? '—' : x[1]) + '</td></tr>').join('') + '</table>' +
      '<h2>Résultats</h2><table><tr><th>Test</th><th>Résultat</th><th>Détail</th></tr>' +
      r.tests.map(t => '<tr><td>' + esc(t.title) + (t.required ? '' : ' (opt.)') + '</td><td class="st ' + t.status + '">' + STATUS_TXT[t.status] + '</td><td>' + esc(t.detail) + '</td></tr>').join('') +
      '</table><p class="small">Généré par Testeur DualSense v' + VERSION + ' (WebHID).</p>';
    window.print();
  });

  renderTests();
})();
