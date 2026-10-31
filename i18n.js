// Interface language. French strings are the keys; i18n-en.js maps them to English.
(function () {
  'use strict';
  const KEY = 'zherpad.lang';
  let lang = 'fr';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { /* storage unavailable */ }
  if (lang !== 'fr' && lang !== 'en') lang = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';

  // tr('Texte {n}', { n: 3 })
  function tr(s, vars) {
    if (s == null) return s;
    let out = lang === 'en' ? (window.I18N_EN[s] ?? s) : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  // Static page text: remember the French original of every text node and attribute once
  const textNodes = [], attrs = [], htmlNodes = [];
  function collect() {
    document.querySelectorAll('[data-i18n-html]').forEach(el => htmlNodes.push([el, el.innerHTML.replace(/\s+/g, ' ').trim()]));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!/[A-Za-zÀ-ÿ]{2}/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (n.parentElement.closest('[data-i18n-html], script, style, pre, .print-only')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) textNodes.push([walker.currentNode, walker.currentNode.nodeValue]);
    document.querySelectorAll('[placeholder], [title]').forEach(el => {
      ['placeholder', 'title'].forEach(a => { if (el.hasAttribute(a)) attrs.push([el, a, el.getAttribute(a)]); });
    });
  }
  function applyStatic() {
    for (const [el, html] of htmlNodes) el.innerHTML = tr(html);
    for (const [node, orig] of textNodes) {
      const m = orig.match(/^(\s*)([\s\S]*?)(\s*)$/);
      node.nodeValue = m[1] + tr(m[2].replace(/\s+/g, ' ')) + m[3];
    }
    for (const [el, a, orig] of attrs) el.setAttribute(a, tr(orig));
    document.documentElement.lang = lang;
    const b = document.getElementById('btnLang');
    if (b) b.textContent = lang === 'fr' ? 'EN' : 'FR';
  }
  function setLang(l) {
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* storage unavailable */ }
    applyStatic();
    document.dispatchEvent(new Event('langchange'));
  }

  window.tr = tr;
  window.I18N = { get lang() { return lang; }, setLang, collect, applyStatic };
})();
