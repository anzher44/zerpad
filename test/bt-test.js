// Bluetooth and DualSense Edge checks with a simulated controller.
// Usage: node test/bt-test.js
const { chromium } = require('playwright');
const path = require('path');

function mock(pid) {
  return `
(() => {
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  window.__out = []; window.__feat = []; window.__errors = [];
  class Dev extends EventTarget {
    constructor() { super(); this.vendorId = 0x054c; this.productId = ${pid}; this.productName = 'Wireless Controller'; this.opened = false; this.full = false;
      this.collections = [{ usagePage: 1, usage: 5, inputReports: [{ reportId: 0x31 }], outputReports: [{ reportId: 0x31 }], featureReports: [{ reportId: 0x80, items: [{ reportCount: 63 }] }] }]; }
    async open() { this.opened = true; this.timer = setInterval(() => this.emit(), 4); }
    async close() { clearInterval(this.timer); }
    async receiveFeatureReport(id) {
      if (id === 0x05) this.full = true;               // reading calibration switches to full reports
      const b = new Uint8Array(id === 0x20 ? 64 : 41); b[0] = id;
      if (id === 0x20) { const s = 'Jul 04 202510:10:32'; for (let i = 0; i < s.length; i++) b[1 + i] = s.charCodeAt(i); const v = new DataView(b.buffer); v.setUint32(24, 0x617, true); v.setUint16(44, 0x630, true); v.setUint32(28, 0x0110002a, true); }
      if (id === 0x09) [1,2,3,4,5,6].forEach((x, i) => b[1 + i] = x);
      if (id === 0x05) { const v = new DataView(b.buffer); [0,0,0,8800,-8800,8800,-8800,8800,-8800,540,540,8192,-8192,8192,-8192,8192,-8192].forEach((x, i) => v.setInt16(1 + i * 2, x, true)); }
      if (id === 0x81) { b[1] = 0; }
      return new DataView(b.buffer);
    }
    async sendFeatureReport(id, data) {
      const d = Array.from(data);
      const ok = crc32([0x53, id, ...d.slice(0, d.length - 4)]) === (d[d.length - 4] | d[d.length - 3] << 8 | d[d.length - 2] << 16 | d[d.length - 1] << 24) >>> 0;
      window.__feat.push({ id, len: d.length, crcOk: ok });
    }
    async sendReport(id, data) {
      const d = Array.from(data);
      const ok = crc32([0xa2, id, ...d.slice(0, 73)]) === ((d[73] | d[74] << 8 | d[75] << 16 | d[76] << 24) >>> 0);
      window.__out.push({ id, len: d.length, crcOk: ok, motors: [d[4], d[5]] });
    }
    emit() {
      const s = window.__pad;
      if (!this.full) {                               // simplified Bluetooth report 0x01
        const u = new Uint8Array(9); u[0] = s.lx; u[1] = s.ly; u[2] = 128; u[3] = 128; u[4] = 8; u[7] = 0; u[8] = 0;
        const e = new Event('inputreport'); e.reportId = 1; e.data = new DataView(u.buffer); this.dispatchEvent(e); return;
      }
      const u = new Uint8Array(77); const o = 1; this.seq = ((this.seq || 0) + 1) & 0xff;
      u[o] = s.lx; u[o + 1] = s.ly; u[o + 2] = 128; u[o + 3] = 128; u[o + 6] = this.seq; u[o + 7] = s.b0; u[o + 8] = 0; u[o + 9] = s.b2;
      const v = new DataView(u.buffer); v.setInt16(o + 23, 8192, true);
      u[o + 32] = 0x80; u[o + 36] = 0x80; u[o + 52] = 0x05;
      const e = new Event('inputreport'); e.reportId = 0x31; e.data = new DataView(u.buffer); this.dispatchEvent(e);
    }
  }
  window.__pad = { lx: 128, ly: 127, b0: 8, b2: 0 };
  const dev = new Dev();
  const hid = new EventTarget(); hid.requestDevice = async () => [dev]; hid.getDevices = async () => [];
  Object.defineProperty(navigator, 'hid', { value: hid });
})();`;
}

(async () => {
  const browser = await chromium.launch();
  let failures = 0;
  for (const [name, pid] of [['DualSense BT', '0x0ce6'], ['DualSense Edge BT', '0x0df2']]) {
    const page = await browser.newPage({ locale: 'fr-FR' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(mock(pid));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.click('#btnConnect2');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      conn: document.getElementById('i-conn').textContent,
      mode: document.getElementById('i-mode').textContent,
      powerOff: !document.getElementById('btnPowerOff').hidden,
      buttons: document.querySelectorAll('#btnGrid .btn').length,
      outs: window.__out.slice(0, 3), feats: window.__feat.slice(0, 3),
      hero: document.getElementById('h-model').textContent,
    }));
    // rumble refresh: start the left motor test and count reports sent while it runs
    await page.click('.tab[data-tab=val]');
    const n0 = await page.evaluate(() => window.__out.length);
    await page.click('#test-rumbleL .tact button >> nth=0');
    await page.waitForTimeout(1000);
    const n1 = await page.evaluate(() => window.__out.length);
    await page.click('.tab[data-tab=cal]');
    await page.waitForTimeout(200);
    const calReq = await page.textContent('#calReq');
    console.log(name, JSON.stringify(r));
    console.log('  rumble reports in 1 s:', n1 - n0, '| calibration:', calReq.replace(/\s+/g, ' ').slice(0, 160));
    const ok = r.conn === 'Bluetooth' && /Complet/.test(r.mode) && r.powerOff && r.outs.every(o => o.len === 77 && o.crcOk) &&
      r.feats.every(f => f.len === 63 && f.crcOk) && (n1 - n0) >= 8 && r.buttons === (pid === '0x0df2' ? 23 : 19);
    console.log('  ' + (ok ? 'OK' : 'FAIL'), errors.length ? 'errors: ' + errors.join(' | ') : '');
    if (!ok || errors.length) failures++;
    await page.close();
  }
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
