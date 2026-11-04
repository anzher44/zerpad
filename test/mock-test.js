// Automated test: simulates a USB DualSense through a fake navigator.hid in Chromium.
// Usage: node test/mock-test.js [screenshot-dir]
const { chromium } = require('playwright');
const path = require('path');

const MOCK = require('./mock');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, locale: 'fr-FR' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(MOCK);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.click('#btnConnect2');
  await page.waitForFunction(() => document.getElementById('i-mac').textContent !== '-');
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ['i-model','i-conn','i-mac','i-fw','i-upd','i-hw','i-build','i-bat','i-charge','i-rate','i-mode'].map(id => id + ' = ' + document.getElementById(id).textContent));
  console.log(info.join('\n'));
  if (process.argv[2]) { await page.waitForTimeout(1500); await page.screenshot({ path: process.argv[2] + '/info.png', fullPage: true }); }

  const set = (patch) => page.evaluate(p => Object.assign(window.__pad, p), patch);
  const status = id => page.evaluate(id => document.querySelector('#test-' + id + ' .badge').textContent + ' | ' + document.querySelector('#test-' + id + ' .detail').textContent, id);
  const launch = id => page.click('#test-' + id + ' .tact button >> nth=0');
  await page.click('.tab[data-tab=val]');

  await page.waitForFunction(() => /Sony d'origine|Suspecte/.test(document.getElementById('factoryBody').textContent), null, { timeout: 15000 });
  await page.waitForFunction(() => /utilisation/.test(document.getElementById('telemetryBox').textContent), null, { timeout: 15000 });
  console.log('factory:', (await page.textContent('#factoryBody')).replace(/\s+/g, ' ').slice(0, 400));
  console.log('telemetry:', (await page.textContent('#telemetryBox')).replace(/\s+/g, ' ').slice(0, 400));
  console.log('fwextra:', await page.textContent('#i-fwextra'));

  // 1 conn, 2 battery
  await launch('conn'); await page.waitForTimeout(1500); console.log('conn:', await status('conn'));
  await launch('auth'); await page.waitForTimeout(800); console.log('auth:', await status('auth'));
  await set({ status: 0x17 });
  await launch('battery'); await page.waitForTimeout(800); console.log('battery:', await status('battery'));

  // 3 buttons: press and release each one
  await launch('buttons');
  const seq = [{b0:0},{b0:2},{b0:4},{b0:6},{b0:0x18},{b0:0x28},{b0:0x48},{b0:0x88},{b1:1},{b1:2},{b1:4},{b1:8},{b1:0x10},{b1:0x20},{b1:0x40},{b1:0x80},{b2:1},{b2:2},{b2:4}];
  for (const s of seq) { await set(Object.assign({b0:8,b1:0,b2:0}, s)); await page.waitForTimeout(40); await set({b0:8,b1:0,b2:0}); await page.waitForTimeout(40); }
  console.log('buttons:', await status('buttons'));

  // bounce check: cross released then pressed again 8 ms later must fail the buttons test
  await launch('buttons');
  await page.evaluate(() => new Promise(res => {
    const P = window.__pad, seq = [[0, 0x28], [40, 0x08], [48, 0x28], [120, 0x08]];
    seq.forEach(([t, v]) => setTimeout(() => { P.b0 = v; }, t));
    setTimeout(res, 200);
  }));
  for (const s2 of [{b0:0},{b0:2},{b0:4},{b0:6},{b0:0x18},{b0:0x48},{b0:0x88},{b1:1},{b1:2},{b1:4},{b1:8},{b1:0x10},{b1:0x20},{b1:0x40},{b1:0x80},{b2:1},{b2:2},{b2:4}]) {
    await set(Object.assign({b0:8,b1:0,b2:0}, s2)); await page.waitForTimeout(40); await set({b0:8,b1:0,b2:0}); await page.waitForTimeout(40);
  }
  console.log('buttons with bounce:', await status('buttons'));

  // 4 drift
  await launch('drift'); await page.waitForTimeout(3500); console.log('drift:', await status('drift'));

  // 5 sticks: rotation
  await launch('sticks');
  for (let k = 0; k < 3; k++) for (let a = 0; a < 360; a += 4) {
    const r = a * Math.PI / 180, x = Math.round(127.5 + Math.cos(r) * 127.5), y = Math.round(127.5 + Math.sin(r) * 127.5);
    const c = v => Math.max(0, Math.min(255, v));
    await set({ lx: c(x), ly: c(y), rx: c(x), ry: c(y) }); await page.waitForTimeout(8);
  }
  await set({ lx: 128, ly: 127, rx: 129, ry: 128 });
  console.log('sticks:', await status('sticks'));

  // snapback: 5 releases per stick
  await launch('snapback');
  for (let k = 0; k < 5; k++) {
    await set({ lx: 255, ly: 128, rx: 0, ry: 128 }); await page.waitForTimeout(60);
    await set({ lx: 120, ly: 128, rx: 134, ry: 128 }); await page.waitForTimeout(30);   // slight overshoot
    await set({ lx: 128, ly: 127, rx: 129, ry: 128 }); await page.waitForTimeout(700);
  }
  console.log('snapback:', await status('snapback'));

  // 6 triggers
  await launch('triggers');
  for (const v of [0, 100, 200, 255, 120, 0]) { await set({ l2: v, r2: v, b1: v > 50 ? 0x0c : 0 }); await page.waitForTimeout(40); }
  console.log('triggers:', await status('triggers'));

  // 7 touchpad
  await launch('touchpad');
  for (let y = 40; y < 1080; y += 90) for (let x = 40; x < 1920; x += 80) { await set({ touch: [[x, y], null] }); await page.waitForTimeout(6); }
  await set({ touch: [[300, 300], [1500, 700]] }); await page.waitForTimeout(40); await set({ touch: [null, null] });
  console.log('touchpad:', await status('touchpad'));

  // 8 imuStill
  await launch('imuStill'); await page.waitForTimeout(3400); console.log('imuStill:', await status('imuStill'));

  // 9 imuMove
  await launch('imuMove');
  for (const g of [[9000,0,0],[0,9000,0],[0,0,9000]]) { await set({ gyro: g }); await page.waitForTimeout(30); }
  for (const a of [[7000,0,0],[-7000,0,0],[0,7000,0],[0,-7000,0],[0,0,7000],[0,0,-7000]]) { await set({ accel: a }); await page.waitForTimeout(30); }
  await set({ gyro: [2,-3,1], accel: [0,8192,0] });
  console.log('imuMove:', await status('imuMove'));

  // 10 manual rumbleL
  await launch('rumbleL'); await page.waitForTimeout(1800);
  const last = await page.evaluate(() => window.__sent.slice(-3));
  console.log('sent reports (last 3):', JSON.stringify(last.map(r => [r[0], r[1].length, r[1].slice(0, 4), r[1].slice(38, 47)])));
  await page.click('#test-rumbleL button.ok');
  console.log('rumbleL:', await status('rumbleL'));

  // Adaptive trigger L2 with simulated motor feedback
  await launch('adaptL');
  for (let k = 0; k < 6; k++) { await set({ l2: 200, b1: 4, trigL: 0x20 + k }); await page.waitForTimeout(150); }
  await set({ l2: 0, b1: 0, trigL: 0 });
  await page.waitForSelector('#test-adaptL button.ok', { timeout: 15000 });
  console.log('adaptL detail:', await page.textContent('#test-adaptL .detail'));
  await page.click('#test-adaptL button.ok');

  // Trigger effect bytes
  const fx = await page.evaluate(() => [DSUtil.TriggerFx.feedback(1,8), DSUtil.TriggerFx.weapon(3,6,8), DSUtil.TriggerFx.vibration(1,8,25)]);
  console.log('fx:', JSON.stringify(fx));
  console.log('crc32("123456789") = 0x' + (await page.evaluate(() => DSUtil.crc32(new TextEncoder().encode('123456789')).toString(16))));

  // Calibration
  page.on('dialog', d => d.accept());
  await page.click('.tab[data-tab=cal]');
  await page.waitForTimeout(800);
  console.log('cal req:', (await page.textContent('#calReq')).replace(/\s+/g, ' '));
  await page.check('#calAck');
  await page.click('#calActions button:has-text("Calibrer le centre")');
  for (let i = 0; i < 4; i++) {
    await page.waitForSelector('#calActions button:has-text("Continuer")', { timeout: 8000 });
    await page.click('#calActions button:has-text("Continuer")');
  }
  await page.waitForFunction(() => /Centre calibré|Échec/.test(document.getElementById('calStep').textContent), null, { timeout: 15000 });
  console.log('cal center:', (await page.textContent('#calStep')).slice(0, 80));
  await page.click('#calActions button:has-text("amplitude")');
  for (let k = 0; k < 2; k++) for (let a = 0; a < 360; a += 5) {
    const r = a * Math.PI / 180, c = v => Math.max(0, Math.min(255, Math.round(v)));
    await set({ lx: c(127.5 + Math.cos(r) * 127), ly: c(127.5 + Math.sin(r) * 127), rx: c(127.5 + Math.cos(r) * 127), ry: c(127.5 + Math.sin(r) * 127) });
    await page.waitForTimeout(10);
  }
  await set({ lx: 128, ly: 127, rx: 129, ry: 128 });
  await page.waitForTimeout(400);
  await page.click('#calActions button:has-text("Terminer")');
  await page.waitForFunction(() => /Amplitude calibrée|Échec/.test(document.getElementById('calStep').textContent), null, { timeout: 8000 });
  console.log('cal range:', (await page.textContent('#calStep')).slice(0, 80));
  await page.click('#calSave');
  await page.waitForFunction(() => /sauvegardée|non confirmée|Échec/.test(document.getElementById('calStep').textContent), null, { timeout: 8000 });
  console.log('cal save:', (await page.textContent('#calStep')).slice(0, 60));
  console.log('cal commands:', (await page.evaluate(() => window.__calLog.filter(x => !x.startsWith('80:1,') && !x.startsWith('80:9,') && !x.startsWith('80:4,') && !x.startsWith('80:5,') && !x.startsWith('80:7,') && !x.startsWith('80:12,') && !x.startsWith('80:112,')))).join(' | '));
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] + '/cal.png', fullPage: true });

  // One-page PDF report
  if (process.argv[2]) {
    await page.click('.tab[data-tab=val]');
    await page.fill('#unitLabel', 'Manette 12, client Dupont');
    await page.click('#btnPrint');
    await page.waitForTimeout(500);
    await page.pdf({ path: process.argv[2] + '/report.pdf', format: 'A4', preferCSSPageSize: true, printBackground: true });
    console.log('pdf pages:', (require('fs').readFileSync(process.argv[2] + '/report.pdf', 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length);
    await page.click('.tab[data-tab=info]');
    await page.screenshot({ path: process.argv[2] + '/hero.png', clip: { x: 0, y: 0, width: 1300, height: 420 } });
  }

  // Before / after comparison with an exported report
  await page.click('.tab[data-tab=val]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportJson')]);
  const file = await dl.path();
  await page.setInputFiles('#compareFile', file);
  await page.waitForTimeout(300);
  console.log('compare:', (await page.textContent('#compareBody')).replace(/\s+/g, ' ').slice(0, 220));

  // Language switch: no French left in the interface (test results measured earlier stay as written)
  await page.selectOption('#selLang', 'en');
  await page.waitForTimeout(400);
  const leftovers = {};
  for (const tab of ['info', 'live', 'out', 'val', 'games', 'cal', 'raw']) {
    await page.click('.tab[data-tab=' + tab + ']');
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => {
      const p = document.querySelector('.panel.active').cloneNode(true);
      // measured results, saved reports and user input keep the language they were written in
      p.querySelectorAll('.detail, input, #log, #compareCard, #history').forEach(e => e.remove());
      const top = document.querySelector('.top').cloneNode(true);
      top.querySelectorAll('select').forEach(e => e.remove());
      return p.innerText + '\n' + top.innerText;
    });
    const hits = txt.split(/\n/).filter(l => /[éèàùâêîôûç]| (la|le|les|des|du|une|pour|avec|manette) /i.test(l));
    if (hits.length) leftovers[tab] = hits.slice(0, 8);
  }
  if (Object.keys(leftovers).length) errors.push('French text left in English: ' + JSON.stringify(leftovers));
  console.log('EN verdict:', await page.textContent('#verdict'));
  if (process.argv[2]) { await page.click('.tab[data-tab=info]'); await page.screenshot({ path: process.argv[2] + '/en.png', fullPage: true }); }
  const tabNames = {};
  for (const l of ['es', 'de', 'it', 'pt', 'fr']) {
    await page.selectOption('#selLang', l);
    await page.waitForTimeout(300);
    tabNames[l] = await page.textContent('.tab[data-tab=info]') + ' / ' + await page.textContent('#verdict');
  }
  console.log('languages:', JSON.stringify(tabNames));

  console.log('verdict:', await page.textContent('#verdict'), '|', await page.textContent('#verdictDetail'));
  if (process.argv[2]) {
    await page.click('.tab[data-tab=val]'); await page.waitForTimeout(200);
    await page.screenshot({ path: process.argv[2] + '/validation.png', fullPage: true });
    await page.click('.tab[data-tab=live]'); await set({ lx: 200, ly: 60, l2: 180, touch: [[600, 400], null], b0: 0x28 }); await page.waitForTimeout(300);
    await page.screenshot({ path: process.argv[2] + '/live.png', fullPage: true });
  }
  console.log('JS errors:', errors.length ? errors : 'aucune');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
