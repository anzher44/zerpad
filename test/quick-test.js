// Quick test (Gamepad API) for browsers without WebHID, with a simulated gamepad.
// Usage: node test/quick-test.js
const { chromium } = require('playwright');
const path = require('path');
let fail = 0;
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [loc, w] of [['fr-FR', 1280], ['en-US', 390]]) {
  const p = await b.newPage({ locale: loc, viewport: { width: w, height: 900 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    delete Navigator.prototype.hid;
    const btn = v => ({ pressed: v > 0.5, value: v });
    const g = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: true, mapping: 'standard',
      axes: [0.02, -0.01, 0.6, 0.3], buttons: Array.from({ length: 17 }, (_, i) => btn(i === 0 || i === 7 ? 1 : 0)),
      vibrationActuator: { playEffect: async () => 'complete' } };
    g.buttons[6] = { pressed: false, value: 0.4 };
    navigator.getGamepads = () => [g];
  });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(800);
  await p.click('#qDrift'); await p.waitForTimeout(3300); await p.click('#qRumble'); await p.waitForTimeout(200);
  const r = await p.evaluate(() => [quick.hidden, qCount.textContent, qDriftRes.textContent, qRumbleRes.textContent, document.documentElement.scrollWidth]);
  console.log(loc, JSON.stringify(r));
  if (r[0] || !/^2 \//.test(r[1]) || !/2[.,]2 %/.test(r[2]) || !r[3] || r[4] > w) fail++;
  }
  console.log(fail || errs.length ? 'FAIL ' + errs.join(' | ') : 'OK'); await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
