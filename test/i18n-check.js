// Translation coverage: every French string of the page and of the scripts must exist in each
// dictionary, with the same {placeholders} and HTML tags.
// Usage: node test/i18n-check.js [--list file.json]   (--list writes the missing French keys per language)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const MOCK = require('./mock');

const root = path.resolve(__dirname, '..');
const LANGS = ['en', 'es', 'de', 'it', 'pt'];
const unescape = s => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

// Literal French keys in the scripts
function scriptKeys() {
  const keys = new Set();
  for (const f of ['app.js', 'calibration.js', 'games.js']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const res = [
      /\btr\(\s*'((?:[^'\\]|\\.)*)'/g,
      /\b(?:title|instructions|label):\s*'((?:[^'\\]|\\.)*)'/g,
      /\bmanual\('\w+',\s*'((?:[^'\\]|\\.)*)',\s*'((?:[^'\\]|\\.)*)'/g,
    ];
    for (const re of res) for (const m of src.matchAll(re)) for (const g of m.slice(1)) if (g && /[A-Za-zÀ-ÿ]{2}/.test(g)) keys.add(unescape(g));
  }
  // labels and reasons produced by dualsense.js, translated by the interface
  const ds = fs.readFileSync(path.join(root, 'dualsense.js'), 'utf8');
  for (const m of ds.matchAll(/label = '((?:[^'\\]|\\.)*)'/g)) keys.add(unescape(m[1]));
  for (const m of ds.matchAll(/reasons\.push\('((?:[^'\\]|\\.)*)'\)/g)) keys.add(unescape(m[1]));
  return keys;
}

function dictionary(lang) {
  const src = fs.readFileSync(path.join(root, 'i18n-' + lang + '.js'), 'utf8');
  return JSON.parse(src.slice(src.indexOf('= {') + 2, src.lastIndexOf('}') + 1));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: 'fr-FR' });
  await page.addInitScript(MOCK);
  await page.goto('file://' + path.join(root, 'index.html'));
  // Static page text, as collected by i18n.js
  const pageKeys = await page.evaluate(() => I18N.staticKeys());
  // Keys requested at run time while connecting and rendering every tab
  await page.evaluate(() => {
    window.__asked = new Set();
    const orig = window.tr;
    window.tr = (s, v) => { if (s != null) window.__asked.add(s); return orig(s, v); };
  });
  await page.click('#btnConnect2');
  await page.waitForTimeout(2000);
  for (const t of ['info', 'val', 'live', 'out', 'games', 'cal', 'raw']) { await page.click('.tab[data-tab=' + t + ']'); await page.waitForTimeout(150); }
  const asked = await page.evaluate(() => [...window.__asked]);
  await browser.close();

  // Numbers, units and names that stay the same in every language
  const neutral = k => !/[A-Za-zÀ-ÿ]{3}/.test(k) || /^(ZerPad|DualSense|DualSense Edge|USB|Bluetooth|OK|Firmware|PCBA ID|MAC|L1|L2|R1|R2|L3|R3|PS|Create|Options|LED \d)$/.test(k);
  const all = new Set([...scriptKeys(), ...pageKeys, ...asked].filter(k => k && !neutral(k)));
  const tags = s => (s.match(/<[^>]+>|\{\w+\}/g) || []).map(t => t.replace(/\s.*?>/, '>')).sort().join('');

  let bad = 0;
  const missingAll = {};
  for (const lang of LANGS) {
    let dict;
    try { dict = dictionary(lang); } catch (e) { console.log(lang + ': no dictionary'); bad++; continue; }
    const missing = [...all].filter(k => !(k in dict));
    const broken = Object.entries(dict).filter(([k, v]) => tags(k) !== tags(v)).map(([k]) => k);
    missingAll[lang] = missing;
    const unused = Object.keys(dict).filter(k => !all.has(k));
    console.log(lang + ': ' + Object.keys(dict).length + ' entries, ' + missing.length + ' missing, ' + broken.length + ' with different tags/placeholders, ' + unused.length + ' unused');
    broken.slice(0, 5).forEach(k => console.log('   tags differ: ' + JSON.stringify(k)));
    if (missing.length || broken.length) bad++;
  }
  const li = process.argv.indexOf('--list');
  if (li > 0) fs.writeFileSync(process.argv[li + 1], JSON.stringify(Object.assign({ _all: [...all] }, missingAll), null, 1));
  console.log(bad ? 'FAIL' : 'OK');
  process.exit(bad ? 1 : 0);
})();
