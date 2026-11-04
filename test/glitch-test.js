// Signal jump test: slow clean sweeps must give no jump, an injected 15 ms spike must be caught.
// Usage: node test/glitch-test.js
const { chromium } = require('playwright');
const path = require('path');
const MOCK = require('./mock');

async function run(page, spike) {
  await page.evaluate(spike => {
    const p = window.__pad; let t = 0;
    window.__sweep = setInterval(() => {
      t++;
      const tri = (k, per) => Math.round(127.5 + 127.5 * Math.sin(t / per + k));
      p.lx = tri(0, 60); p.ly = tri(1, 70); p.rx = tri(2, 65); p.ry = tri(3, 75);
      p.l2 = Math.round(127.5 - 127.5 * Math.cos(t / 55)); p.r2 = Math.round(127.5 - 127.5 * Math.cos(t / 50));
      if (spike === 'spike' && t >= 300 && t < 302) p.lx = Math.min(255, p.lx + 60);   // 2 reports = 8 ms
      // real stick release: held at the edge, let go, damped 40 Hz bounce around the center
      if (spike === 'release' && t % 400 >= 300) {
        const k = t % 400;
        if (k < 340) p.lx = 255;
        else { const e = (k - 340) * 4; p.lx = Math.round(128 + 60 * Math.exp(-e / 40) * Math.cos(2 * Math.PI * 40 * e / 1000)); }
      }
    }, 4);
  }, spike);
  await page.click('#test-glitch .tact button >> nth=0');   // Lancer / Relancer
  await page.waitForFunction(() => !document.querySelector('#test-glitch').classList.contains('running'), null, { timeout: 30000 });
  await page.evaluate(() => clearInterval(window.__sweep));
  return page.evaluate(() => [document.querySelector('#test-glitch').className, document.querySelector('#test-glitch .detail').textContent]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'fr-FR' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(MOCK);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.click('#btnConnect2');
  await page.waitForTimeout(1500);
  await page.click('.tab[data-tab=val]');
  const clean = await run(page, false);
  console.log('clean:', clean[0], '|', clean[1]);
  const rel = await run(page, 'release');
  console.log('release:', rel[0], '|', rel[1]);
  const bad = await run(page, 'spike');
  console.log('spike:', bad[0], '|', bad[1]);
  const ok = /pass/.test(clean[0]) && /pass/.test(rel[0]) && /fail/.test(bad[0]) && !errors.length;
  console.log(ok ? 'OK' : 'FAIL', errors.join(' | '));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
