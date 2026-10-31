/*
 * dualsense.js — couche protocole DualSense / DualSense Edge via WebHID.
 * Références : pilote Linux drivers/hid/hid-playstation.c, SDL (SDL_hidapi_ps5.c),
 * documentation communautaire des effets de gâchettes (Nielk1).
 * Lecture seule côté firmware : seules les sorties standard (LED, vibrations,
 * gâchettes) sont envoyées. Aucune écriture de calibration ou de firmware.
 */
(function (global) {
  'use strict';

  const VID_SONY = 0x054c;
  const MODELS = { 0x0ce6: 'DualSense', 0x0df2: 'DualSense Edge' };

  const FR_CALIBRATION = 0x05;
  const FR_PAIRING = 0x09;
  const FR_FIRMWARE = 0x20;

  const TOUCH_W = 1920, TOUCH_H = 1080;

  // ---------- CRC32 (Bluetooth) ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const hex = (n, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
  function hexDump(u8) {
    const lines = [];
    for (let i = 0; i < u8.length; i += 16) {
      const row = Array.from(u8.slice(i, i + 16)).map(b => hex(b)).join(' ');
      lines.push(hex(i, 4) + '  ' + row);
    }
    return lines.join('\n');
  }

  // ---------- Effets de gâchettes adaptatives (11 octets) ----------
  const TriggerFx = {
    off() { return [0x05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; },
    // Résistance constante à partir d'une zone (0-9), force 1-8
    feedback(start, strength) {
      start = clamp(start, 0, 9); strength = clamp(strength, 1, 8);
      const force = (strength - 1) & 7;
      let active = 0, zones = 0;
      for (let i = start; i < 10; i++) { zones |= force << (3 * i); active |= 1 << i; }
      return [0x21, active & 0xff, (active >> 8) & 0xff,
        zones & 0xff, (zones >>> 8) & 0xff, (zones >>> 16) & 0xff, (zones >>> 24) & 0xff, 0, 0, 0, 0];
    },
    // Point dur type « arme » : début 2-7, fin début+1..8, force 1-8
    weapon(start, end, strength) {
      start = clamp(start, 2, 7); end = clamp(end, start + 1, 8); strength = clamp(strength, 1, 8);
      const ss = (1 << start) | (1 << end);
      return [0x25, ss & 0xff, (ss >> 8) & 0xff, strength - 1, 0, 0, 0, 0, 0, 0, 0];
    },
    // Vibration à partir d'une zone (0-9), amplitude 1-8, fréquence Hz
    vibration(start, amplitude, freq) {
      start = clamp(start, 0, 9); amplitude = clamp(amplitude, 1, 8); freq = clamp(freq, 1, 255);
      const a = (amplitude - 1) & 7;
      let active = 0, zones = 0;
      for (let i = start; i < 10; i++) { zones |= a << (3 * i); active |= 1 << i; }
      return [0x26, active & 0xff, (active >> 8) & 0xff,
        zones & 0xff, (zones >>> 8) & 0xff, (zones >>> 16) & 0xff, (zones >>> 24) & 0xff, 0, 0, freq, 0];
    },
    rigid() { return TriggerFx.feedback(0, 8); },
  };
  function clamp(v, a, b) { v = Number(v) | 0; return v < a ? a : v > b ? b : v; }

  // ---------- Classe principale ----------
  class DualSense extends EventTarget {
    constructor() {
      super();
      this.device = null;
      this.transport = null;     // 'usb' | 'bt'
      this.model = null;
      this.info = {};
      this.calib = null;
      this.features = {};        // id -> Uint8Array
      this.state = null;
      this.lastRaw = null;
      this.simpleMode = false;
      this.reportCount = 0;
      this.reportRate = 0;
      this._rateT0 = 0; this._rateN = 0;
      this._btSeq = 0;
      this._lightbarSetupDone = false;
      this.out = {
        motorL: 0, motorR: 0, r: 0, g: 64, b: 255,
        playerLeds: 0, ledBrightness: 0, muteLed: 0,
        trigL: TriggerFx.off(), trigR: TriggerFx.off(),
      };
      this._onInput = this._onInput.bind(this);
      this._sendQueued = false;
      this._sending = Promise.resolve();
      this._testLock = Promise.resolve();
      this.factory = null;
      this.telemetry = null;
    }

    static get supported() { return typeof navigator !== 'undefined' && 'hid' in navigator; }
    static get filters() { return Object.keys(MODELS).map(pid => ({ vendorId: VID_SONY, productId: Number(pid) })); }

    async request() {
      const devs = await navigator.hid.requestDevice({ filters: DualSense.filters });
      if (!devs.length) throw new Error('Aucune manette choisie');
      return this.open(devs[0]);
    }

    async open(device) {
      this.device = device;
      if (!device.opened) await device.open();
      this.model = MODELS[device.productId] || 'Inconnu';
      this.info = {
        model: this.model,
        productName: device.productName,
        vendorId: device.vendorId,
        productId: device.productId,
      };
      // Le transport se devine via la taille du rapport de sortie 0x31 (BT) dans les collections
      this.transport = guessTransport(device);
      device.addEventListener('inputreport', this._onInput);
      this.log('Ouverte : ' + device.productName + ' (' + this.transport.toUpperCase() + ' supposé)');
      await this._readFeatures();
      this._lightbarSetupDone = false;
      await this.sendOutput();
      this.dispatchEvent(new Event('ready'));
      return this;
    }

    async close() {
      if (!this.device) return;
      try {
        this.out.motorL = this.out.motorR = 0;
        this.out.trigL = TriggerFx.off(); this.out.trigR = TriggerFx.off();
        await this.sendOutput();
      } catch (e) { /* ignore */ }
      this.device.removeEventListener('inputreport', this._onInput);
      try { await this.device.close(); } catch (e) { /* ignore */ }
      this.device = null;
      this.dispatchEvent(new Event('closed'));
    }

    log(msg) { this.dispatchEvent(new CustomEvent('log', { detail: msg })); }

    async _getFeature(id) {
      const dv = await this.device.receiveFeatureReport(id);
      let u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      // Normalise : octet 0 = identifiant du rapport
      if (u8[0] !== id) { const t = new Uint8Array(u8.length + 1); t[0] = id; t.set(u8, 1); u8 = t; }
      this.features[id] = u8.slice();
      return u8;
    }

    async _readFeatures() {
      // 0x05 : calibration IMU (active aussi le mode de rapport complet en Bluetooth)
      try {
        const b = await this._getFeature(FR_CALIBRATION);
        this.calib = parseCalibration(b);
        this.log('Calibration IMU lue (' + b.length + ' octets)');
      } catch (e) { this.log('Calibration illisible : ' + e.message); }

      try {
        const b = await this._getFeature(FR_PAIRING);
        const mac = [];
        for (let i = 6; i >= 1; i--) mac.push(hex(b[i]));
        this.info.mac = mac.join(':');
      } catch (e) { this.log('Adresse MAC illisible : ' + e.message); }

      try {
        const b = await this._getFeature(FR_FIRMWARE);
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const ascii = (a, z) => String.fromCharCode(...b.slice(a, z)).replace(/\0/g, '').trim();
        this.info.buildDate = ascii(1, 12);
        this.info.buildTime = ascii(12, 20);
        this.info.fwType = dv.getUint16(20, true);
        this.info.swSeries = dv.getUint16(22, true);
        this.info.hwVersion = dv.getUint32(24, true);
        this.info.fwVersion = dv.getUint32(28, true);
        this.info.updateVersion = b.length >= 46 ? dv.getUint16(44, true) : null;
        this.info.deviceInfo = Array.from(b.slice(32, 44)).map(x => hex(x)).join('');
        if (b.length >= 60) {
          this.info.sblVersion = dv.getUint32(48, true);
          this.info.dspVersion = dv.getUint32(52, true);
          this.info.spiderVersion = dv.getUint32(56, true);
        }
        this.info.boardModel = boardModel(this.info.hwVersion, this.model);
        this.log('Firmware : 0x' + hex(this.info.fwVersion, 8) + ', mise à jour 0x' + hex(this.info.updateVersion || 0, 4));
      } catch (e) { this.log('Infos firmware illisibles : ' + e.message); }

      this.dispatchEvent(new Event('info'));
    }

    // ---------- Commandes « test » usine (0x80 → 0x81), lecture seule ----------
    // Seules des commandes de LECTURE (READ_* / GET_*) sont envoyées ici.
    _featureLen(id) {
      for (const c of this.device.collections || []) {
        for (const r of c.featureReports || []) {
          if (r.reportId === id && r.items && r.items[0] && r.items[0].reportCount) return r.items[0].reportCount;
        }
      }
      return 63;
    }

    async _sendFeature(id, bytes) {
      const d = new Uint8Array(this._featureLen(id));
      d.set(bytes.slice(0, d.length));
      if (this.transport === 'bt') {
        const forCrc = new Uint8Array(2 + d.length - 4);
        forCrc[0] = 0x53; forCrc[1] = id; forCrc.set(d.subarray(0, d.length - 4), 2);
        const crc = crc32(forCrc);
        d[d.length - 4] = crc & 0xff; d[d.length - 3] = (crc >>> 8) & 0xff; d[d.length - 2] = (crc >>> 16) & 0xff; d[d.length - 1] = (crc >>> 24) & 0xff;
      }
      await this.device.sendFeatureReport(id, d);
    }

    /**
     * Envoie une commande test (périphérique, action, paramètres) et lit la réponse paginée.
     * Renvoie un Uint8Array (pages de 56 octets concaténées) ou null si pas de réponse.
     */
    testCommand(devId, actId, params = [], maxPages = 1) {
      const run = async () => {
        await this._sendFeature(0x80, [devId, actId, ...params]);
        const pages = [];
        const t0 = performance.now();
        while (pages.length < maxPages && performance.now() - t0 < 800) {
          let r = await this._getFeature(0x81);
          const match = r[1] === devId && r[2] === actId;
          if (match && (r[3] === 2 || r[3] === 3)) {
            pages.push(r.slice(4, 60));
            if (r[3] === 2) break;
          } else if (!match && pages.length) {
            break;
          }
          await new Promise(res => setTimeout(res, 8));
        }
        delete this.features[0x81];
        if (!pages.length) return null;
        const out = new Uint8Array(pages.length * 56);
        pages.forEach((p, i) => out.set(p, i * 56));
        return out;
      };
      const p = this._testLock.then(run, run);
      this._testLock = p.catch(() => null);
      return p.catch(e => { this.log('Commande test ' + devId + '/' + actId + ' : ' + e.message); return null; });
    }

    /** Lit les informations usine (numéro de série, couleur, codes-barres…). */
    async readFactoryInfo() {
      const f = {};
      const asciiOf = (u8, len) => {
        let s = '';
        for (let i = 0; i < Math.min(len, u8.length); i++) {
          const c = u8[i]; if (c === 0) break;
          if (c < 0x20 || c > 0x7e) return s || null;
          s += String.fromCharCode(c);
        }
        return s.trim() || null;
      };
      const hexOf = u8 => Array.from(u8).map(x => hex(x)).join('');
      let r;
      if ((r = await this.testCommand(1, 19))) {
        f.serial = asciiOf(r, 32);
        if (f.serial) { f.colorCode = f.serial.slice(4, 6); f.color = COLORS[f.colorCode] || null; }
      }
      if ((r = await this.testCommand(9, 2))) {
        const m = []; for (let i = 5; i >= 0; i--) m.push(hex(r[i]));
        f.btAddress = m.join(':');
      }
      if ((r = await this.testCommand(4, 3))) { const mv = r[0] | (r[1] << 8); if (mv > 2000 && mv < 5000) f.batteryVoltage = mv; }
      // État de la mémoire de calibration (NVS) : verrouillée = normal
      if ((r = await this.testCommand(3, 3))) f.nvsLocked = r[0] === 1 ? true : r[0] === 0 ? false : null;
      // Requête de réglage fin des sticks : toute vraie DualSense y répond
      r = await this.testCommand(12, 2);
      f.finetuneAnswered = !!r;
      // Authenticité
      const year = parseInt(String(this.info.buildDate || '').trim().slice(-4), 10);
      const reasons = [];
      if (year && year > new Date().getFullYear()) reasons.push('firmware daté du futur (' + year + ')');
      if (!f.finetuneAnswered && this.transport === 'usb') reasons.push('ne répond pas à la requête de calibration des sticks');
      if (this.info.fwVersion == null) reasons.push('informations firmware illisibles');
      f.cloneReasons = reasons;
      // Affiche l'essentiel tout de suite, puis complète avec le reste
      this.factory = f;
      this.dispatchEvent(new Event('factory'));
      if ((r = await this.testCommand(1, 17))) { const s = asciiOf(r, 24); f.pcbaId = s ? s.split('').reverse().join('').trim() : null; }
      if (!f.pcbaId && (r = await this.testCommand(1, 4))) {
        let v = 0n; for (let i = 5; i >= 0; i--) v = (v << 8n) | BigInt(r[i]);
        if (v) f.pcbaId = '0x' + v.toString(16).toUpperCase().padStart(12, '0');
      }
      if ((r = await this.testCommand(1, 9)) && r[0] === 0) {
        f.mcuUniqueId = hexOf(r.slice(1, 9).reverse());
      }
      if ((r = await this.testCommand(1, 24))) f.batteryBarcode = asciiOf(r, 32);
      if ((r = await this.testCommand(1, 26))) f.vcmLeft = asciiOf(r, 32);
      if ((r = await this.testCommand(1, 28))) f.vcmRight = asciiOf(r, 32);
      if ((r = await this.testCommand(1, 21))) { const h = hexOf(r.slice(0, 32)); if (/[^0F]/.test(h)) f.assembleParts = h.replace(/(00)+$/, ''); }
      if (this.transport === 'usb') {
        if ((r = await this.testCommand(5, 2))) f.touchpadId = hexOf(r.slice(0, 8));
        if ((r = await this.testCommand(5, 4))) f.touchpadFw = hexOf(r.slice(0, 8));
      }
      // Moteurs des gâchettes adaptatives (modèles récents)
      if (((this.info.hwVersion || 0) & 0xffff) >= 777) {
        for (const [side, p] of [['L', 1], ['R', 2]]) {
          r = await this.testCommand(7, 37, [p]);
          if (r && r[0] === 0) {
            f['triggerMotor' + side] = { serial: hexOf(r.slice(12, 19)), info: asciiOf(r.slice(19, 27), 8) };
          }
        }
      }
      this.dispatchEvent(new Event('factory'));
      return f;
    }

    /** Lit les compteurs d'usage enregistrés dans la manette (télémétrie 0x70). */
    async readTelemetry() {
      const isEdge = this.model === 'DualSense Edge';
      const block = await this.testCommand(0x70, 1, [], isEdge ? 6 : 4);
      if (!block) { this.telemetry = null; this.dispatchEvent(new Event('telemetry')); return null; }
      const d = new DataView(block.buffer, 1);
      const upd = this.info.updateVersion || 0;
      const full = upd > (isEdge ? 374 : 1106);
      this.telemetry = full ? parseTelemetry(d, isEdge) : { totalActiveTime: tLow(d, 21), partial: true };
      this.telemetryRaw = block;
      this.dispatchEvent(new Event('telemetry'));
      return this.telemetry;
    }

    // Vibration "v2" à partir de la mise à jour 2.21 (comme le pilote Linux)
    get vibrationV2() { return (this.info.updateVersion || 0) >= 0x0215; }

    _onInput(e) {
      const id = e.reportId;
      const dv = e.data;
      const u8 = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      let st;
      if (id === 0x31 && u8.length >= 64) {
        if (this.transport !== 'bt') { this.transport = 'bt'; this.dispatchEvent(new Event('transport')); }
        this.simpleMode = false;
        st = parseFull(u8, 1, this.calib);
      } else if (id === 0x01 && u8.length >= 63) {
        if (this.transport !== 'usb') { this.transport = 'usb'; this.dispatchEvent(new Event('transport')); }
        this.simpleMode = false;
        st = parseFull(u8, 0, this.calib);
      } else if (id === 0x01 && u8.length >= 9) {
        // Mode simplifié Bluetooth (avant lecture de la calibration)
        if (this.transport !== 'bt') { this.transport = 'bt'; this.dispatchEvent(new Event('transport')); }
        this.simpleMode = true;
        st = parseSimple(u8);
      } else {
        return;
      }
      st.reportId = id;
      st.time = performance.now();
      this.state = st;
      this.lastRaw = { id, data: u8.slice() };
      this.reportCount++;
      this._rateN++;
      if (st.time - this._rateT0 >= 1000) {
        this.reportRate = Math.round(this._rateN * 1000 / (st.time - this._rateT0 || 1));
        this._rateN = 0; this._rateT0 = st.time;
      }
      this.dispatchEvent(new CustomEvent('state', { detail: st }));
    }

    // ---------- Sortie ----------
    buildCommon() {
      const o = this.out;
      const c = new Uint8Array(47);
      // valid_flag0 : vibration compatible (v1), sélection haptique, moteurs gâchettes D/G
      c[0] = (this.vibrationV2 ? 0 : 0x01) | 0x02 | 0x04 | 0x08;
      // valid_flag1 : LED micro, barre lumineuse, LED joueur
      c[1] = 0x01 | 0x04 | 0x10;
      c[2] = o.motorR & 0xff;   // moteur droit (léger)
      c[3] = o.motorL & 0xff;   // moteur gauche (fort)
      c[8] = o.muteLed & 0xff;
      c.set(o.trigR.slice(0, 11), 10);
      c.set(o.trigL.slice(0, 11), 21);
      // valid_flag2 : configuration barre lumineuse (une fois) + vibration v2
      let vf2 = this.vibrationV2 ? 0x04 : 0;
      if (!this._lightbarSetupDone) { vf2 |= 0x02; c[41] = 0x02; }
      c[38] = vf2;
      c[42] = o.ledBrightness & 0xff;
      c[43] = (o.playerLeds & 0x1f) | 0x20;
      c[44] = o.r & 0xff; c[45] = o.g & 0xff; c[46] = o.b & 0xff;
      return c;
    }

    // Regroupe les envois (un seul rapport par image d'animation)
    update(patch) {
      Object.assign(this.out, patch);
      if (this._sendQueued) return;
      this._sendQueued = true;
      setTimeout(() => { this._sendQueued = false; this.sendOutput(); }, 10);
    }

    sendOutput() {
      if (!this.device) return Promise.resolve();
      const c = this.buildCommon();
      this._sending = this._sending.then(async () => {
        try {
          if (this.transport === 'bt') {
            const d = new Uint8Array(77);
            d[0] = (this._btSeq << 4) & 0xf0; this._btSeq = (this._btSeq + 1) & 0x0f;
            d[1] = 0x10;
            d.set(c, 2);
            const forCrc = new Uint8Array(2 + 73);
            forCrc[0] = 0xa2; forCrc[1] = 0x31; forCrc.set(d.subarray(0, 73), 2);
            const crc = crc32(forCrc);
            d[73] = crc & 0xff; d[74] = (crc >>> 8) & 0xff; d[75] = (crc >>> 16) & 0xff; d[76] = (crc >>> 24) & 0xff;
            await this.device.sendReport(0x31, d);
          } else {
            await this.device.sendReport(0x02, c);
          }
          this._lightbarSetupDone = true;
        } catch (e) {
          this.log('Erreur envoi sortie : ' + e.message);
        }
      });
      return this._sending;
    }
  }

  function guessTransport(device) {
    for (const col of device.collections || []) {
      for (const r of col.outputReports || []) if (r.reportId === 0x31) return 'bt';
      for (const r of col.inputReports || []) if (r.reportId === 0x31) return 'bt';
    }
    return 'usb';
  }

  // ---------- Analyse des rapports ----------
  const s16 = (u8, i) => { const v = u8[i] | (u8[i + 1] << 8); return v & 0x8000 ? v - 0x10000 : v; };
  const u32 = (u8, i) => (u8[i] | (u8[i + 1] << 8) | (u8[i + 2] << 16) | (u8[i + 3] << 24)) >>> 0;

  function parseButtons(b0, b1, b2) {
    const hat = b0 & 0x0f;
    const up = hat === 7 || hat === 0 || hat === 1;
    const right = hat >= 1 && hat <= 3;
    const down = hat >= 3 && hat <= 5;
    const left = hat >= 5 && hat <= 7;
    return {
      up, right, down, left,
      square: !!(b0 & 0x10), cross: !!(b0 & 0x20), circle: !!(b0 & 0x40), triangle: !!(b0 & 0x80),
      l1: !!(b1 & 0x01), r1: !!(b1 & 0x02), l2: !!(b1 & 0x04), r2: !!(b1 & 0x08),
      create: !!(b1 & 0x10), options: !!(b1 & 0x20), l3: !!(b1 & 0x40), r3: !!(b1 & 0x80),
      ps: !!(b2 & 0x01), touchpad: !!(b2 & 0x02), mute: !!(b2 & 0x04),
      // DualSense Edge
      fnL: !!(b2 & 0x10), fnR: !!(b2 & 0x20), paddleL: !!(b2 & 0x40), paddleR: !!(b2 & 0x80),
    };
  }

  function parseSimple(u8) {
    return {
      lx: u8[0], ly: u8[1], rx: u8[2], ry: u8[3],
      buttons: parseButtons(u8[4], u8[5], u8[6] & 0x03),
      l2: u8[7], r2: u8[8],
      gyro: null, accel: null, touches: [], battery: null, simple: true,
    };
  }

  function parseFull(u8, o, calib) {
    const st = {
      lx: u8[o], ly: u8[o + 1], rx: u8[o + 2], ry: u8[o + 3],
      l2: u8[o + 4], r2: u8[o + 5],
      seq: u8[o + 6],
      buttons: parseButtons(u8[o + 7], u8[o + 8], u8[o + 9]),
    };
    const graw = [s16(u8, o + 15), s16(u8, o + 17), s16(u8, o + 19)];
    const araw = [s16(u8, o + 21), s16(u8, o + 23), s16(u8, o + 25)];
    st.gyroRaw = graw; st.accelRaw = araw;
    st.gyro = applyGyro(graw, calib);
    st.accel = applyAccel(araw, calib);
    st.sensorTs = u32(u8, o + 27);
    st.touches = [];
    for (let k = 0; k < 2; k++) {
      const p = o + 32 + k * 4;
      const c = u8[p];
      st.touches.push({
        active: !(c & 0x80), id: c & 0x7f,
        x: u8[p + 1] | ((u8[p + 2] & 0x0f) << 8),
        y: (u8[p + 2] >> 4) | (u8[p + 3] << 4),
      });
    }
    st.trigStatusR = u8[o + 41]; st.trigStatusL = u8[o + 42];
    const status = u8[o + 52];
    const lvl = status & 0x0f, chg = (status & 0xf0) >> 4;
    let pct = null, label;
    switch (chg) {
      case 0x0: pct = Math.min(lvl * 10 + 5, 100); label = 'Sur batterie'; break;
      case 0x1: pct = Math.min(lvl * 10 + 5, 100); label = 'En charge'; break;
      case 0x2: pct = 100; label = 'Chargée'; break;
      case 0xa: label = 'Erreur : tension/température hors limites'; break;
      case 0xb: label = 'Erreur : température'; break;
      case 0xf: label = 'Erreur de charge'; break;
      default: label = 'Inconnu (0x' + hex(chg, 1) + ')';
    }
    st.battery = { pct, label, raw: status, error: chg >= 0xa };
    const plug = u8[o + 53];
    st.plug = { raw: plug, headphones: !!(plug & 0x01), mic: !!(plug & 0x02) };
    return st;
  }

  function parseCalibration(b) {
    const g = i => s16(b, i);
    const c = {
      gyroPitchBias: g(1), gyroYawBias: g(3), gyroRollBias: g(5),
      gyroPitchPlus: g(7), gyroPitchMinus: g(9),
      gyroYawPlus: g(11), gyroYawMinus: g(13),
      gyroRollPlus: g(15), gyroRollMinus: g(17),
      gyroSpeedPlus: g(19), gyroSpeedMinus: g(21),
      accXPlus: g(23), accXMinus: g(25),
      accYPlus: g(27), accYMinus: g(29),
      accZPlus: g(31), accZMinus: g(33),
    };
    const speed2x = c.gyroSpeedPlus + c.gyroSpeedMinus;
    const ax = (bias, plus, minus) => {
      const denom = Math.abs(plus - bias) + Math.abs(minus - bias);
      return { bias, k: denom ? speed2x / denom : 0 };
    };
    c.gyro = [ax(c.gyroPitchBias, c.gyroPitchPlus, c.gyroPitchMinus),
      ax(c.gyroYawBias, c.gyroYawPlus, c.gyroYawMinus),
      ax(c.gyroRollBias, c.gyroRollPlus, c.gyroRollMinus)];
    const ac = (plus, minus) => {
      const range = plus - minus;
      return { bias: plus - range / 2, k: range ? 2 / range : 0 };
    };
    c.accel = [ac(c.accXPlus, c.accXMinus), ac(c.accYPlus, c.accYMinus), ac(c.accZPlus, c.accZMinus)];
    // Validité : dénominateurs non nuls et plausibles
    c.valid = c.gyro.every(a => a.k > 0 && isFinite(a.k)) && c.accel.every(a => a.k > 0 && isFinite(a.k)) && speed2x > 0;
    return c;
  }

  function applyGyro(raw, calib) {
    if (calib && calib.valid) return raw.map((v, i) => (v - calib.gyro[i].bias) * calib.gyro[i].k);
    return raw.map(v => v / 16.384);   // repli : ±2000 °/s
  }
  function applyAccel(raw, calib) {
    if (calib && calib.valid) return raw.map((v, i) => (v - calib.accel[i].bias) * calib.accel[i].k);
    return raw.map(v => v / 8192);     // repli : ±4 g
  }

  // Couleur d'après les caractères 5-6 du numéro de série (sources : dualshock-tools, daidr/dualsense-tester)
  const COLORS = {
    '00': 'Blanc (White)', '01': 'Noir (Midnight Black)', '02': 'Rouge (Cosmic Red)', '03': 'Rose (Nova Pink)',
    '04': 'Violet (Galactic Purple)', '05': 'Bleu (Starlight Blue)', '06': 'Camouflage gris', '07': 'Volcanic Red',
    '08': 'Sterling Silver', '09': 'Cobalt Blue', '10': 'Chroma Teal', '11': 'Chroma Indigo', '12': 'Chroma Pearl',
    '13': 'HyperPop Techno Red', '14': 'HyperPop Remix Green', '15': 'HyperPop Rhythm Blue', '30': '30e anniversaire',
    'Z1': 'God of War Ragnarök', 'Z2': 'Spider-Man 2', 'Z3': 'Astro Bot', 'Z4': 'Fortnite', 'Z5': 'Monster Hunter Wilds',
    'Z6': 'The Last of Us', 'ZA': 'God of War 20e anniversaire', 'ZB': 'Icon Blue (édition limitée)',
    'ZC': 'Astro Bot Joyful / Ghost of Yōtei (édition limitée)', 'ZD': 'Marathon (édition limitée)',
    'ZE': 'Genshin Impact (édition limitée)', 'ZF': '007 First Light (édition limitée)',
  };

  // Modèle de carte mère d'après la version matérielle (rapport 0x20)
  function boardModel(hw, model) {
    if (hw == null || model === 'DualSense Edge') return null;
    const a = (hw >> 8) & 0xff;
    return { 0x03: 'BDM-010', 0x04: 'BDM-020', 0x05: 'BDM-030', 0x06: 'BDM-040', 0x07: 'BDM-050', 0x08: 'BDM-050',
      0x09: 'BDM-060R', 0x11: 'BDM-060M', 0x13: 'BDM-060X' }[a] || ('Inconnu (0x' + hex(a) + ')');
  }

  // ---------- Télémétrie (compteurs d'usage en mémoire de la manette) ----------
  // Structure et décodage d'après daidr/dualsense-tester (MIT), src/utils/dualsense/telemetry.util.ts
  function tCount(d, i) {
    const v = d.getUint32(i, true), lo = v & 0xffff, hi = (v >>> 16) & 0xffff;
    if (hi === 0) return lo;
    if (hi >= 0xff00 && lo >= 0xff00) return 0;
    return lo;
  }
  function tCountHigh(d, i) { const v = d.getUint16(i + 2, true); return v < 0xff00 ? v : 0; }
  function tLow(d, i) { const v = d.getUint32(i, true) & 0xffffff; return v < 0xffff00 ? v : 0; }
  function tShort(d, i) { return d.getUint8(i + 1) < 0xe0 ? d.getUint16(i, true) : d.getUint8(i); }
  function tEdgeRecord(d, i) { const v = d.getUint32(i, true); return v === 0xffffffff || v < 0xedf00000 ? 0 : v - 0xedf00000; }
  function tEdgeStroke(d, i) {
    const v = d.getUint32(i, true), lo = v & 0xffff, hi = (v >>> 16) & 0xffff;
    if (lo >= 0xff00) { const x = v - (hi * 0x10000 + 0xff00); if (x >= 0 && x < 100000) return x; }
    return hi === 0 ? lo : v;
  }
  function tAscii(d, off, len, alnum) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = d.getUint8(off + i);
      if (alnum ? !((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a)) : c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  function parseTelemetry(d, isEdge) {
    const t = {
      serial: tAscii(d, 0, 17),
      totalRecordCount: isEdge ? tEdgeRecord(d, 17) : d.getUint32(17, true),
      totalActiveTime: tLow(d, 21), totalChargeTime: tLow(d, 25), hapticActiveTime: tLow(d, 29),
      triggerLeftActiveTime: tCount(d, 33), triggerRightActiveTime: tCount(d, 37),
      batteryChargeCount: tShort(d, 41),
      usbSdp: d.getUint16(43, true), usbCdp: tShort(d, 45), usbDcp: d.getUint16(47, true),
      usbTypeC15: d.getUint16(49, true), usbTypeC30: d.getUint16(51, true), usbUnknown: d.getUint16(53, true),
      chargerConnectCount: d.getUint16(55, true),
      chargeVoltageErrors: d.getUint8(57), chargeTemperatureErrors: d.getUint8(58), chargePmicErrors: d.getUint8(59),
      fullChargeCount: d.getUint16(60, true),
      headsetDetectCount: d.getUint16(62, true), headphoneDetectCount: d.getUint16(64, true),
      usbConnectCount: d.getUint16(66, true), btConnectCount: d.getUint16(68, true), btTimeoutCount: d.getUint16(70, true),
      subcpuStartupErrors: d.getUint16(72, true),
      authChallengeCount: tCount(d, 74), authSuccessCount: tCount(d, 78), authFailCount: tCount(d, 82),
      buttons: {}, sticks: {},
    };
    if (isEdge) {
      [['up', 86], ['down', 90], ['left', 94], ['right', 98], ['triangle', 102], ['cross', 106], ['square', 110], ['circle', 114],
        ['l1', 118], ['r1', 134], ['touch', 150], ['touchpad', 154], ['options', 158], ['create', 162], ['ps', 166]]
        .forEach(([k, o]) => { t.buttons[k] = tCount(d, o); });
      t.buttons.l2 = tEdgeStroke(d, 122) + tEdgeStroke(d, 126) + tEdgeStroke(d, 130);
      t.buttons.r2 = tEdgeStroke(d, 138) + tEdgeStroke(d, 142) + tEdgeStroke(d, 146);
      t.buttons.mute = tCountHigh(d, 170); t.buttons.paddleL = tCountHigh(d, 174); t.buttons.paddleR = tCountHigh(d, 178);
      t.stickModuleL = { serial: tAscii(d, 182, 17, true), x: d.getUint32(199, true), y: d.getUint32(205, true) };
      t.stickModuleR = { serial: tAscii(d, 219, 17, true), x: d.getUint32(236, true), y: d.getUint32(242, true) };
    } else {
      t.sticks = {
        lx: d.getUint32(86, true), ly: d.getUint32(92, true), rx: d.getUint32(98, true), ry: d.getUint32(104, true),
        lxRange: d.getUint16(90, true), lyRange: d.getUint16(96, true), rxRange: d.getUint16(102, true), ryRange: d.getUint16(108, true),
      };
      [['up', 110], ['down', 114], ['left', 118], ['right', 122], ['triangle', 126], ['cross', 130], ['square', 134], ['circle', 138],
        ['l1', 142], ['l2', 146], ['l3', 150], ['r1', 154], ['r2', 158], ['r3', 162], ['touch', 166], ['touchpad', 170],
        ['options', 174], ['create', 178], ['ps', 182], ['mute', 186]]
        .forEach(([k, o]) => { t.buttons[k] = tCount(d, o); });
    }
    return t;
  }

  function fwString(v) {
    if (v == null) return '—';
    return ((v >>> 24) & 0xff) + '.' + hex((v >>> 16) & 0xff) + '.' + hex(v & 0xffff, 4) + '  (0x' + hex(v, 8) + ')';
  }

  global.DualSense = DualSense;
  global.DSUtil = { hex, hexDump, crc32, TriggerFx, fwString, TOUCH_W, TOUCH_H, parseFull, parseCalibration, parseTelemetry, COLORS };
})(window);
