// Interface language. French strings are the keys; i18n-<lang>.js files map them to each language
// and are loaded only when that language is chosen.
(function () {
  'use strict';
  const KEY = 'zerpad.lang', SUGGEST_KEY = 'zerpad.langSuggest';
  const LANGS = {
    fr: { name: 'Français', locale: 'fr-FR' },
    en: { name: 'English', locale: 'en-US' },
    es: { name: 'Español', locale: 'es-ES' },
    de: { name: 'Deutsch', locale: 'de-DE' },
    it: { name: 'Italiano', locale: 'it-IT' },
    pt: { name: 'Português', locale: 'pt-PT' },
  };
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  const dicts = window.I18N_DICT = window.I18N_DICT || {};

  // First supported language in the browser preference list, English otherwise
  function browserLang() {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (const l of list) {
      const code = String(l).slice(0, 2).toLowerCase();
      if (LANGS[code]) return code;
    }
    return 'en';
  }
  let lang = store.get(KEY) || store.get('zherpad.lang');
  if (!LANGS[lang]) lang = browserLang();

  // tr('Texte {n}', { n: 3 })
  function tr(s, vars) {
    if (s == null) return s;
    const d = dicts[lang];
    let out = lang !== 'fr' && d && d[s] != null ? d[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  // Loads i18n-<lang>.js once
  const loading = {};
  function load(l) {
    if (l === 'fr' || dicts[l]) return Promise.resolve();
    if (!loading[l]) {
      loading[l] = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'i18n-' + l + '.js';
        sc.onload = resolve;
        sc.onerror = () => { delete loading[l]; reject(new Error('cannot load ' + sc.src)); };
        document.head.appendChild(sc);
      });
    }
    return loading[l];
  }

  // Static page text: remember the French original of every text node and attribute once
  const textNodes = [], attrs = [], htmlNodes = [];
  function collect() {
    document.querySelectorAll('[data-i18n-html]').forEach(el => htmlNodes.push([el, el.innerHTML.replace(/\s+/g, ' ').trim()]));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!/[A-Za-zÀ-ÿ]{2}/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (n.parentElement.closest('[data-i18n-html], script, style, pre, .print-only, #selLang')) return NodeFilter.FILTER_REJECT;
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
    const sel = document.getElementById('selLang');
    if (sel) sel.value = lang;
  }
  function apply() {
    applyStatic();
    document.dispatchEvent(new Event('langchange'));
  }
  async function setLang(l) {
    if (!LANGS[l]) return;
    try { await load(l); } catch (e) { return; }
    lang = l;
    store.set(KEY, l);
    const bar = document.getElementById('langSuggest');
    if (bar) bar.remove();
    apply();
  }

  // Language menu in the header
  function initMenu() {
    const sel = document.getElementById('selLang');
    if (!sel) return;
    sel.innerHTML = Object.entries(LANGS).map(([k, v]) => '<option value="' + k + '" lang="' + k + '">' + v.name + '</option>').join('');
    sel.value = lang;
    sel.addEventListener('change', () => setLang(sel.value));
  }

  // Offers the browser language when the page is shown in another one (for example after an
  // earlier manual choice). The offer is written in the browser language so it can be understood.
  const OFFER = {
    fr: ['Votre navigateur est en français. Afficher la page en français ?', 'Passer en français', 'Non merci'],
    en: ['Your browser is set to English. Show this page in English?', 'Switch to English', 'No thanks'],
    es: ['Tu navegador está en español. ¿Mostrar la página en español?', 'Cambiar a español', 'No, gracias'],
    de: ['Ihr Browser ist auf Deutsch eingestellt. Seite auf Deutsch anzeigen?', 'Auf Deutsch umstellen', 'Nein, danke'],
    it: ['Il tuo browser è in italiano. Mostrare la pagina in italiano?', 'Passa all\'italiano', 'No, grazie'],
    pt: ['O seu navegador está em português. Mostrar a página em português?', 'Mudar para português', 'Não, obrigado'],
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

  // Page start: French text is already in the HTML; another language is applied once its file is loaded
  function init() {
    collect();
    initMenu();
    document.documentElement.lang = lang;
    const show = () => document.documentElement.classList.remove('i18n-wait');
    if (lang !== 'fr') load(lang).then(apply, () => { lang = 'fr'; applyStatic(); }).then(show);
    else show();
    suggest();
  }

  window.tr = tr;
  window.I18N = {
    get lang() { return lang; },
    get locale() { return LANGS[lang].locale; },
    langs: LANGS, setLang, collect, applyStatic, suggest, browserLang, init, ready: () => load(lang),
    // French originals of the static page text (used by the translation check)
    staticKeys: () => [...htmlNodes.map(x => x[1]), ...textNodes.map(x => x[1].replace(/\s+/g, ' ').trim()), ...attrs.map(x => x[2])],
  };
})();
