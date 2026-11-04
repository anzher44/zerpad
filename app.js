// ZerPad: user interface, live views and validation tests.
(function () {
  'use strict';
  const VERSION = '2.3.0';
  const { hex, hexDump, TriggerFx, fwString, TOUCH_W, TOUCH_H } = window.DSUtil;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ds = new DualSense();
  window.ds = ds; // handy for debugging from the console

  // Tabs
  function setTab(name) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

  // Connection
  if (!DualSense.supported) {
    $('unsupported').hidden = false;
    $('btnConnect').disabled = true;
    $('btnConnect2').disabled = true;
  }

  async function connect() {
    try { await ds.request(); }
    catch (e) { log(tr('Connexion annulée ou impossible : ') + e.message); }
  }
  $('btnConnect').addEventListener('click', connect);
  $('btnConnect2').addEventListener('click', connect);
  $('btnDisconnect').addEventListener('click', () => ds.close());
  $('btnPowerOff').addEventListener('click', async () => {
    try { await ds.powerOff(); log(tr('Manette éteinte')); } catch (e) { log(tr('Extinction impossible : ') + e.message); }
  });

  if (DualSense.supported) {
    // Reconnect automatically to an already authorized controller
    navigator.hid.getDevices().then(devs => {
      const d = devs.find(d => DualSense.filters.some(f => f.vendorId === d.vendorId && f.productId === d.productId));
      if (d) ds.open(d).catch(e => log(tr('Reconnexion impossible : ') + e.message));
    });
    navigator.hid.addEventListener('disconnect', e => {
      if (ds.device && e.device === ds.device) {
        log(tr('Manette débranchée'));
        ds.detach();
      }
    });
    navigator.hid.addEventListener('connect', e => {
      if (!ds.device && DualSense.filters.some(f => f.productId === e.device.productId && f.vendorId === e.device.vendorId)) {
        ds.open(e.device).catch(err => log(tr('Reconnexion impossible : ') + err.message));
      }
    });
  }

  ds.addEventListener('log', e => log(e.detail));
  ds.addEventListener('ready', () => {
    $('connStatus').textContent = tr('Connectée : ') + ds.model;
    $('connStatus').className = 'pill on';
    $('btnConnect').hidden = true;
    $('btnDisconnect').hidden = false;
    $('btnPowerOff').hidden = ds.transport !== 'bt';
    renderInfo();
    renderFeatures();
    buildButtonGrid();
    // keep the results when the same controller comes back (for example a short Bluetooth drop)
    if (!tests.length || lastDeviceKey !== ds.info.mac) buildTests(); else renderTests();
    lastDeviceKey = ds.info.mac;
    document.body.classList.add('connected');
    setTab('info');
    renderHero();
    loadExtras();
  });
  let lastDeviceKey = null;
  let extrasPromise = null;
  function loadExtras() {
    $('factoryBody').innerHTML = tr('<tr><td class="small">Lecture des infos usine…</td></tr>');
    $('telemetryBox').textContent = tr('Lecture des compteurs…');
    extrasPromise = Promise.all([ds.readFactoryInfo(), ds.readTelemetry()]).catch(e => log(tr('Infos usine : ') + e.message));
    return extrasPromise;
  }
  ds.addEventListener('factory', () => { renderFactory(); checkSeenBefore(); renderHero(); });
  ds.addEventListener('telemetry', () => { renderTelemetry(); renderFeatures(); renderHero(); });
  ds.addEventListener('transport', () => { renderInfo(); $('btnPowerOff').hidden = ds.transport !== 'bt'; });
  ds.addEventListener('info', () => { renderInfo(); renderFeatures(); });
  ds.addEventListener('closed', () => {
    $('connStatus').textContent = tr('Non connectée');
    $('connStatus').className = 'pill off';
    $('btnConnect').hidden = false;
    $('btnDisconnect').hidden = true;
    $('btnPowerOff').hidden = true;
    $('bthint').hidden = true;
    $('seenBefore').hidden = true;
    $('cloneWarn').hidden = true;
    document.body.classList.remove('connected');
    renderHero();
  });

  function log(msg) {
    const el = $('log');
    const t = new Date().toLocaleTimeString();
    el.textContent = '[' + t + '] ' + msg + '\n' + el.textContent.slice(0, 8000);
  }

  // Info
  function renderInfo() {
    const i = ds.info;
    $('i-model').textContent = i.model || '-';
    $('i-name').textContent = i.productName || '-';
    $('i-vidpid').textContent = i.vendorId != null ? '0x' + hex(i.vendorId, 4) + ' : 0x' + hex(i.productId, 4) : '-';
    $('i-conn').textContent = ds.transport === 'bt' ? 'Bluetooth' : ds.transport === 'usb' ? tr('USB (câble)') : '-';
    $('bthint').hidden = ds.transport !== 'bt';
    $('i-mac').textContent = i.mac || '-';
    $('i-fw').textContent = fwString(i.fwVersion);
    $('i-upd').textContent = i.updateVersion != null ? hex(i.updateVersion >> 8) + '.' + hex(i.updateVersion & 0xff) + '  (0x' + hex(i.updateVersion, 4) + ')' : '-';
    $('i-hw').textContent = i.hwVersion != null ? '0x' + hex(i.hwVersion, 8) : '-';
    $('i-build').textContent = i.buildDate ? i.buildDate + ' ' + (i.buildTime || '') : '-';
    $('i-fwtype').textContent = i.fwType != null ? '0x' + hex(i.fwType, 4) + ' / 0x' + hex(i.swSeries, 4) : '-';
    $('i-fwextra').textContent = i.sblVersion != null
      ? 'SBL ' + fwString(i.sblVersion).split(' ')[0] + ', DSP 0x' + hex(i.dspVersion, 8) + ', MCU-DSP ' + fwString(i.spiderVersion).split(' ')[0] + (i.deviceInfo && /[^0]/.test(i.deviceInfo) ? ', device 0x' + i.deviceInfo : '')
      : '-';
    const c = ds.calib;
    const body = $('calibBody');
    if (!c) { body.innerHTML = '<tr><td>-</td></tr>'; return; }
    const rows = [
      [tr('Validité'), c.valid ? tr('cohérente') : tr('incohérente (valeurs par défaut utilisées)')],
      [tr('Biais gyro (P/Y/R)'), c.gyroPitchBias + ' / ' + c.gyroYawBias + ' / ' + c.gyroRollBias],
      [tr('Gyro pitch +/-'), c.gyroPitchPlus + ' / ' + c.gyroPitchMinus],
      [tr('Gyro yaw +/-'), c.gyroYawPlus + ' / ' + c.gyroYawMinus],
      [tr('Gyro roll +/-'), c.gyroRollPlus + ' / ' + c.gyroRollMinus],
      [tr('Vitesse ref +/-'), c.gyroSpeedPlus + ' / ' + c.gyroSpeedMinus],
      [tr('Accél X +/-'), c.accXPlus + ' / ' + c.accXMinus],
      [tr('Accél Y +/-'), c.accYPlus + ' / ' + c.accYMinus],
      [tr('Accél Z +/-'), c.accZPlus + ' / ' + c.accZMinus],
    ];
    body.innerHTML = rows.map(r => '<tr><th>' + r[0] + '</th><td class="mono">' + r[1] + '</td></tr>').join('');
  }

  function renderFeatures() {
    const names = { 0x05: tr('Calibration IMU'), 0x09: tr('Appairage / MAC'), 0x20: tr('Firmware') };
    $('rawFeature').textContent = Object.keys(ds.features).map(id =>
      '# 0x' + hex(+id) + ' ' + (names[id] || '') + ' (' + ds.features[id].length + ' octets)\n' + hexDump(ds.features[id])
    ).join('\n\n') + (ds.telemetryRaw ? '\n\n# ' + tr('Télémétrie 0x70 (pages de 56 octets)') + '\n' + hexDump(ds.telemetryRaw) : '') || '-';
  }

  // Factory info & telemetry
  // 363600 s -> "4 j 5 h 00 min (101 h)"; same value as ds.daidr.me, which shows "4d 5h 0m 0s"
  function fmtDuration(sec) {
    if (sec == null) return '-';
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (!d && !h) return m + ' min ' + (sec % 60) + ' s';
    const hm = h + ' h ' + String(m).padStart(2, '0') + ' min';
    return d ? d + ' ' + tr('j') + ' ' + hm + ' (' + Math.floor(sec / 3600) + ' h)' : hm;
  }
  const yesNo = ok => ok ? 'OK' : tr('non');
  const num = n => n == null ? '-' : Number(n).toLocaleString(I18N.lang === 'fr' ? 'fr-FR' : 'en-US');

  function renderFactory() {
    const f = ds.factory || {}, i = ds.info;
    const rows = [
      [tr('Authenticité'), f.cloneReasons && f.cloneReasons.length
        ? tr('<b class="txt-bad">Suspecte : ') + esc(f.cloneReasons.map(trReason).join(', ')) + '</b>'
        : tr('<b class="txt-ok">Manette Sony d\'origine (aucun signe de copie)</b>')],
      [tr('Numéro de série'), f.serial],
      [tr('Couleur / édition'), f.color ? f.color + ' (code ' + f.colorCode + ')' : f.colorCode ? tr('Inconnue (code ') + f.colorCode + ')' : null],
      [tr('Carte mère'), i.boardModel && i.boardModel.replace('?', tr('Inconnu'))],
      [tr('PCBA ID'), f.pcbaId],
      [tr('ID unique MCU'), f.mcuUniqueId],
      [tr('Adresse Bluetooth'), f.btAddress],
      [tr('Tension batterie'), f.batteryVoltage ? (f.batteryVoltage / 1000).toFixed(2) + ' V' : null],
      [tr('Code-barres batterie'), f.batteryBarcode],
      [tr('Code-barres VCM gauche'), f.vcmLeft],
      [tr('Code-barres VCM droit'), f.vcmRight],
      [tr('Pièces assemblées'), f.assembleParts ? '0x' + f.assembleParts : null],
      [tr('Moteur gâchette L2'), f.triggerMotorL ? f.triggerMotorL.info + ', n° ' + f.triggerMotorL.serial : null],
      [tr('Moteur gâchette R2'), f.triggerMotorR ? f.triggerMotorR.info + ', n° ' + f.triggerMotorR.serial : null],
      [tr('Pavé tactile (ID / FW)'), f.touchpadId ? f.touchpadId + ' / ' + (f.touchpadFw || '-') : null],
      [tr('Mémoire de calibration'), f.nvsLocked === true ? tr('Verrouillée (normal)') : f.nvsLocked === false ? tr('Déverrouillée (calibration modifiée ou en cours)') : null],
    ];
    $('factoryBody').innerHTML = rows.filter(r => r[1]).map(r =>
      '<tr><th>' + r[0] + '</th>' + (r[0] === tr('Authenticité') ? '<td>' + r[1] : '<td class="mono">' + esc(r[1])) + '</td></tr>').join('') ||
      tr('<tr><td class="small">Aucune info usine disponible (firmware ancien ou manette non compatible).</td></tr>');
    const cw = $('cloneWarn');
    cw.hidden = !(f.cloneReasons && f.cloneReasons.length);
    cw.textContent = tr('Attention : cette manette présente des signes de contrefaçon (') + (f.cloneReasons || []).map(trReason).join(', ') + ').';
  }

  const TEL_BTN = { up: '↑', down: '↓', left: '←', right: '→', triangle: '△', circle: '○', cross: '✕', square: '□',
    l1: 'L1', l2: 'L2', l3: 'L3', r1: 'R1', r2: 'R2', r3: 'R3', options: 'Options', create: 'Create', ps: 'PS',
    mute: 'Micro', touch: 'Pavé (contacts)', touchpad: 'Pavé (clics)', paddleL: 'Palette G', paddleR: 'Palette D' };
  // Illustration of the detected edition (Gamepad Asset Pack, MIT); unknown codes fall back to white
  const PAD_IMAGES = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '30',
    'Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'ZA', 'ZB', 'ZC', 'ZD', 'ZE', 'ZF'];
  const padImage = code => 'assets/controllers/' + (PAD_IMAGES.includes(code) ? code : '00') + '.webp';
  function renderHero() {
    const f = ds.factory || {}, i = ds.info || {};
    const on = !!ds.device;
    $('padImg').src = padImage(on ? f.colorCode : null);
    $('padImg').classList.toggle('idle', !on);
    $('h-model').textContent = on ? (i.model || 'DualSense') : tr('Aucune manette connectée');
    $('h-color').textContent = on ? (f.color || (f.colorCode ? tr('Édition inconnue (code ') + f.colorCode + ')' : '')) : tr('Branchez une manette en USB ou appairez-la en Bluetooth, puis cliquez sur « Connecter la manette ».');
    const facts = on ? [
      [tr('N° de série'), f.serial], [tr('Carte mère'), i.boardModel && i.boardModel.replace('?', tr('Inconnu'))],
      [tr('Connexion'), ds.transport === 'bt' ? 'Bluetooth' : ds.transport === 'usb' ? 'USB' : null],
      [tr('Firmware'), i.updateVersion != null ? hex(i.updateVersion >> 8) + '.' + hex(i.updateVersion & 0xff) : null],
      [tr('Utilisation'), ds.telemetry ? fmtDuration(ds.telemetry.totalActiveTime) : null],
    ].filter(x => x[1]) : [];
    $('h-facts').innerHTML = facts.map(x => '<div><dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd></div>').join('') +
      (on ? '<div><dt>' + tr('Batterie') + '</dt><dd id="h-bat">-</dd></div>' : '');
  }

  // Counterfeit reasons come from dualsense.js in French; the year is the only variable part
  function trReason(r) {
    const m = r.match(/^firmware daté du futur \((\d+)\)$/);
    return m ? tr('firmware daté du futur ({year})', { year: m[1] }) : tr(r);
  }
  function usageLevel(sec) {
    if (sec == null) return null;
    const h = sec / 3600;
    return h < 50 ? tr('Faible (comme neuve)') : h < 300 ? tr('Modéré') : h < 1000 ? tr('Important') : tr('Très important');
  }
  function renderTelemetry() {
    const t = ds.telemetry, box = $('telemetryBox');
    if (!t) { box.textContent = tr('Compteurs non disponibles (firmware trop ancien ou commande non prise en charge).'); return; }
    if (t.partial) { box.innerHTML = tr('<table class="kv"><tbody><tr><th>Temps d\'utilisation</th><td>') + fmtDuration(t.totalActiveTime) + tr('</td></tr></tbody></table><p class="small">Firmware ancien : seul le temps d\'utilisation est lisible.</p>'); return; }
    const f = ds.factory || {};
    const errs = t.chargeVoltageErrors + t.chargeTemperatureErrors + t.chargePmicErrors;
    const rows = [
      [tr('Temps d\'utilisation total'), fmtDuration(t.totalActiveTime) + ' [' + num(t.totalActiveTime) + ' s]'],
      [tr('Niveau d\'usage (indicatif)'), usageLevel(t.totalActiveTime)],
      [tr('Allumages de la manette'), num(t.totalRecordCount)],
      [tr('Temps de charge total'), fmtDuration(t.totalChargeTime)],
      [tr('Charges (branchements)'), num(t.batteryChargeCount) + tr(', complètes : ') + num(t.fullChargeCount)],
      [tr('Vibrations actives'), fmtDuration(t.hapticActiveTime)],
      [tr('Gâchettes adaptatives actives'), tr('G ') + fmtDuration(t.triggerLeftActiveTime) + tr(', D ') + fmtDuration(t.triggerRightActiveTime)],
      [tr('Connexions USB / Bluetooth'), num(t.usbConnectCount) + ' / ' + num(t.btConnectCount) + (t.btTimeoutCount ? tr(' (pertes BT : ') + num(t.btTimeoutCount) + ')' : '')],
      // USB charger types as detected by the charging chip: SDP = computer port, CDP = charging port, DCP = wall charger
      [tr('Sources de charge USB'), tr('ordinateur ') + num(t.usbSdp) + tr(', port de charge ') + num(t.usbCdp) + tr(', chargeur mural ') + num(t.usbDcp) +
        tr(', USB-C 1,5 A ') + num(t.usbTypeC15) + ', USB-C 3 A ' + num(t.usbTypeC30) + (t.usbUnknown ? tr(', inconnu ') + num(t.usbUnknown) : '')],
      [tr('Authentifications console'), num(t.authChallengeCount) + tr(' demandes, ') + num(t.authSuccessCount) + tr(' réussies, ') + num(t.authFailCount) + tr(' échouées')],
      [tr('Casque / écouteurs branchés'), num(t.headsetDetectCount + t.headphoneDetectCount) + tr(' fois')],
      [tr('Erreurs de charge'), errs ? errs + tr(' (tension ') + t.chargeVoltageErrors + ', temp. ' + t.chargeTemperatureErrors + ', PMIC ' + t.chargePmicErrors + ')' : '0'],
      [tr('Erreurs démarrage sous-CPU'), num(t.subcpuStartupErrors)],
    ];
    if (t.sticks && t.sticks.lx != null) {
      rows.push([tr('Allers-retours stick gauche'), num(t.sticks.lx + t.sticks.ly)]);
      rows.push([tr('Allers-retours stick droit'), num(t.sticks.rx + t.sticks.ry)]);
    }
    if (t.stickModuleL) rows.push([tr('Module stick G / D'), (t.stickModuleL.serial || '-') + ' / ' + (t.stickModuleR.serial || '-')]);
    if (t.serial && f.serial && t.serial.trim() !== f.serial.trim()) rows.push([tr('Incohérence'), tr('le n° de série des compteurs (') + t.serial + tr(') ne correspond pas au n° usine, carte échangée ?')]);
    const btns = Object.entries(t.buttons || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    box.innerHTML = '<table class="kv"><tbody>' + rows.map(r => '<tr><th>' + r[0] + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</tbody></table>' +
      (btns.length ? tr('<h3>Appuis enregistrés par bouton</h3><div class="presses">') + btns.map(([k, v]) =>
        '<span><b>' + esc(tr(TEL_BTN[k] || k)) + '</b> ' + num(v) + '</span>').join('') + '</div>' : '') +
      tr('<p class="small">Compteurs écrits par la manette elle-même (usine → aujourd\'hui). Utile pour vérifier une manette d\'occasion.</p>');
  }

  function historyLoad() {
    try {
      const h = JSON.parse(localStorage.getItem('zerpad.history') || localStorage.getItem('zherpad.history') || localStorage.getItem('dsTester.history') || '[]');
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  }
  function checkSeenBefore() {
    const f = ds.factory || {};
    const prev = historyLoad().find(x => (f.serial && x.serial === f.serial) || (!f.serial && ds.info.mac && x.mac === ds.info.mac));
    const el = $('seenBefore');
    el.hidden = !prev;
    if (prev) el.textContent = tr('Cette manette a déjà été testée ici le ') + new Date(prev.date).toLocaleString() + tr(', verdict : ') + prev.verdict + (prev.unit ? ' (' + prev.unit + ')' : '') + '.';
  }

  // Buttons
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
      d.className = 'btn'; d.textContent = tr(label); d.title = k;
      g.appendChild(d); btnEls[k] = d;
    }
  }
  buildButtonGrid();

  // Stick statistics (circularity)
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
    // mean distance between the outer contour and a perfect circle, in % of the radius
    for (let i = 0; i < BINS; i++) if (s.bins[i] > 0) { n++; sum += Math.abs(s.bins[i] - 1); }
    return { coverage: n / BINS, error: n ? sum / n * 100 : null };
  }
  $('btnClearTrace').addEventListener('click', () => { stickStats.L = newStickStats(); stickStats.R = newStickStats(); });

  // Motion / touch history
  const motionHist = [];
  const touchTrails = [[], []];

  // Incoming state
  // Switch bounce ("chatter"): a release followed by a press less than 25 ms later cannot
  // come from a finger (fast tapping is above 60 ms per cycle), it is a worn contact.
  const CHATTER_MS = 25;
  const btnTrack = {};
  let chatter = {};
  function trackButtons(st) {
    for (const k in st.buttons) {
      const b = btnTrack[k] || (btnTrack[k] = { down: false, up: 0 });
      const down = !!st.buttons[k];
      if (down && !b.down && b.up && st.time - b.up < CHATTER_MS) chatter[k] = (chatter[k] || 0) + 1;
      if (!down && b.down) b.up = st.time;
      b.down = down;
    }
  }
  const btnLabel = k => tr((buttonList().find(b => b[0] === k) || [k, k])[1]);
  const chatterText = c => Object.keys(c).length ? Object.entries(c).map(([k, n]) => btnLabel(k) + ' ×' + n).join(', ') : tr('aucun');

  ds.addEventListener('state', e => {
    const st = e.detail;
    trackButtons(st);
    updateStick(stickStats.L, st.lx, st.ly);
    updateStick(stickStats.R, st.rx, st.ry);
    if (st.gyro) { motionHist.push(st.gyro.slice()); if (motionHist.length > 320) motionHist.shift(); }
    (st.touches || []).forEach((t, k) => {
      if (t.active) { touchTrails[k].push([t.x, t.y]); if (touchTrails[k].length > 200) touchTrails[k].shift(); }
      else touchTrails[k].length = 0;
    });
    for (const t of tests) if (t.status === 'running' && t.onState) t.onState(st);
  });

  // Render loop
  let lastRawDraw = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const st = ds.state;
    if (!st) return;
    for (const [k] of buttonList()) if (btnEls[k]) btnEls[k].classList.toggle('on', !!st.buttons[k]);
    drawStick($('cvL'), stickStats.L, st.lx, st.ly);
    drawStick($('cvR'), stickStats.R, st.rx, st.ry);
    const cL = circularity(stickStats.L), cR = circularity(stickStats.R);
    $('txL').textContent = st.lx + ',' + st.ly + (cL.error != null ? ', circ. ' + cL.error.toFixed(1) + '%' : '');
    $('txR').textContent = st.rx + ',' + st.ry + (cR.error != null ? ', circ. ' + cR.error.toFixed(1) + '%' : '');
    $('barL2').style.width = (st.l2 / 2.55) + '%'; $('valL2').textContent = st.l2;
    $('barR2').style.width = (st.r2 / 2.55) + '%'; $('valR2').textContent = st.r2;
    if (st.gyro) {
      ['gx', 'gy', 'gz'].forEach((id, i) => $(id).textContent = st.gyro[i].toFixed(1) + tr('  (brut ') + st.gyroRaw[i] + ')');
      ['ax', 'ay', 'az'].forEach((id, i) => $(id).textContent = st.accel[i].toFixed(3) + tr('  (brut ') + st.accelRaw[i] + ')');
      $('amag').textContent = Math.hypot(...st.accel).toFixed(3);
      drawMotion();
    }
    drawTouch(st);
    if (st.battery) {
      $('i-bat').textContent = st.battery.pct != null ? st.battery.pct + ' %' : '-';
      $('batFill').style.width = (st.battery.pct || 0) + '%';
      $('batFill').className = st.battery.pct != null && st.battery.pct <= 20 ? 'low' : '';
      $('i-charge').textContent = tr(st.battery.label);
      if ($('h-bat')) $('h-bat').textContent = (st.battery.pct != null ? st.battery.pct + ' %, ' : '') + tr(st.battery.label);
      $('i-jack').textContent = (st.plug.headphones ? tr('Casque détecté') : tr('Rien de branché')) + (st.plug.mic ? tr(', micro externe') : '') + (st.plug.micMuted ? tr(', micro coupé') : '') + '  (0x' + hex(st.plug.raw) + ')';
      $('i-usb').textContent = tr('données ') + yesNo(st.plug.usbData) + tr(', alimentation ') + yesNo(st.plug.usbPower);
      $('i-ts').textContent = st.sensorTs;
    }
    $('chatterTxt').textContent = tr('Rebonds de boutons : ') + chatterText(chatter);
    $('i-rate').textContent = ds.reportRate ? ds.reportRate + tr(' rapports/s (≈ ') + (1000 / ds.reportRate).toFixed(1) + ' ms)' : '-';
    $('i-mode').textContent = ds.simpleMode ? tr('Simplifié (Bluetooth sans capteurs)') : tr('Complet (rapport 0x') + hex(st.reportId) + ')';
    if (now - lastRawDraw > 100 && ds.lastRaw) {
      lastRawDraw = now;
      $('rawInput').textContent = tr('# rapport 0x') + hex(ds.lastRaw.id) + ' (' + ds.lastRaw.data.length + tr(' octets, sans ID)\n') + hexDump(ds.lastRaw.data);
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
    // drift tolerance zone (10 %)
    ctx.strokeStyle = css('--muted'); ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(C, C, R * 0.1, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // measured outer contour
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

  // Touchpad coverage for the test
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
      tr('Doigt ') + (k + 1) + ' : ' + (t.active ? 'x=' + t.x + ' y=' + t.y + ' (id ' + t.id + ')' : tr('aucun'))).join('  ,   ') +
      (st.buttons.touchpad ? '  ,   CLIC' : '');
  }

  // Outputs
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
      case 'bow': fx = TriggerFx.bow(s, e, f, f); break;
      case 'galloping': fx = TriggerFx.galloping(s, e, hz); break;
      case 'machine': fx = TriggerFx.machine(s, e, f, hz); break;
      default: fx = TriggerFx.off();
    }
    const side = $('fxSide').value, patch = {};
    if (side !== 'R') patch.trigL = fx;
    if (side !== 'L') patch.trigR = fx;
    ds.update(patch);
  });

  // Controller audio (USB)
  let audioOut = null, audioIn = null, micStream = null, micRAF = 0;
  const isPadAudio = d => /wireless controller|dualsense|054c:0ce6|054c:0df2/i.test(d.label);
  $('btnAudioScan').addEventListener('click', scanAudio);
  async function scanAudio() {
    try {
      // Microphone permission is required to get device names
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      audioOut = devs.find(d => d.kind === 'audiooutput' && isPadAudio(d)) || null;
      audioIn = devs.find(d => d.kind === 'audioinput' && isPadAudio(d)) || null;
      $('audioStatus').textContent = tr('Haut-parleur : ') + (audioOut ? audioOut.label : tr('non trouvé')) + tr(', Micro : ') + (audioIn ? audioIn.label : tr('non trouvé'));
      $('btnSpeaker').disabled = !audioOut;
      $('btnMic').disabled = !audioIn;
      const names = kind => devs.filter(d => d.kind === kind).map(d => d.label || tr('(sans nom)'));
      return { out: !!audioOut, in: !!audioIn, outputs: names('audiooutput'), inputs: names('audioinput') };
    } catch (e) {
      $('audioStatus').textContent = tr('Accès audio refusé ou indisponible : ') + e.message;
      return { out: false, in: false, error: e.name + ' : ' + e.message };
    }
  }
  async function beepPad() {
    if (!audioOut) return false;
    const ctx = new AudioContext();
    // Force the controller to play on its internal speaker (output path 3), as dualsensectl does
    ds.update({ audioPath: 3, speakerVol: 0x64 });
    await sleep(50);
    try {
      if (ctx.setSinkId) await ctx.setSinkId(audioOut.deviceId);
      else { $('audioStatus').textContent = tr('Ce navigateur ne permet pas de choisir la sortie audio.'); return false; }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.4;
      o.connect(g).connect(ctx.destination);
      o.start(); o.frequency.setValueAtTime(660, ctx.currentTime + 0.4); o.stop(ctx.currentTime + 1.2);
      await new Promise(r => setTimeout(r, 1300));
      return true;
    } finally { ctx.close(); ds.out.audioPath = null; }
  }
  $('btnSpeaker').addEventListener('click', beepPad);
  let micPeak = 0;
  async function toggleMic(force) {
    if (micStream && force !== true) {
      micStream.getTracks().forEach(t => t.stop()); micStream = null; cancelAnimationFrame(micRAF);
      $('btnMic').textContent = tr('Écouter le micro'); $('micLevel').style.width = '0';
      return;
    }
    if (!audioIn || micStream) return;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: audioIn.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    $('btnMic').textContent = tr('Arrêter le micro');
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
  $('btnMic').addEventListener('click', () => toggleMic().catch(e => log(tr('Micro : ') + e.message)));

  // Validation tests
  let tests = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function T(def) {
    return Object.assign({ status: 'pending', detail: '', required: true, data: {} }, def);
  }

  function manual(id, title, instructions, action, opts = {}) {
    return T(Object.assign({
      id, title, instructions, kind: 'manual',
      async start(t) {
        t.status = 'running'; t.detail = tr('En cours… puis confirmez ci-dessous.'); renderTests();
        let fail = null;
        try { fail = await action(t); } catch (e) { fail = tr('Erreur : ') + e.message; }
        if (typeof fail === 'string') { t.detail = fail; return finish(t, false); }
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
        instructions: 'Vérifie que la manette répond : fréquence et perte des rapports, firmware, adresse MAC, calibration. Exige plus de 100 rapports/s et moins de 5 % de pertes.',
        kind: 'auto',
        async start(t) {
          t.status = 'running'; renderTests();
          const c0 = ds.reportCount, q0 = { ...ds.seqStats }; await sleep(1200);
          const n = ds.reportCount - c0;
          const qn = ds.seqStats.n - q0.n, qOnes = ds.seqStats.ones - q0.ones, qLost = ds.seqStats.lost - q0.lost;
          // the counter is only trusted when it mostly advances by one per report
          const lossPct = qn > 20 && qOnes / qn > 0.5 ? qLost / (qLost + qn) * 100 : null;
          const okLoss = lossPct == null || lossPct < 5;
          const okFw = ds.info.fwVersion != null, okMac = !!ds.info.mac, okCal = !!(ds.calib && ds.calib.valid);
          const okRate = n / 1.2 > 100;
          t.data = { reportsPerSec: Math.round(n / 1.2), lossPercent: lossPct == null ? null : +lossPct.toFixed(2), firmware: okFw, mac: okMac, calibration: okCal, simpleMode: ds.simpleMode };
          t.detail = [
            Math.round(n / 1.2) + tr(' rapports/s') + (okRate ? '' : tr(' (trop peu)')),
            lossPct == null ? tr('pertes non mesurées') : tr('pertes ') + lossPct.toFixed(1) + ' %',
            'firmware ' + yesNo(okFw), 'MAC ' + yesNo(okMac), tr('calibration IMU ') + yesNo(okCal),
            ds.simpleMode ? tr('mode simplifié, capteurs indisponibles') : tr('rapport complet'),
          ].join(', ');
          finish(t, okRate && okLoss && okFw && okMac && okCal && !ds.simpleMode);
        },
      }),
      T({
        id: 'auth', title: 'Authenticité & infos usine',
        instructions: 'Lit le numéro de série, la couleur, la carte mère et vérifie les signes de contrefaçon (firmware daté du futur, absence de réponse aux commandes Sony). Plus fiable en USB.',
        kind: 'auto',
        async start(t) {
          t.status = 'running'; t.detail = tr('Lecture des infos usine…'); renderTests();
          // The essentials (serial, authenticity) arrive first; no need to wait for the rest
          for (let k = 0; k < 100 && !ds.factory && extrasPromise; k++) await sleep(100);
          if (!ds.factory) await ds.readFactoryInfo();
          const f = ds.factory || {};
          t.data = { serial: f.serial || null, color: f.color || null, board: ds.info.boardModel || null, cloneReasons: f.cloneReasons || [], finetune: f.finetuneAnswered };
          const parts = [];
          parts.push(f.serial ? 'n° ' + f.serial : (ds.transport === 'usb' ? tr('n° de série illisible') : tr('n° de série non lu (essayez en USB)')));
          if (f.color) parts.push(f.color);
          if (ds.info.boardModel) parts.push(ds.info.boardModel);
          parts.push(f.finetuneAnswered ? tr('répond aux commandes Sony') : tr('pas de réponse aux commandes Sony'));
          if (f.cloneReasons && f.cloneReasons.length) parts.push(tr('suspecte : ') + f.cloneReasons.map(trReason).join(', '));
          t.detail = parts.join(', ');
          finish(t, !(f.cloneReasons && f.cloneReasons.length));
        },
      }),
      T({
        id: 'battery', title: 'Batterie & charge',
        instructions: 'Lit l\'état de la batterie. En USB, la manette doit indiquer « En charge » ou « Chargée ». Échoue en cas d\'erreur de charge/température.',
        kind: 'auto',
        async start(t) {
          t.status = 'running'; renderTests(); await sleep(500);
          const b = ds.state && ds.state.battery;
          if (!b) { t.detail = tr('Aucune donnée batterie (mode simplifié ?)'); return finish(t, false); }
          const pl = ds.state.plug || {};
          t.data = { percent: b.pct, state: tr(b.label), raw: '0x' + hex(b.raw), transport: ds.transport, usbData: pl.usbData, usbPower: pl.usbPower };
          let ok = !b.error, note = '';
          if (ds.transport === 'usb') note += tr(', port USB : données ') + yesNo(pl.usbData) + tr(', alimentation ') + yesNo(pl.usbPower);
          if (ds.transport === 'usb' && b.code === 0x0) { ok = false; note += tr(', branchée en USB mais ne charge pas (câble, port ou circuit de charge ?)'); }
          t.detail = (b.pct != null ? b.pct + ' %, ' : '') + tr(b.label) + note;
          finish(t, ok);
        },
      }),
      T({
        id: 'buttons', title: 'Tous les boutons',
        instructions: 'Appuyez puis relâchez chaque bouton une fois, y compris L3/R3 (cliquer les sticks), PS, Create, Options, Micro et le clic du pavé tactile. Un bouton qui envoie deux appuis pour un seul (rebond) fait échouer le test.',
        kind: 'auto',
        start(t) { chatter = {}; t.status = 'running'; t.data = { pressed: {}, done: {} }; renderTests(); },
        onState(st) {
          const d = this.data;
          for (const k of btnSet) {
            if (st.buttons[k]) d.pressed[k] = true;
            else if (d.pressed[k]) d.done[k] = true;
          }
          const n = Object.keys(d.done).length;
          const missing = btnSet.filter(k => !d.done[k]).map(k => tr((buttonList().find(b => b[0] === k) || [k, k])[1]));
          const bounced = Object.keys(chatter).length > 0;
          const txt = n + '/' + btnSet.length + (missing.length ? tr(', reste : ') + missing.join(' ') : '') +
            (bounced ? tr(', rebonds : ') + chatterText(chatter) : '');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (n === btnSet.length) { this.data.chatter = { ...chatter }; finish(this, !bounced); }
        },
      }),
      T({
        id: 'drift', title: 'Sticks au repos (dérive / drift)',
        instructions: 'Lâchez complètement les deux sticks, posez la manette, puis cliquez « Lancer ». Mesure pendant 3 s le décalage moyen au repos et le bruit. Exige : décalage ≤ 6 % et bruit ≤ 1,5 %.',
        kind: 'auto',
        start(t) {
          t.status = 'running'; t.data = { s: [], t0: performance.now() }; t.detail = tr('Ne touchez pas les sticks…'); renderTests();
        },
        onState(st) {
          // the first 250 ms are ignored, the sticks may still be settling
          if (st.time - this.data.t0 > 250) this.data.s.push([st.lx, st.ly, st.rx, st.ry]);
        },
        tick(now) {
          const d = this.data;
          if (now - d.t0 < 3250) return;
          const res = {};
          let moved = false;
          [['L', 0], ['R', 2]].forEach(([n, i]) => {
            const k = d.s.length || 1;
            let sx = 0, sy = 0;
            for (const s of d.s) { sx += norm(s[i]); sy += norm(s[i + 1]); }
            const mx = sx / k, my = sy / k;
            const dist = d.s.map(s => Math.hypot(norm(s[i]) - mx, norm(s[i + 1]) - my)).sort((a, b) => a - b);
            const p95 = dist.length ? dist[Math.floor(dist.length * 0.95)] : 0;
            if (dist.length && dist[dist.length - 1] > 0.08) moved = true;
            const offset = Math.hypot(mx, my) * 100, noise = p95 * 100;
            res[n] = { offset: +offset.toFixed(2), noise: +noise.toFixed(2), deadzone: Math.ceil(offset + noise + 1) };
          });
          if (moved && (d.retries || 0) < 2) {
            this.data = { s: [], t0: now, retries: (d.retries || 0) + 1 };
            this.detail = tr('Mouvement détecté, nouvelle mesure : ne touchez pas les sticks…');
            renderTestBody(this);
            return;
          }
          this.data = { left: res.L, right: res.R, samples: d.s.length };
          // Offset tiers from real-unit data: 1 LSB = 1.25 %, 3.5 % = upper bound of mild drift (sense-calibrator),
          // new units measured up to about 5 % (gamepadla). Noise above 1.5 % points to a worn potentiometer.
          const ok = r => r.offset <= 6 && r.noise <= 1.5;
          const q = r => r.noise > 1.5 ? tr('potentiomètre usé') : r.offset <= 1.25 ? tr('parfait') : r.offset <= 3.5 ? tr('bon')
            : r.offset <= 6 ? tr('léger décalage, calibration conseillée') : tr('DÉRIVE');
          const f = (name, r) => name + ' : ' + r.offset + ' % (' + q(r) + tr('), bruit ') + r.noise + tr(' %, zone morte conseillée ') + r.deadzone + ' %';
          this.detail = (moved ? tr('Mesure instable. ') : '') + f(tr('Gauche'), res.L) + ' | ' + f(tr('Droit'), res.R);
          finish(this, !moved && ok(res.L) && ok(res.R) && d.s.length > 20);
        },
      }),
      T({
        id: 'sticks', title: 'Amplitude et circularité des sticks',
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
          const f = (n, x) => n + tr(' : butées ') + yesNo(x.ext) + tr(', contour ') + x.coverage + ' %' + (x.error != null ? ', circ. ' + x.error + ' %' : '');
          const txt = f(tr('Gauche'), r.L) + ' | ' + f(tr('Droit'), r.R);
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (allOk) finish(this, true);
        },
      }),
      T({
        id: 'snapback', title: 'Retour au centre des sticks',
        instructions: 'Poussez un stick à fond puis LÂCHEZ-LE d\'un coup (sans l\'accompagner). Répétez 5 fois par stick, dans différentes directions. Exige : retour au centre ≤ 8 % et rebond médian < 18 %.',
        kind: 'auto',
        start(t) {
          t.status = 'running';
          t.data = { L: { phase: 'idle', rel: [] }, R: { phase: 'idle', rel: [] } };
          renderTests();
        },
        onState(st) {
          const d = this.data;
          for (const [n, xr, yr] of [['L', st.lx, st.ly], ['R', st.rx, st.ry]]) {
            const s = d[n], x = norm(xr), y = norm(yr), r = Math.hypot(x, y);
            if (r > 0.7 && s.phase !== 'out') { s.phase = 'out'; }
            if (s.phase === 'out') {
              if (r > 0.7) { s.dir = [x / r, y / r]; }
              else if (r < 0.25) { s.phase = 'ret'; s.t0 = st.time; s.over = 0; s.rest = []; s.trace = []; }
            } else if (s.phase === 'ret') {
              const el = st.time - s.t0;
              if (x * s.dir[0] + y * s.dir[1] < 0) s.over = Math.max(s.over, r);
              s.trace.push([el, x, y]);
              if (el >= 300) s.rest.push(r);
              if (el >= 600) {
                const rest = s.rest.reduce((a, b) => a + b, 0) / (s.rest.length || 1);
                // settled = from then on the stick stays within 2 % of its final position
                const tail = s.trace.filter(p => p[0] >= 300);
                const fx = tail.reduce((a, p) => a + p[1], 0) / (tail.length || 1), fy = tail.reduce((a, p) => a + p[2], 0) / (tail.length || 1);
                let settle = 0;
                for (const p of s.trace) if (Math.hypot(p[1] - fx, p[2] - fy) > 0.02) settle = p[0];
                s.rel.push({ over: s.over, rest, settle });
                s.phase = 'idle';
              }
            }
          }
          const sum = n => {
            const rel = d[n].rel;
            if (!rel.length) return null;
            const ov = rel.map(v => v.over).sort((a, b) => a - b);
            const st2 = rel.map(v => v.settle).sort((a, b) => a - b);
            return { count: rel.length, overMedian: +(ov[Math.floor(ov.length / 2)] * 100).toFixed(1), restMax: +(Math.max(...rel.map(v => v.rest)) * 100).toFixed(1),
              settleMedian: Math.round(st2[Math.floor(st2.length / 2)]) };
          };
          const a = sum('L'), b = sum('R');
          const ok = v => v && v.count >= 5 && v.restMax <= 8 && v.overMedian < 18;
          const txt = [tr('Gauche'), tr('Droit')].map((nm, i) => {
            const v = i ? b : a;
            return nm + ' : ' + (v ? v.count + tr('/5 lâchers, retour ') + v.restMax + tr(' %, rebond ') + v.overMedian + tr(' %, stable en ') + v.settleMedian + ' ms' + (v.settleMedian > 300 ? tr(' (lent)') : '') : tr('0/5 lâchers'));
          }).join(' | ');
          this.data.result = { left: a, right: b };
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (a && b && a.count >= 5 && b.count >= 5) {
            this.data = { left: a, right: b };
            finish(this, ok(a) && ok(b));
          }
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
          const txt = 'L2 max ' + d.L.max + (ok('L') ? ' OK' : '') + ', R2 max ' + d.R.max + (ok('R') ? ' OK' : '');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (ok('L') && ok('R')) finish(this, true);
        },
      }),
      T({
        id: 'touchpad', title: 'Pavé tactile (surface et 2 doigts)',
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
          const txt = tr('Surface ') + this.data.coverage + tr(' %, 2 doigts ') + yesNo(this.data.two);
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (cov >= 0.95 && this.data.two) { touchShowGrid = false; finish(this, true); }
        },
      }),
      T({
        id: 'imuStill', title: 'Capteurs au repos (gyroscope / accéléromètre)',
        instructions: 'Posez la manette à plat sur une table, ne la touchez plus, cliquez « Lancer ». Exige : gyro moyen < 3 °/s, bruit < 1 °/s, gravité mesurée entre 0,92 et 1,08 g. Si la manette bouge, la mesure recommence.',
        kind: 'auto',
        start(t) {
          if (ds.simpleMode || !ds.state || !ds.state.gyro) { t.detail = tr('Capteurs indisponibles'); return finish(t, false); }
          t.status = 'running'; t.data = { g: [], a: [], t0: performance.now() }; t.detail = tr('Mesure 3 s…'); renderTests();
        },
        onState(st) { if (st.gyro) { this.data.g.push(st.gyro); this.data.a.push(Math.hypot(...st.accel)); } },
        tick(now) {
          const d = this.data;
          if (now - d.t0 < 3000) return;
          const n = d.g.length || 1;
          const mean = [0, 1, 2].map(i => d.g.reduce((s, g) => s + g[i], 0) / n);
          const sd = [0, 1, 2].map(i => Math.sqrt(d.g.reduce((s, g) => s + (g[i] - mean[i]) ** 2, 0) / n));
          const am = d.a.reduce((s, v) => s + v, 0) / (d.a.length || 1);
          const asd = Math.sqrt(d.a.reduce((s, v) => s + (v - am) ** 2, 0) / (d.a.length || 1));
          // accelerometer noise above 0.02 g means the controller was moved or touched
          if (asd > 0.02 && (d.retries || 0) < 2) {
            this.data = { g: [], a: [], t0: now, retries: (d.retries || 0) + 1 };
            this.detail = tr('Manette bougée, nouvelle mesure…'); renderTestBody(this);
            return;
          }
          const maxMean = Math.max(...mean.map(Math.abs)), maxSd = Math.max(...sd);
          this.data = { gyroMean: mean.map(v => +v.toFixed(2)), gyroNoise: sd.map(v => +v.toFixed(2)), accelMagnitude: +am.toFixed(3), samples: d.g.length };
          const ok = asd <= 0.02 && maxMean < 3 && maxSd < 1 && am > 0.92 && am < 1.08 && d.g.length > 20;
          this.detail = (asd > 0.02 ? tr('Manette bougée pendant la mesure. ') : '') + tr('Gyro moyen max ') + maxMean.toFixed(2) + tr(' °/s, bruit ') + maxSd.toFixed(2) + ' °/s, |a| = ' + am.toFixed(3) + ' g';
          finish(this, ok);
        },
      }),
      T({
        id: 'imuMove', title: 'Capteurs en mouvement',
        instructions: 'Tournez la manette dans tous les sens (comme un volant, en avant/arrière, à plat) et inclinez-la sur chaque côté. Exige : chaque axe gyro > 150 °/s et chaque axe accéléro atteint ±0,7 g.',
        kind: 'auto',
        start(t) {
          if (ds.simpleMode || !ds.state || !ds.state.gyro) { t.detail = tr('Capteurs indisponibles'); return finish(t, false); }
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
          const txt = tr('Gyro ') + ax.map((a, i) => a + (gOk[i] ? ' OK' : ' ' + Math.round(d.g[i]))).join(' ') +
            tr(', accél ') + ax.map((a, i) => a + (aOk[i] ? ' OK' : ' ' + tr('non'))).join(' ');
          if (txt !== this.detail) { this.detail = txt; renderTestBody(this); }
          if (gOk.every(Boolean) && aOk.every(Boolean)) finish(this, true);
        },
      }),
      manual('rumbleL', 'Vibration du moteur gauche (fort)', 'Tenez la manette, cliquez « Lancer » : seul le côté gauche doit vibrer fortement pendant 1,5 s.',
        async () => { ds.update({ motorL: 255, motorR: 0 }); await sleep(1500); ds.update({ motorL: 0 }); }),
      manual('rumbleR', 'Vibration du moteur droit (léger)', 'Cliquez « Lancer » : le côté droit doit vibrer (vibration plus fine) pendant 1,5 s.',
        async () => { ds.update({ motorL: 0, motorR: 255 }); await sleep(1500); ds.update({ motorR: 0 }); }),
      manual('adaptL', 'Gâchette adaptative L2', 'Cliquez « Lancer », puis appuyez sur L2 : forte résistance, puis point dur « arme », puis vibration (≈ 3 s chacun). La gâchette doit revenir libre ensuite.',
        t => trigSequence(t, 'trigL')),
      manual('adaptR', 'Gâchette adaptative R2', 'Cliquez « Lancer », puis appuyez sur R2 : forte résistance, puis point dur « arme », puis vibration (≈ 3 s chacun).',
        t => trigSequence(t, 'trigR')),
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
          if (!r.out) return tr('Haut-parleur de la manette introuvable. ') + audioDiag(r, r.outputs, tr('Sorties'));
          if (!await beepPad()) return tr('Impossible de choisir la sortie audio dans ce navigateur (utilisez Chrome/Edge récent).');
          await sleep(200); await beepPad();
        }, { required: false }),
      T({
        id: 'mic', title: 'Microphone interne (USB)', required: false, kind: 'auto',
        instructions: 'USB uniquement. Cliquez « Lancer », puis parlez ou soufflez près du micro (petit trou à côté du port de charge). Le niveau doit monter.',
        async start(t) {
          t.status = 'running'; t.detail = tr('Recherche du micro…'); renderTests();
          const r = await scanAudio();
          if (!r.in) { t.detail = tr('Micro de la manette introuvable. ') + audioDiag(r, r.inputs, tr('Micros')); return finish(t, false); }
          try { await toggleMic(true); } catch (e) { t.detail = tr('Erreur micro : ') + e.message; return finish(t, false); }
          t.data = { t0: performance.now() }; t.detail = tr('Parlez maintenant…'); micPeak = 0; renderTestBody(t);
        },
        tick(now) {
          if (!this.data.t0) return;
          if (micPeak > 0.25) { this.data = { peak: +micPeak.toFixed(2) }; toggleMic(); this.detail = tr('Son capté (crête ') + Math.round(micPeak * 100) + ' %)'; finish(this, true); }
          else if (now - this.data.t0 > 10000) { this.data = { peak: +micPeak.toFixed(2) }; toggleMic(); this.detail = tr('Aucun son suffisant capté en 10 s'); finish(this, false); }
        },
      }),
      T({
        id: 'jack', title: 'Prise jack 3,5 mm', required: false, kind: 'auto',
        instructions: 'Branchez un casque ou des écouteurs dans la prise jack de la manette. La détection doit passer à « Casque détecté ».',
        start(t) { t.status = 'running'; t.detail = tr('Branchez un casque…'); renderTests(); },
        onState(st) { if (st.plug && st.plug.headphones) { this.data = { raw: '0x' + hex(st.plug.raw) }; this.detail = tr('Casque détecté'); finish(this, true); } },
      }),
    ];
    renderTests();
  }

  // Explains why the controller audio device was not found
  function audioDiag(r, list, what) {
    if (r.error) return tr('Accès audio refusé (') + r.error + tr(') : autorisez le micro pour ce site (icône à gauche de l\'adresse).');
    if (ds.transport === 'bt') return tr('Connexion Bluetooth : l\'audio de la manette n\'existe qu\'en USB.');
    return what + tr(' vus par le navigateur : ') + (list && list.length ? list.join(' ; ') : tr('aucun')) +
      tr('. Vérifiez dans les paramètres son de l\'ordinateur que le périphérique « Wireless Controller » est activé.');
  }

  // Runs the three trigger effects and records the motor feedback byte
  // (report bytes 41/42, see Ohjurot/DualSense-Windows) while the trigger is pressed.
  async function trigSequence(t, key) {
    const left = key === 'trigL';
    const seen = new Set();
    let pressed = 0;
    const on = e => {
      const st = e.detail;
      if ((left ? st.l2 : st.r2) > 30) { pressed++; seen.add(left ? st.trigStatusL : st.trigStatusR); }
    };
    ds.addEventListener('state', on);
    try {
      ds.update({ [key]: TriggerFx.feedback(1, 8) }); await sleep(3000);
      ds.update({ [key]: TriggerFx.weapon(3, 6, 8) }); await sleep(3000);
      ds.update({ [key]: TriggerFx.vibration(1, 8, 25) }); await sleep(3000);
    } finally {
      ds.update({ [key]: TriggerFx.off() });
      ds.removeEventListener('state', on);
    }
    t.data = { pressedSamples: pressed, feedbackStates: [...seen].map(v => '0x' + hex(v)) };
    if (!pressed) t.detail = tr('Gâchette non pressée pendant le test. Confirmez quand même ou relancez.');
    else if (seen.size > 1) t.detail = tr('Retour moteur détecté (') + seen.size + tr(' états différents). Confirmez ce que vous avez senti.');
    else t.detail = tr('Aucun retour moteur lu (valeur fixe 0x') + hex([...seen][0]) + tr('). Confirmez ce que vous avez senti.');
  }

  function finish(t, ok) {
    t.status = ok ? 'pass' : 'fail';
    t.awaitingConfirm = false;
    t.finishedAt = new Date().toISOString();
    renderTests();
    if ($('tab-val').classList.contains('active')) setTimeout(goToCurrent, 400);
  }
  function stopAllRunning() {
    touchShowGrid = false;
    for (const t of tests) if (t.status === 'running') t.status = 'pending';
  }

  const STATUS_TXT = { pending: 'À faire', running: 'En cours', pass: 'OK', fail: 'ÉCHEC', skip: 'Passé' };
  function renderTests() {
    const box = $('testList');
    if (!tests.length) { box.innerHTML = tr('<div class="card small">Connectez une manette pour afficher les tests.</div>'); renderVerdict(); return; }
    box.innerHTML = '';
    tests.forEach((t, idx) => {
      const el = document.createElement('div');
      el.className = 'test ' + t.status + (t === currentTest() ? ' current' : '');
      el.id = 'test-' + t.id;
      el.innerHTML =
        '<div class="thead"><span class="num">' + (idx + 1) + '</span><h3>' + tr(t.title) + (t.required ? '' : ' <small>' + tr('(optionnel)') + '</small>') + '</h3>' +
        '<span class="badge ' + t.status + '">' + tr(STATUS_TXT[t.status]) + '</span></div>' +
        '<p class="small">' + tr(t.instructions) + '</p>' +
        '<p class="detail mono small"></p><div class="tact"></div>';
      el.querySelector('.detail').textContent = t.detail;
      const act = el.querySelector('.tact');
      const mk = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.addEventListener('click', fn); act.appendChild(b); };
      if (t.status === 'running' && t.awaitingConfirm) {
        mk(tr('Fonctionne'), 'ok', () => { t.detail = tr('Confirmé par l\'opérateur'); finish(t, true); });
        mk(tr('Ne fonctionne pas'), 'bad', () => { t.detail = tr('Signalé défectueux par l\'opérateur'); finish(t, false); });
        mk(tr('Relancer'), 'ghost', () => t.start(t));
      } else if (t.status === 'running') {
        if (t.kind === 'auto' && t.required) mk(tr('Abandonner (échec)'), 'bad', () => { t.detail += tr(' (abandonné)'); finish(t, false); });
        mk(tr('Passer'), 'ghost', () => { t.status = 'skip'; touchShowGrid = false; renderTests(); });
      } else {
        mk(t.status === 'pending' ? tr('Lancer') : tr('Relancer'), t.status === 'pending' ? 'primary' : 'ghost small', () => {
          if (!ds.device) { alert(tr('Connectez d\'abord la manette.')); return; }
          t.detail = ''; t.start(t);
        });
        if (t.status === 'pending') mk(tr('Passer'), 'ghost', () => { t.status = 'skip'; renderTests(); });
      }
      box.appendChild(el);
    });
    renderVerdict();
  }
  // The next test to do is highlighted; finishing a test scrolls to the following one
  const currentTest = () => tests.find(t => t.status === 'running') || tests.find(t => t.status === 'pending');
  function goToCurrent() {
    const t = currentTest();
    if (!t) return;
    const el = $('test-' + t.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('btnStartCheck').addEventListener('click', () => { setTab('val'); setTimeout(goToCurrent, 50); });
  $('btnNextTest').addEventListener('click', goToCurrent);

  function renderTestBody(t) {
    const el = $('test-' + t.id);
    if (el) el.querySelector('.detail').textContent = t.detail;
  }

  function computeVerdict() {
    if (!tests.length) return { key: 'none', label: tr('Aucun test lancé'), detail: '' };
    const req = tests.filter(t => t.required);
    const failed = tests.filter(t => t.status === 'fail' && t.required);
    const optFailed = tests.filter(t => t.status === 'fail' && !t.required);
    const done = req.filter(t => t.status === 'pass').length;
    const notDone = req.filter(t => t.status !== 'pass' && t.status !== 'fail');
    if (failed.length) return { key: 'bad', label: tr('NON VALIDÉE'), detail: tr('Échec : ') + failed.map(t => tr(t.title)).join(', ') };
    if (notDone.length) {
      if (!tests.some(t => t.status !== 'pending')) return { key: 'none', label: tr('Aucun test lancé'), detail: req.length + tr(' tests obligatoires à réaliser.') };
      return { key: 'partial', label: tr('INCOMPLÈTE'), detail: done + '/' + req.length + tr(' tests obligatoires réussis. Restants : ') + notDone.map(t => tr(t.title)).join(', ') };
    }
    return { key: 'ok', label: tr('VALIDÉE'), detail: tr('Tous les tests obligatoires sont réussis (') + req.length + '/' + req.length + ').' + (optFailed.length ? tr(' Optionnels en échec : ') + optFailed.map(t => tr(t.title)).join(', ') : '') };
  }
  function renderVerdict() {
    const v = computeVerdict();
    $('btnNextTest').hidden = !currentTest();
    $('verdict').className = 'verdict ' + v.key;
    $('verdict').textContent = v.label;
    $('verdictDetail').textContent = v.detail;
  }

  $('btnResetTests').addEventListener('click', () => { if (ds.device) buildTests(); });

  // Report
  function buildReport() {
    const v = computeVerdict();
    const i = ds.info;
    return {
      tool: 'ZerPad', toolVersion: VERSION,
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
        battery: ds.state && ds.state.battery ? { percent: ds.state.battery.pct, state: tr(ds.state.battery.label) } : null,
        reportRate: ds.reportRate,
        imuCalibrationValid: ds.calib ? ds.calib.valid : null,
        boardModel: i.boardModel || null,
      },
      factory: ds.factory || null,
      usage: ds.telemetry || null,
      tests: tests.map(t => ({ id: t.id, title: tr(t.title), required: t.required, status: t.status, detail: t.detail, data: t.data, at: t.finishedAt || null })),
    };
  }
  function saveHistory(r) {
    try {
      const h = historyLoad();
      h.unshift({ date: r.date, unit: r.unit, mac: r.device.mac, serial: r.factory && r.factory.serial || null, verdict: r.verdict, model: r.device.model });
      localStorage.setItem('zerpad.history', JSON.stringify(h.slice(0, 100)));
    } catch (e) { /* storage unavailable */ }
    renderHistory();
  }
  function renderHistory() {
    const h = historyLoad();
    $('history').innerHTML = h.length ? '<table class="kv"><tbody>' + h.map(x =>
      '<tr><td>' + new Date(x.date).toLocaleString() + '</td><td>' + esc(x.model || '') + '</td><td class="mono">' + esc(x.serial || x.mac || '') + '</td><td>' + esc(x.unit || '') + '</td><td><b>' + esc(x.verdict) + '</b></td></tr>'
    ).join('') + '</tbody></table>' : tr('Aucun rapport enregistré.');
  }
  renderHistory();
  renderHero();

  // Before / after comparison with a previously exported JSON report
  function metrics(r) {
    const t = id => (r.tests || []).find(x => x.id === id) || {};
    const d = id => t(id).data || {};
    const pick = (o, k) => (o && o[k] != null ? o[k] : null);
    return [
      [tr('Verdict'), r.verdict, null],
      [tr('Dérive stick gauche (%)'), pick(d('drift').left, 'offset'), 'low'],
      [tr('Dérive stick droit (%)'), pick(d('drift').right, 'offset'), 'low'],
      [tr('Bruit stick gauche (%)'), pick(d('drift').left, 'noise'), 'low'],
      [tr('Bruit stick droit (%)'), pick(d('drift').right, 'noise'), 'low'],
      [tr('Circularité gauche (%)'), pick(d('sticks').left, 'error'), 'low'],
      [tr('Circularité droite (%)'), pick(d('sticks').right, 'error'), 'low'],
      [tr('Retour au centre gauche (%)'), pick(d('snapback').left, 'restMax'), 'low'],
      [tr('Retour au centre droit (%)'), pick(d('snapback').right, 'restMax'), 'low'],
      [tr('Gyro au repos (°/s)'), d('imuStill').gyroMean ? Math.max(...d('imuStill').gyroMean.map(Math.abs)) : null, 'low'],
      [tr('Gravité mesurée (g)'), pick(d('imuStill'), 'accelMagnitude'), null],
      [tr('Batterie (%)'), r.device && r.device.battery ? r.device.battery.percent : null, null],
      [tr('Temps d\'utilisation (h)'), r.usage && r.usage.totalActiveTime != null ? Math.round(r.usage.totalActiveTime / 360) / 10 : null, null],
      [tr('Tests réussis'), (r.tests || []).filter(x => x.status === 'pass').length + '/' + (r.tests || []).length, null],
    ];
  }
  function renderCompare(old) {
    const cur = buildReport();
    const a = metrics(old), b = metrics(cur);
    const same = old.factory && cur.factory && old.factory.serial && old.factory.serial === cur.factory.serial;
    $('compareInfo').textContent = tr('Avant : ') + new Date(old.date).toLocaleString() + (old.unit ? ' (' + old.unit + ')' : '') +
      tr(', après : maintenant') + (old.factory && cur.factory && old.factory.serial && !same ? tr('. Attention : numéros de série différents.') : '');
    $('compareBody').innerHTML = '<tr><th></th><td><b>' + tr('Avant') + '</b></td><td><b>' + tr('Après') + '</b></td><td></td></tr>' + a.map((row, i) => {
      const v0 = row[1], v1 = b[i][1];
      let trend = '';
      if (row[2] === 'low' && typeof v0 === 'number' && typeof v1 === 'number' && Math.abs(v1 - v0) >= 0.5) {
        trend = v1 < v0 ? '<span class="txt-ok">' + tr('mieux') + '</span>' : '<span class="txt-bad">' + tr('moins bien') + '</span>';
      }
      const f = v => v == null ? '-' : esc(typeof v === 'number' ? +v.toFixed(2) : v);
      return '<tr><th>' + row[0] + '</th><td>' + f(v0) + '</td><td>' + f(v1) + '</td><td>' + trend + '</td></tr>';
    }).join('');
    $('compareCard').hidden = false;
    $('compareCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  let compareWith = null;
  $('btnCompare').addEventListener('click', () => $('compareFile').click());
  $('compareFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = JSON.parse(await file.text());
      if (!r || !Array.isArray(r.tests)) throw new Error(tr('ce fichier n\'est pas un rapport ZerPad'));
      compareWith = r;
      renderCompare(r);
    } catch (err) { alert(tr('Rapport illisible : ') + err.message); }
  });

  $('btnExportJson').addEventListener('click', () => {
    const r = buildReport(); saveHistory(r);
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zerpad-' + ((r.factory && r.factory.serial) || r.device.mac || 'manette').replace(/[^A-Za-z0-9]/g, '') + '-' + r.date.slice(0, 19).replace(/[:T]/g, '-') + '.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // One-page A4 report
  const REPORT_SCOPE = 'Ce rapport donne une image de l\'état de la manette au moment du contrôle. Il repose sur des mesures automatiques ' +
    '(sticks, gâchettes, boutons, pavé tactile, capteurs de mouvement, batterie, compteurs enregistrés par la manette) et sur la ' +
    'confirmation de l\'opérateur pour les vibrations, les gâchettes adaptatives et l\'éclairage. Il fournit une information ' +
    'minimale sur le bon fonctionnement constaté ce jour-là et ne remplace pas une expertise matérielle complète : il ne permet pas ' +
    'd\'évaluer l\'usure future, l\'état interne des composants ni l\'autonomie réelle de la batterie. Les seuils utilisés et leurs ' +
    'sources sont publiés sur github.com/anzher44/zerpad.';
  $('btnPrint').addEventListener('click', () => {
    const r = buildReport(); saveHistory(r);
    const d = r.device, f = r.factory || {}, u = r.usage, v = computeVerdict();
    const rid = 'ZP-' + r.date.slice(0, 10).replace(/-/g, '') + '-' + (f.serial || d.mac || '000000').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
    const row = (k, val) => val == null || val === '' ? '' : '<tr><th>' + k + '</th><td>' + esc(val) + '</td></tr>';
    const ident = [
      row(tr('Modèle'), d.model), row(tr('Couleur'), f.color), row(tr('N° de série'), f.serial), row(tr('Carte mère'), d.boardModel),
      row(tr('Adresse MAC'), d.mac), row(tr('Firmware'), d.firmware && d.firmware + (d.updateVersion ? ' (MAJ ' + d.updateVersion + ')' : '')),
      row(tr('Connexion'), d.transport === 'bt' ? 'Bluetooth' : 'USB'),
      row(tr('Batterie'), d.battery && ((d.battery.percent != null ? d.battery.percent + ' %, ' : '') + d.battery.state)),
      row(tr('Authenticité'), f.cloneReasons && (f.cloneReasons.length ? tr('SUSPECTE : ') + f.cloneReasons.map(trReason).join(', ') : tr('Sony d\'origine'))),
    ].join('');
    const usage = u ? [
      row(tr('Temps d\'utilisation'), fmtDuration(u.totalActiveTime)),
      u.partial ? '' : row(tr('Temps de charge'), fmtDuration(u.totalChargeTime)),
      u.partial ? '' : row(tr('Charges'), num(u.batteryChargeCount) + tr(', complètes : ') + num(u.fullChargeCount)),
      u.partial ? '' : row(tr('Allumages de la manette'), num(u.totalRecordCount)),
      u.partial ? '' : row(tr('Connexions USB / BT'), num(u.usbConnectCount) + ' / ' + num(u.btConnectCount)),
      u.partial ? '' : row(tr('Erreurs de charge'), String(u.chargeVoltageErrors + u.chargeTemperatureErrors + u.chargePmicErrors)),
    ].join('') : '<tr><td>' + tr('Non disponible') + '</td></tr>';
    const tests = r.tests.map((t, k) => '<tr class="' + t.status + '"><td class="n">' + (k + 1) + '</td><td>' + esc(t.title) + (t.required ? '' : ' <i>(opt.)</i>') +
      '</td><td class="st">' + tr(STATUS_TXT[t.status]) + '</td><td class="dt">' + esc(t.detail || '') + '</td></tr>').join('');
    const passed = r.tests.filter(t => t.status === 'pass').length;
    $('printReport').innerHTML =
      '<header class="rp-head"><div class="rp-brand"><img src="icon.svg" alt=""><div><b>ZerPad</b><span>' + tr('Rapport de contrôle de manette') + '</span></div></div>' +
      '<div class="rp-meta">' + tr('Rapport n°') + ' <b>' + rid + '</b><br>' + new Date(r.date).toLocaleString() + (r.unit ? '<br>' + esc(r.unit) : '') + '</div></header>' +
      '<section class="rp-top"><img class="rp-pad" id="rpPad" src="' + padImage(f.colorCode) + '" alt="">' +
      '<div class="rp-verdict ' + v.key + '"><span>' + tr('Résultat') + '</span><strong>' + esc(v.label) + '</strong><p>' + esc(v.detail) + '</p>' +
      '<p class="rp-count">' + passed + ' / ' + r.tests.length + ' ' + tr('tests réussis') + '</p></div></section>' +
      '<section class="rp-cols"><div><h2>' + tr('Identité') + '</h2><table>' + ident + '</table></div>' +
      '<div><h2>' + tr('Usage enregistré par la manette') + '</h2><table>' + usage + '</table></div></section>' +
      '<h2>' + tr('Résultats des tests') + '</h2><table class="rp-tests"><thead><tr><th class="n">#</th><th>' + tr('Test') + '</th><th>' + tr('Résultat') + '</th><th>' + tr('Mesure') + '</th></tr></thead><tbody>' + tests + '</tbody></table>' +
      (r.notes ? '<p class="rp-notes"><b>' + tr('Notes') + ' :</b> ' + esc(r.notes) + '</p>' : '') +
      '<section class="rp-scope"><h2>' + tr('Portée du contrôle') + '</h2><p>' + tr(REPORT_SCOPE) + '</p></section>' +
      '<p class="rp-foot">' + tr('Mesures automatiques ZerPad v') + VERSION + '. ' + tr('Seuils et sources : github.com/anzher44/zerpad') + '</p>';
    const img = $('rpPad');
    const go = () => window.print();
    if (img.complete) go(); else { img.onload = go; img.onerror = go; }
  });

  renderTests();

  document.addEventListener('langchange', () => {
    $('connStatus').textContent = ds.device ? tr('Connectée : ') + ds.model : tr('Non connectée');
    renderInfo();
    renderFeatures();
    renderHero();
    if (ds.factory) { renderFactory(); checkSeenBefore(); }
    if (ds.telemetry || ds.telemetryRaw) renderTelemetry();
    buildButtonGrid();
    renderTests();
    renderHistory();
    if (compareWith) renderCompare(compareWith);
  });

  // Offline support / install as an app
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* optional */ });
  }
})();
