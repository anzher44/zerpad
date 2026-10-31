// Guided stick recalibration (center and range). Nothing is permanent until saved.
(function () {
  'use strict';
  const ds = window.ds;
  const $ = id => document.getElementById(id);
  const norm = v => (v - 127.5) / 127.5;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let busy = false;          // a step is running
  let unsaved = false;       // temporary calibration not yet committed
  let nvs = null;            // last NVS status
  let before = null, after = null;
  let rangeBins = null;      // coverage tracking during range calibration

  // Requirements
  function requirements() {
    const st = ds.state, f = ds.factory || {};
    const bat = st && st.battery;
    return [
      { ok: !!ds.device, label: tr('Manette connectée') },
      { ok: ds.transport === 'usb', label: tr('Connexion USB (le Bluetooth n\'est pas accepté pour écrire)') },
      { ok: ds.model === 'DualSense', label: tr('DualSense standard (la DualSense Edge ne garde pas la calibration)') },
      { ok: !(f.cloneReasons && f.cloneReasons.length), label: tr('Manette Sony d\'origine') },
      { ok: !!bat && (bat.charging || (bat.pct != null && bat.pct >= 30)), label: tr('Batterie ≥ 30 % ou en charge') },
      { ok: nvs === true || unsaved, label: tr('Mémoire de calibration verrouillée (les changements seront temporaires jusqu\'à sauvegarde)') },
    ];
  }
  function renderReq() {
    const req = requirements();
    $('calReq').innerHTML = req.map(r => '<li>' + (r.ok ? 'OK' : 'NON') + ' : ' + r.label + '</li>').join('');
    return req.every(r => r.ok);
  }
  async function refreshNvs() {
    if (!ds.device || busy) return;
    nvs = await ds.nvsStatus().catch(() => null);
    renderReq(); renderButtons();
  }
  $('calRefresh').addEventListener('click', refreshNvs);
  $('calAck').addEventListener('change', renderButtons);
  ds.addEventListener('ready', () => { unsaved = false; before = after = null; renderCompare(); setTimeout(refreshNvs, 3000); });
  ds.addEventListener('factory', renderReq);
  ds.addEventListener('closed', () => { busy = false; unsaved = false; nvs = null; renderReq(); renderButtons(); setStep(tr('Manette déconnectée.')); });
  document.querySelector('.tab[data-tab=cal]').addEventListener('click', () => { refreshNvs(); renderButtons(); });

  // Center measurement
  async function measure(ms = 1500) {
    const s = [];
    const on = e => { const t = e.detail; s.push([t.lx, t.ly, t.rx, t.ry]); };
    ds.addEventListener('state', on);
    await sleep(ms);
    ds.removeEventListener('state', on);
    const one = i => {
      let mx = 0, sx = 0, sy = 0;
      for (const v of s) { mx = Math.max(mx, Math.hypot(norm(v[i]), norm(v[i + 1]))); sx += norm(v[i]); sy += norm(v[i + 1]); }
      const k = s.length || 1;
      return { offset: +(Math.hypot(sx / k, sy / k) * 100).toFixed(1), maxDev: +(mx * 100).toFixed(1) };
    };
    return { left: one(0), right: one(2), samples: s.length };
  }
  function renderCompare() {
    const row = (name, m) => m ? '<tr><th>' + name + '</th><td>G ' + m.left.offset + ' % (max ' + m.left.maxDev + ' %), D ' + m.right.offset + ' % (max ' + m.right.maxDev + ' %)</td></tr>' : '';
    $('calCompare').innerHTML = (row(tr('Avant'), before) + row(tr('Après'), after)) || tr('<tr><td>Aucune mesure.</td></tr>');
  }
  $('calMeasure').addEventListener('click', async () => {
    if (!ds.device || busy) return;
    setStep(tr('Mesure en cours : ne touchez pas les sticks…'));
    const m = await measure();
    if (unsaved) after = m; else before = m;
    renderCompare(); setStep(tr('Mesure terminée.'));
  });

  // Waits until both sticks rest near the center and stay still
  async function waitCentered(timeout = 6000) {
    const t0 = performance.now();
    let stableSince = null;
    while (performance.now() - t0 < timeout) {
      const st = ds.state;
      if (st) {
        const ok = Math.hypot(norm(st.lx), norm(st.ly)) < 0.15 && Math.hypot(norm(st.rx), norm(st.ry)) < 0.15;
        if (ok) { stableSince = stableSince || performance.now(); if (performance.now() - stableSince > 500) return true; }
        else stableSince = null;
      }
      await sleep(30);
    }
    return false;
  }

  // UI helpers
  function setStep(html) { $('calStep').innerHTML = html; }
  function actions(list) {
    const box = $('calActions'); box.innerHTML = '';
    for (const [label, cls, fn, disabled] of list) {
      const b = document.createElement('button');
      b.textContent = label; b.className = cls; b.disabled = !!disabled;
      b.addEventListener('click', fn); box.appendChild(b);
    }
  }
  function renderButtons() {
    const ready = renderReq() && $('calAck').checked && !busy;
    $('calSave').disabled = !unsaved || busy;
    $('calCancel').disabled = !ds.device || busy || !unsaved;
    $('calState').textContent = unsaved
      ? tr('Calibration modifiée en mémoire temporaire. Sauvegardez-la, ou annulez (le redémarrage restaure l\'ancienne).')
      : tr('Aucun changement en cours.');
    if (busy) return;
    actions([
      [tr('1. Calibrer le centre'), 'primary', runCenter, !ready],
      [tr('2. Calibrer l\'amplitude'), 'primary', runRange, !ready],
    ]);
  }
  function fail(e) {
    busy = false;
    setStep(tr('<b class="big txt-bad">Échec : ') + e.message + tr('</b>Aucune sauvegarde définitive n\'a été faite. Pour revenir à l\'ancienne calibration, cliquez « Annuler (redémarrer la manette) ».'));
    unsaved = true;
    renderButtons();
  }
  // Promise resolved when the user clicks the given button
  function waitClick(label, cls = 'primary') {
    return new Promise(res => actions([[label, cls, () => res()]]));
  }

  // Center calibration (4 corners)
  const CORNERS = ['en haut à gauche', 'en haut à droite', 'en bas à gauche', 'en bas à droite'];
  async function runCenter() {
    if (busy || !renderReq() || !$('calAck').checked) return;
    busy = true; renderButtons();
    try {
      setStep(tr('<b class="big">Mesure avant calibration</b>Lâchez les deux sticks…'));
      actions([]);
      before = await measure(); after = null; renderCompare();
      setStep(tr('<b class="big">Démarrage…</b>'));
      await ds.calibCenterBegin();
      unsaved = true;
      for (let i = 0; i < CORNERS.length; i++) {
        setStep(tr('<b class="big">Étape ') + (i + 1) + tr('/4</b>Poussez les <b>deux sticks ') + tr(CORNERS[i]) + tr('</b>, relâchez-les, puis cliquez « Continuer » quand ils sont revenus au centre.'));
        await waitClick(tr('Continuer'));
        actions([]);
        if (!await waitCentered()) {
          setStep(tr('<b class="big">Étape ') + (i + 1) + tr('/4</b><span class="txt-bad">Les sticks ne sont pas revenus au centre.</span> Relâchez-les complètement puis cliquez « Continuer ».'));
          i--; continue;
        }
        await ds.calibCenterSample();
      }
      setStep(tr('<b class="big">Enregistrement…</b>Ne touchez pas les sticks.'));
      await sleep(200);
      await ds.calibCenterSample();
      await ds.calibCenterEnd();
      await sleep(300);
      after = await measure(); renderCompare();
      busy = false;
      setStep(tr('<b class="big txt-ok">Centre calibré (temporaire)</b>Comparez « Avant / Après ». Si c\'est mieux, cliquez « Sauvegarder définitivement ».'));
      renderButtons();
    } catch (e) { fail(e); }
  }

  // Range calibration
  const BINS = 36;
  function coverage(bins) { return bins.filter(Boolean).length / BINS; }
  ds.addEventListener('state', e => {
    if (!rangeBins) return;
    const t = e.detail;
    [['L', t.lx, t.ly], ['R', t.rx, t.ry]].forEach(([n, x, y]) => {
      const nx = norm(x), ny = norm(y);
      if (Math.hypot(nx, ny) > 0.6) rangeBins[n][Math.floor((Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI) * BINS) % BINS] = 1;
    });
  });
  async function runRange() {
    if (busy || !renderReq() || !$('calAck').checked) return;
    busy = true; renderButtons();
    try {
      actions([]);
      setStep(tr('<b class="big">Démarrage…</b>'));
      await ds.calibRangeBegin();
      unsaved = true;
      rangeBins = { L: new Array(BINS).fill(0), R: new Array(BINS).fill(0) };
      let done = false;
      const doneP = new Promise(res => {
        const tick = () => {
          if (done) return;
          const cl = Math.round(coverage(rangeBins.L) * 100), cr = Math.round(coverage(rangeBins.R) * 100);
          setStep(tr('<b class="big">Amplitude</b>Faites tourner <b>les deux sticks en butée</b>, lentement, plusieurs tours complets.<br>Couverture : gauche ') + cl + tr(' %, droit ') + cr + ' %');
          actions([[tr('Terminer'), 'primary', () => { done = true; res(); }, cl < 95 || cr < 95]]);
          setTimeout(tick, 250);
        };
        tick();
      });
      await doneP;
      rangeBins = null;
      actions([]);
      setStep(tr('<b class="big">Enregistrement…</b>Lâchez les sticks.'));
      await ds.calibRangeEnd();
      busy = false;
      setStep(tr('<b class="big txt-ok">Amplitude calibrée (temporaire)</b>Vérifiez dans l\'onglet Entrées que les sticks atteignent bien le cercle, puis « Sauvegarder définitivement ».'));
      renderButtons();
    } catch (e) { rangeBins = null; fail(e); }
  }

  // Save / cancel
  $('calSave').addEventListener('click', async () => {
    if (!unsaved || busy) return;
    if (!confirm(tr('Écrire définitivement la nouvelle calibration dans la manette ?\n\nNe débranchez pas la manette pendant l\'opération.'))) return;
    busy = true; renderButtons();
    setStep(tr('<b class="big">Sauvegarde…</b>Ne débranchez pas la manette.'));
    try {
      const locked = await ds.nvsSave();
      nvs = locked;
      unsaved = false; busy = false;
      setStep(locked === true
        ? tr('<b class="big txt-ok">Calibration sauvegardée</b>Elle est conservée après extinction et sur PS5. Relancez les tests de sticks dans l\'onglet Validation.')
        : tr('<b class="big txt-bad">Sauvegarde non confirmée</b>La mémoire n\'est pas revenue à l\'état verrouillé. Débranchez/rebranchez la manette et vérifiez.'));
      renderButtons();
    } catch (e) { fail(e); }
  });
  $('calCancel').addEventListener('click', async () => {
    if (!confirm(tr('Redémarrer la manette pour annuler les changements non sauvegardés ?'))) return;
    busy = true; renderButtons();
    await ds.reboot();
    busy = false; unsaved = false;
    setStep(tr('La manette redémarre : l\'ancienne calibration est restaurée. Reconnectez-la si besoin.'));
    renderButtons();
  });

  // Live stick drawing
  function draw(cv, x, y) {
    const ctx = cv.getContext('2d'), W = cv.width, C = W / 2, R = W / 2 - 10;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    ctx.clearRect(0, 0, W, W);
    ctx.strokeStyle = css('--line'); ctx.beginPath(); ctx.arc(C, C, R, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(C - R, C); ctx.lineTo(C + R, C); ctx.moveTo(C, C - R); ctx.lineTo(C, C + R); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = css('--muted');
    ctx.beginPath(); ctx.arc(C, C, R * 0.05, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = css('--accent'); ctx.beginPath(); ctx.arc(C + norm(x) * R, C + norm(y) * R, 6, 0, 7); ctx.fill();
  }
  (function loop() {
    requestAnimationFrame(loop);
    if (!document.getElementById('tab-cal').classList.contains('active') || !ds.state) return;
    const st = ds.state;
    draw($('cvCalL'), st.lx, st.ly); draw($('cvCalR'), st.rx, st.ry);
    $('calTxL').textContent = st.lx + ',' + st.ly + ' (' + (Math.hypot(norm(st.lx), norm(st.ly)) * 100).toFixed(1) + ' %)';
    $('calTxR').textContent = st.rx + ',' + st.ry + ' (' + (Math.hypot(norm(st.rx), norm(st.ry)) * 100).toFixed(1) + ' %)';
  })();

  document.addEventListener('langchange', () => { renderReq(); renderButtons(); renderCompare(); });

  renderButtons();
})();
