// Simulated USB DualSense: a fake navigator.hid injected into the page before it loads.
// window.__pad holds the live input state, window.__sent the output reports.
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
      const dv = new DataView(b.buffer); dv.setUint32(24, 0x00000617, true); dv.setUint32(48, 0x00030005, true); dv.setUint32(52, 0x00620055, true); dv.setUint32(56, 0x01020003, true); dv.setUint32(28, 0x01040040, true); dv.setUint16(44, 0x0630, true);
    }
    return new DataView(b.buffer);
  }
  class Dev extends EventTarget {
    constructor(){ super(); this.vendorId=0x054c; this.productId=0x0ce6; this.productName='DualSense Wireless Controller'; this.opened=false; this.collections=[]; }
    async open(){ this.opened=true; this.timer=setInterval(()=>this.emit(),4); }
    async close(){ this.opened=false; clearInterval(this.timer); }
    async receiveFeatureReport(id){
      if (id === 0x81) return this.answer81();
      if (id === 0x83) { const c = this.cal || [0,0,0]; const b = new Uint8Array(64); b[0]=0x83; b[1]=c[1]; b[2]=c[2]; b[3]=c[0]===2?2:1; window.__calLog.push(c.join(',')); return new DataView(b.buffer); }
      return feature(id);
    }
    async sendFeatureReport(id, data){
      if (id === 0x80) { this.cmd = Array.from(data); this.page = 0; window.__calLog.push('80:' + Array.from(data.slice(0, 6)).join(',')); }
      if (id === 0x82) this.cal = Array.from(data.slice(0, 3));
    }
    answer81(){
      const b = new Uint8Array(64); b[0] = 0x81;
      const c = this.cmd || [0,0]; b[1] = c[0]; b[2] = c[1];
      const ascii = s => { for (let i=0;i<s.length;i++) b[4+i]=s.charCodeAt(i); };
      const key = c[0] + '/' + c[1];
      b[3] = 2;
      if (key === '1/19') ascii('A42305T1234567890');
      else if (key === '1/17') ascii('DCBA98765432 1PC');
      else if (key === '1/24') ascii('BAT123456789');
      else if (key === '1/9') { b[4]=0; for (let i=0;i<8;i++) b[5+i]=0x10+i; }
      else if (key === '9/2') [0xA1,0xF2,0x28,0x1B,0x36,0xAC].forEach((v,i)=>b[4+i]=v);
      else if (key === '4/3') { b[4]=0xC4; b[5]=0x0E; }  // 3780 mV
      else if (key === '3/3') b[4]=1;
      else if (key === '12/2') { b[2]=2; }
      else if (key === '112/1') {
        // telemetry: 4 "COMPLETE_2" pages, then the header is cleared
        if (this.page >= 4) { b[1]=0; b[2]=0; b[3]=0; return new DataView(b.buffer); }
        b[3] = 3;
        const blk = window.__tel; b.set(blk.slice(this.page*56, this.page*56+56), 4);
        this.page++;
      }
      else { b[1]=0; b[2]=0; b[3]=0; }  // unknown command: no answer
      return new DataView(b.buffer);
    }
    async sendReport(id, data){ sent.push([id, Array.from(data)]); }
    emit(){
      const s = window.__pad;
      const u = new Uint8Array(63);
      u[0]=s.lx; u[1]=s.ly; u[2]=s.rx; u[3]=s.ry; u[4]=s.l2; u[5]=s.r2;
      this.seq = ((this.seq || 0) + 1) & 0xff; u[6] = this.seq;
      u[7]=s.b0; u[8]=s.b1; u[9]=s.b2;
      const dv=new DataView(u.buffer);
      s.gyro.forEach((v,i)=>dv.setInt16(15+i*2, v, true));
      s.accel.forEach((v,i)=>dv.setInt16(21+i*2, v, true));
      dv.setUint32(27, (performance.now()*3000)>>>0, true);
      for (let k=0;k<2;k++){ const t=s.touch[k]; const p=32+k*4;
        u[p] = t ? k : 0x80; if (t){ u[p+1]=t[0]&0xff; u[p+2]=((t[0]>>8)&0x0f)|((t[1]&0x0f)<<4); u[p+3]=t[1]>>4; } }
      u[41]=s.trigR||0; u[42]=s.trigL||0;
      u[52]=s.status; u[53]=s.plug;
      const ev = new Event('inputreport'); ev.reportId=1; ev.data=new DataView(u.buffer); ev.device=this;
      this.dispatchEvent(ev);
    }
  }
  (() => {
    const blk = new Uint8Array(224), dv = new DataView(blk.buffer, 1);
    const s = 'A42305T1234567890'; for (let i=0;i<s.length;i++) dv.setUint8(i, s.charCodeAt(i));
    dv.setUint32(21, 360000, true);   // 100 h of use
    dv.setUint32(25, 72000, true);    // 20 h of charging
    dv.setUint16(41, 230, true);      // 230 charges
    dv.setUint16(60, 120, true);
    dv.setUint16(66, 300, true); dv.setUint16(68, 950, true);
    dv.setUint32(78, 940, true);
    dv.setUint32(86, 150000, true); dv.setUint32(92, 140000, true);
    dv.setUint32(130, 52341, true);   // cross
    dv.setUint32(158, 81234, true);   // R2
    window.__tel = blk;
  })();
  window.__calLog = [];
  window.__pad = { lx:128, ly:127, rx:129, ry:128, l2:0, r2:0, b0:8, b1:0, b2:0, gyro:[2,-3,1], accel:[0,8192,0], touch:[null,null], status:0x17, plug:0x18 };
  const dev = new Dev(); window.__dev = dev;
  const hid = new EventTarget();
  hid.requestDevice = async () => [dev];
  hid.getDevices = async () => [];
  Object.defineProperty(navigator, 'hid', { value: hid });
})();`;

module.exports = MOCK;
