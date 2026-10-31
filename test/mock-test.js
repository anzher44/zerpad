// Test automatisé : simule une DualSense (USB) via un faux navigator.hid dans Chromium.
// Usage : node test/mock-test.js
const { chromium } = require('playwright');
const path = require('path');

const MOCK = `
(() => {
  const sent = []; window.__sent = sent;
  function feature(id) {
    const b = new Uint8Array(id === 0x20 ? 64 : id === 0x05 ? 41 : 20); b[0] = id;
    if (id === 0x09) [0x11,0x22,0x33,0x44,0x55,0x66].forEach((v,i)=>b[1+i]=v);
    if (id === 0x05) {
      const dv = new DataView(b.buffer);
      const vals = [2,-3,1, 8800,-8800, 8800,-8800, 8800,-8800, 540,540, 8192,-8192, 8192,-8192, 8192,-8192];
      vals.forEach((v,i)=>dv.setInt16(1+i*2, v, true));
    }
    if (id === 0x20) {
      const s = 'Jun 19 2023' + '13:40:00'; for (let i=0;i<s.length;i++) b[1+i]=s.charCodeAt(i);
      const dv = new DataView(b.buffer); dv.setUint32(24, 0x00000419, true); dv.setUint32(28, 0x01040040, true); dv.setUint16(44, 0x0630, true);
    }
    return new DataView(b.buffer);
  }
  class Dev extends EventTarget {
    constructor(){ super(); this.vendorId=0x054c; this.productId=0x0ce6; this.productName='DualSense Wireless Controller'; this.opened=false; this.collections=[]; }
    async open(){ this.opened=true; this.timer=setInterval(()=>this.emit(),4); }
    async close(){ this.opened=false; clearInterval(this.timer); }
    async receiveFeatureReport(id){ return feature(id); }
    async sendReport(id, data){ sent.push([id, Array.from(data)]); }
    emit(){
      const s = window.__pad;
      const u = new Uint8Array(63);
      u[0]=s.lx; u[1]=s.ly; u[2]=s.rx; u[3]=s.ry; u[4]=s.l2; u[5]=s.r2;
      u[7]=s.b0; u[8]=s.b1; u[9]=s.b2;
      const dv=new DataView(u.buffer);
      s.gyro.forEach((v,i)=>dv.setInt16(15+i*2, v, true));
      s.accel.forEach((v,i)=>dv.setInt16(21+i*2, v, true));
      dv.setUint32(27, (performance.now()*3000)>>>0, true);
      for (let k=0;k<2;k++){ const t=s.touch[k]; const p=32+k*4;
        u[p] = t ? k : 0x80; if (t){ u[p+1]=t[0]&0xff; u[p+2]=((t[0]>>8)&0x0f)|((t[1]&0x0f)<<4); u[p+3]=t[1]>>4; } }
      u[52]=s.status; u[53]=s.plug;
      const ev = new Event('inputreport'); ev.reportId=1; ev.data=new DataView(u.buffer); ev.device=this;
      this.dispatchEvent(ev);
    }
  }
  window.__pad = { lx:128, ly:127, rx:129, ry:128, l2:0, r2:0, b0:8, b1:0, b2:0, gyro:[2,-3,1], accel:[0,8192,0], touch:[null,null], status:0x17, plug:0 };
  const dev = new Dev(); window.__dev = dev;
  const hid = new EventTarget();
  hid.requestDevice = async () => [dev];
  hid.getDevices = async () => [];
  Object.defineProperty(navigator, 'hid', { value: hid });
})();`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(MOCK);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.click('#btnConnect');
  await page.waitForFunction(() => document.getElementById('i-mac').textContent !== '—');
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ['i-model','i-conn','i-mac','i-fw','i-upd','i-hw','i-build','i-bat','i-charge','i-rate','i-mode'].map(id => id + ' = ' + document.getElementById(id).textContent));
  console.log(info.join('\n'));
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] + '/info.png' });

  const set = (patch) => page.evaluate(p => Object.assign(window.__pad, p), patch);
  const status = id => page.evaluate(id => document.querySelector('#test-' + id + ' .badge').textContent + ' | ' + document.querySelector('#test-' + id + ' .detail').textContent, id);
  const launch = id => page.click('#test-' + id + ' button.primary');
  await page.click('.tab[data-tab=val]');

  // 1 conn, 2 battery
  await launch('conn'); await page.waitForTimeout(1500); console.log('conn:', await status('conn'));
  await set({ status: 0x17 });
  await launch('battery'); await page.waitForTimeout(800); console.log('battery:', await status('battery'));

  // 3 buttons : chaque bouton pressé/relâché
  await launch('buttons');
  const seq = [{b0:0},{b0:2},{b0:4},{b0:6},{b0:0x18},{b0:0x28},{b0:0x48},{b0:0x88},{b1:1},{b1:2},{b1:4},{b1:8},{b1:0x10},{b1:0x20},{b1:0x40},{b1:0x80},{b2:1},{b2:2},{b2:4}];
  for (const s of seq) { await set(Object.assign({b0:8,b1:0,b2:0}, s)); await page.waitForTimeout(40); await set({b0:8,b1:0,b2:0}); await page.waitForTimeout(40); }
  console.log('buttons:', await status('buttons'));

  // 4 drift
  await launch('drift'); await page.waitForTimeout(3500); console.log('drift:', await status('drift'));

  // 5 sticks : rotation
  await launch('sticks');
  for (let k = 0; k < 3; k++) for (let a = 0; a < 360; a += 4) {
    const r = a * Math.PI / 180, x = Math.round(127.5 + Math.cos(r) * 127.5), y = Math.round(127.5 + Math.sin(r) * 127.5);
    const c = v => Math.max(0, Math.min(255, v));
    await set({ lx: c(x), ly: c(y), rx: c(x), ry: c(y) }); await page.waitForTimeout(8);
  }
  await set({ lx: 128, ly: 127, rx: 129, ry: 128 });
  console.log('sticks:', await status('sticks'));

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

  // Trigger effect bytes
  const fx = await page.evaluate(() => [DSUtil.TriggerFx.feedback(1,8), DSUtil.TriggerFx.weapon(3,6,8), DSUtil.TriggerFx.vibration(1,8,25)]);
  console.log('fx:', JSON.stringify(fx));
  console.log('crc32("123456789") = 0x' + (await page.evaluate(() => DSUtil.crc32(new TextEncoder().encode('123456789')).toString(16))));

  console.log('verdict:', await page.textContent('#verdict'), '|', await page.textContent('#verdictDetail'));
  if (process.argv[2]) {
    await page.screenshot({ path: process.argv[2] + '/validation.png', fullPage: true });
    await page.click('.tab[data-tab=live]'); await set({ lx: 200, ly: 60, l2: 180, touch: [[600, 400], null], b0: 0x28 }); await page.waitForTimeout(300);
    await page.screenshot({ path: process.argv[2] + '/live.png', fullPage: true });
  }
  console.log('JS errors:', errors.length ? errors : 'aucune');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
