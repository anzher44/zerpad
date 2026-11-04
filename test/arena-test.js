// ZP Arena: keyboard start, pause, DualSense feedback, game over and restart.
// Usage: node test/arena-test.js
const { chromium } = require('playwright');
const path = require('path');
const MOCK = require('./mock');
const url = 'file://' + path.resolve(__dirname, '..', 'play.html');

(async () => {
  const browser = await chromium.launch();
  let fail = 0;
  const check = (name, ok, extra) => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); if (!ok) fail++; };

  // keyboard and mouse
  let page = await browser.newPage({ locale: 'en-US' });
  let errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  check('start with Enter', await page.evaluate(() => __arena.state) === 'play');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
  check('move right', await page.evaluate(() => __arena.player.x) > 700);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('pause with Esc', await page.evaluate(() => __arena.state) === 'pause');
  await page.keyboard.press('Escape'); await page.waitForTimeout(2400);
  for (let i = 0; i < 8 && (await page.evaluate(() => __arena.state)) === 'play'; i++) {
    await page.evaluate(() => { const p = __arena.player, e = __arena.enemies.find(e => e.warm <= 0); p.inv = 0; if (e) { e.x = p.x; e.y = p.y; } });
    await page.waitForTimeout(250);
  }
  check('game over after 5 hits', await page.evaluate(() => __arena.state) === 'over');
  await page.waitForTimeout(1000); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check('restart', await page.evaluate(() => __arena.state === 'play' && __arena.player.hp === 5 && __arena.wave === 1));
  check('text translated', /^Survive the waves/.test(await page.textContent('#arenaHelp')));
  check('no errors (keyboard)', !errors.length, errors.join(' | '));
  await page.close();

  // simulated DualSense
  page = await browser.newPage({ locale: 'fr-FR' });
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(MOCK);
  await page.goto(url); await page.waitForTimeout(400);
  await page.click('#btnPad'); await page.waitForTimeout(2200);
  check('DualSense shown as connected', /DualSense/.test(await page.textContent('#padStatus')));
  await page.evaluate(() => { window.__pad.b0 = 8 | 0x20; }); await page.waitForTimeout(120); await page.evaluate(() => { window.__pad.b0 = 8; });
  await page.waitForTimeout(200);
  check('start with Cross', await page.evaluate(() => __arena.state) === 'play');
  await page.evaluate(() => { window.__pad.r2 = 255; window.__pad.rx = 255; }); await page.waitForTimeout(600);
  const o = await page.evaluate(() => { const x = __arena.ds.out; return { leds: x.playerLeds, trigR: x.trigR[0], trigL: x.trigL[0], g: x.g, aim: __arena.player.aim }; });
  check('R2 buzzes while firing', o.trigR === 0x26, JSON.stringify(o));
  check('L2 resistance', o.trigL === 0x21);
  check('player LEDs show 5 lives', o.leds === 31);
  check('light bar green at full health', o.g > 150);
  check('right stick aims', Math.abs(o.aim) < 0.2);
  await page.evaluate(() => { window.__pad.r2 = 0; }); await page.click('#backHome', { trial: true });
  check('no errors (DualSense)', !errors.length, errors.join(' | '));
  await browser.close();
  console.log(fail ? 'FAIL' : 'OK');
  process.exit(fail ? 1 : 0);
})();
