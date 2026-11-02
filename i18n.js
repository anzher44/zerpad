// Interface language. French strings are the keys; i18n-en.js maps them to English.
(function () {
  'use strict';
  const KEY = 'zherpad.lang', SUGGEST_KEY = 'zherpad.langSuggest';
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  // First supported language in the browser preference list (fr or en), English otherwise
  function browserLang() {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (const l of list) {
      if (/^fr\b/i.test(l)) return 'fr';
      if (/^en\b/i.test(l)) return 'en';
    }
    return 'en';
  }
  let lang = store.get(KEY);
  if (lang !== 'fr' && lang !== 'en') lang = browserLang();

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
    document.querySelectorAll('[placeholder], [title], img[alt]').forEach(el => {
      ['placeholder', 'title', 'alt'].forEach(a => { if (el.getAttribute(a)) attrs.push([el, a, el.getAttribute(a)]); });
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
    store.set(KEY, l);
    applyStatic();
    const bar = document.getElementById('langSuggest');
    if (bar && lang === browserLang()) bar.remove();
    document.dispatchEvent(new Event('langchange'));
  }

  // Offers the browser language when the page is shown in the other one (for example after an
  // earlier manual choice). The offer is written in the browser language so it can be understood.
  const OFFER = {
    fr: ['Votre navigateur est en français. Afficher la page en français ?', 'Passer en français', 'Non merci'],
    en: ['Your browser is set to English. Show this page in English?', 'Switch to English', 'No thanks'],
  };
  function suggest() {
    const want = browserLang();
    if (want === lang || store.get(SUGGEST_KEY) === want || document.getElementById('langSuggest')) return;
    const [text, yes, no] = OFFER[want];
    const bar = document.createElement('div');
    bar.id = 'langSuggest';
    bar.className = 'banner info lang-offer';
    bar.lang = want;
    const msg = document.createElement('span'); msg.textContent = text;
    const b1 = document.createElement('button'); b1.className = 'primary small'; b1.textContent = yes;
    const b2 = document.createElement('button'); b2.className = 'ghost small'; b2.textContent = no;
    b1.addEventListener('click', () => { bar.remove(); setLang(want); });
    b2.addEventListener('click', () => { store.set(SUGGEST_KEY, want); bar.remove(); });
    bar.append(msg, b1, b2);
    const top = document.querySelector('.top');
    top.parentNode.insertBefore(bar, top.nextSibling);
  }

  window.tr = tr;
  window.I18N = { get lang() { return lang; }, setLang, collect, applyStatic, suggest, browserLang };
})();
