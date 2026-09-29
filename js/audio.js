// BGM・効果音（WebAudioでその場で合成。音声ファイル不要）
(function (root) {
  'use strict';
  let ctx = null, master = null, bgmBus = null, seBus = null;
  let current = null, timer = null, step = 0, nextTime = 0;
  const vol = { bgm: 0.6, se: 0.8 };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    bgmBus = ctx.createGain(); bgmBus.gain.value = vol.bgm * 0.5; bgmBus.connect(comp);
    seBus = ctx.createGain(); seBus.gain.value = vol.se; seBus.connect(comp);
  }
  function setVolume(kind, v) {
    vol[kind] = v;
    if (!ctx) return;
    if (kind === 'bgm') bgmBus.gain.value = v * 0.5; else seBus.gain.value = v;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s;
  }
  function tone(out, t, freq, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.wave || 'sine'; osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol == null ? 0.3 : o.vol, a = o.attack || 0.005, rel = o.release || dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
    let node = osc;
    if (o.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; osc.connect(f); node = f; }
    node.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + a + rel + 0.05);
  }
  function burst(out, t, dur, o) {
    o = o || {};
    const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    const v = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---------- BGM ----------
  // 音名 → MIDI
  const N = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function n(s) { // "A3" "C#4" "Bb2"
    const m = s.match(/^([A-G])([#b]?)(-?\d)$/);
    return N[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
  }
  function chord(names) { return names.split(' ').map(n); }
  // 和音列から、1小節=8ステップのアルペジオ列をつくる
  function arp(chords, pattern) {
    const out = [];
    chords.forEach(c => pattern.forEach(i => out.push(i == null ? null : c[i % c.length] + (i >= c.length ? 12 : 0))));
    return out;
  }
  function hold(chords, len) { const out = []; chords.forEach(c => { out.push(c); for (let i = 1; i < len; i++) out.push(null); }); return out; }

  const TRACKS = {
    title: {
      bpm: 66, parts: [
        { seq: arp([chord('A3 C4 E4'), chord('F3 A3 C4'), chord('C3 E3 G3'), chord('G3 B3 D4')], [0, 1, 2, 3, 2, 1, 0, 2]), wave: 'triangle', vol: 0.13, rel: 0.9 },
        { seq: hold([[n('A1')], [n('F1')], [n('C2')], [n('G1')]], 8), wave: 'sine', vol: 0.22, rel: 3.2 },
        { seq: hold([chord('A4 E5'), chord('A4 C5'), chord('G4 E5'), chord('G4 D5')], 8), wave: 'sine', vol: 0.04, rel: 3.5, attack: 0.8 }
      ]
    },
    calm: {
      bpm: 88, parts: [
        { seq: arp([chord('C4 E4 G4'), chord('A3 C4 E4'), chord('F3 A3 C4'), chord('G3 B3 D4')], [0, 2, 1, 2, 3, 2, 1, 2]), wave: 'triangle', vol: 0.1, rel: 0.5 },
        { seq: hold([[n('C2')], [n('A1')], [n('F1')], [n('G1')]], 4).concat(hold([[n('C2')], [n('A1')], [n('F1')], [n('G1')]], 4)).slice(0, 32), wave: 'sine', vol: 0.2, rel: 1.2 },
        { seq: [n('E5'), null, n('G5'), null, n('A5'), n('G5'), null, null, n('E5'), null, n('D5'), null, n('C5'), null, null, null, n('C5'), null, n('D5'), null, n('E5'), null, n('G5'), null, n('F5'), null, n('E5'), null, n('D5'), null, null, null], wave: 'sine', vol: 0.07, rel: 0.6 }
      ]
    },
    comedy: {
      bpm: 138, parts: [
        { seq: [n('C3'), null, n('G2'), null, n('C3'), null, n('G2'), n('A2'), n('F2'), null, n('C3'), null, n('G2'), null, n('B2'), null], wave: 'square', vol: 0.07, rel: 0.12, filter: 900 },
        { seq: [n('E5'), n('G5'), null, n('E5'), n('C5'), null, n('D5'), null, n('F5'), null, n('A5'), n('G5'), null, n('F5'), n('D5'), null], wave: 'square', vol: 0.045, rel: 0.1, filter: 2400 },
        { seq: [0, null, 1, null, 0, null, 1, null], noise: true }
      ]
    },
    romance: {
      bpm: 72, parts: [
        { seq: arp([chord('F3 A3 C4 E4'), chord('E3 G3 B3 D4'), chord('D3 F3 A3 C4'), chord('C3 E3 G3 B3')], [0, 1, 2, 3, 4, 3, 2, 1]), wave: 'sine', vol: 0.12, rel: 1.2 },
        { seq: hold([[n('F2')], [n('E2')], [n('D2')], [n('C2')]], 8), wave: 'triangle', vol: 0.14, rel: 3 },
        { seq: [n('A5'), null, null, n('G5'), n('A5'), null, n('C6'), null, n('B5'), null, null, n('G5'), n('E5'), null, null, null, n('F5'), null, null, n('E5'), n('F5'), null, n('A5'), null, n('G5'), null, null, null, null, null, null, null], wave: 'sine', vol: 0.06, rel: 1.4 }
      ]
    },
    suspense: {
      bpm: 60, parts: [
        { seq: hold([[n('D2'), n('Eb2')]], 16), wave: 'sawtooth', vol: 0.05, rel: 7, attack: 1.5, filter: 400 },
        { seq: [n('D4'), null, null, null, null, null, n('Eb4'), null, null, null, null, null, null, null, n('A3'), null], wave: 'triangle', vol: 0.07, rel: 1.5 },
        { seq: [null, null, null, null, null, null, null, null, null, null, null, n('G#5'), null, null, null, null], wave: 'sine', vol: 0.04, rel: 2 }
      ]
    },
    horror: {
      bpm: 50, parts: [
        { seq: hold([[n('C2'), n('C#2'), n('F#2')]], 16), wave: 'sawtooth', vol: 0.045, rel: 9, attack: 2, filter: 300 },
        { seq: [null, null, n('F#5'), null, null, null, null, null, null, n('G5'), null, null, null, null, null, null], wave: 'sine', vol: 0.05, rel: 3, attack: 0.4 },
        { seq: [n('C3'), null, null, null, null, null, null, null, n('C3'), null, null, null, null, null, null, null], wave: 'sine', vol: 0.18, rel: 0.6 }
      ]
    },
    sad: {
      bpm: 58, parts: [
        { seq: arp([chord('A3 C4 E4'), chord('E3 G3 B3'), chord('F3 A3 C4'), chord('C3 E3 G3')], [0, 1, 2, 1, 3, 1, 2, 1]), wave: 'triangle', vol: 0.1, rel: 1.3 },
        { seq: hold([[n('A1')], [n('E2')], [n('F1')], [n('C2')]], 8), wave: 'sine', vol: 0.2, rel: 4 },
        { seq: [n('E5'), null, null, null, n('D5'), null, n('C5'), null, n('B4'), null, null, null, null, null, null, null, n('C5'), null, null, null, n('B4'), null, n('A4'), null, n('G4'), null, null, null, null, null, null, null], wave: 'sine', vol: 0.07, rel: 1.8 }
      ]
    },
    mystery: {
      bpm: 108, parts: [
        { seq: [n('D2'), n('D2'), n('A2'), n('D2'), n('F2'), n('D2'), n('E2'), n('C#2')], wave: 'triangle', vol: 0.2, rel: 0.2 },
        { seq: [n('D5'), null, null, n('F5'), null, n('E5'), null, null, n('A4'), null, null, null, n('C#5'), null, null, null], wave: 'square', vol: 0.035, rel: 0.25, filter: 1600 },
        { seq: [1, null, 0, null, 1, null, 0, 0], noise: true }
      ]
    },
    tension: {
      bpm: 150, parts: [
        { seq: [n('E2'), n('E2'), n('E3'), n('E2'), n('E2'), n('D3'), n('E2'), n('B2'), n('E2'), n('E2'), n('E3'), n('E2'), n('G2'), n('F#2'), n('F2'), n('D#2')], wave: 'sawtooth', vol: 0.06, rel: 0.12, filter: 800 },
        { seq: hold([chord('E4 B4'), chord('F4 C5')], 16), wave: 'sawtooth', vol: 0.025, rel: 3, attack: 0.5, filter: 1500 },
        { seq: [1, null, 0, null, 1, 0, 0, null], noise: true }
      ]
    },
    ending: {
      bpm: 76, parts: [
        { seq: arp([chord('C4 E4 G4'), chord('G3 B3 D4'), chord('A3 C4 E4'), chord('F3 A3 C4')], [0, 1, 2, 3, 2, 1, 2, 1]), wave: 'triangle', vol: 0.1, rel: 0.9 },
        { seq: hold([[n('C2')], [n('G1')], [n('A1')], [n('F1')]], 8), wave: 'sine', vol: 0.22, rel: 3 },
        { seq: [n('G5'), null, n('E5'), null, n('C6'), null, null, null, n('B5'), null, n('G5'), null, n('D5'), null, null, null, n('C5'), null, n('E5'), null, n('A5'), null, n('G5'), null, n('F5'), null, n('E5'), null, n('C5'), null, null, null], wave: 'sine', vol: 0.08, rel: 1 }
      ]
    },
    snow: {
      bpm: 64, parts: [
        { seq: [n('E6'), null, null, null, null, n('B5'), null, null, null, null, n('A5'), null, null, null, null, null, n('G5'), null, null, n('E6'), null, null, null, null, n('D6'), null, null, null, null, null, null, null], wave: 'sine', vol: 0.06, rel: 2.5 },
        { seq: hold([chord('E3 B3 G4'), chord('C3 G3 E4'), chord('D3 A3 F#4'), chord('B2 F#3 D4')], 8), wave: 'sine', vol: 0.035, rel: 4, attack: 1.2 }
      ]
    }
  };

  function tick() {
    if (!current) return;
    const tr = TRACKS[current];
    const stepDur = 60 / tr.bpm / 2;
    while (nextTime < ctx.currentTime + 0.25) {
      tr.parts.forEach(p => {
        const v = p.seq[step % p.seq.length];
        if (v == null) return;
        if (p.noise) { burst(bgmBus, nextTime, v ? 0.04 : 0.02, { type: 'highpass', freq: v ? 6000 : 9000, vol: v ? 0.05 : 0.025 }); return; }
        (Array.isArray(v) ? v : [v]).forEach(m => tone(bgmBus, nextTime, mtof(m), 0, { wave: p.wave, vol: p.vol, release: p.rel, attack: p.attack, filter: p.filter }));
      });
      step++; nextTime += stepDur;
    }
  }
  function playBgm(id) {
    init(); if (!ctx) return;
    if (id === 'stop' || !TRACKS[id]) { stopBgm(); return; }
    if (current === id) return;
    stopBgm();
    current = id; step = 0; nextTime = ctx.currentTime + 0.1;
    bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bgmBus.gain.linearRampToValueAtTime(vol.bgm * 0.5, ctx.currentTime + 1);
    timer = setInterval(tick, 60); tick();
  }
  function stopBgm() {
    current = null;
    if (timer) clearInterval(timer); timer = null;
  }

  // ---------- 効果音 ----------
  const SE = {
    click(t) { tone(seBus, t, 1800, 0.03, { vol: 0.05, wave: 'square', filter: 3000 }); },
    select(t) { tone(seBus, t, 880, 0.08, { vol: 0.1, wave: 'triangle' }); tone(seBus, t + 0.06, 1320, 0.12, { vol: 0.08, wave: 'triangle' }); },
    door(t) { tone(seBus, t, 300, 0.5, { to: 180, wave: 'sawtooth', vol: 0.06, filter: 900 }); tone(seBus, t + 0.45, 70, 0.3, { to: 40, vol: 0.5 }); },
    knock(t) { [0, 0.18, 0.36].forEach(d => { tone(seBus, t + d, 160, 0.1, { to: 90, vol: 0.5 }); burst(seBus, t + d, 0.05, { freq: 600, vol: 0.2 }); }); },
    scream(t) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1300, t + 0.3); o.frequency.linearRampToValueAtTime(900, t + 1.4);
      lfo.frequency.value = 7; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(f); f.connect(g); g.connect(seBus); o.start(t); lfo.start(t); o.stop(t + 1.6); lfo.stop(t + 1.6);
      burst(seBus, t, 1.2, { freq: 2500, q: 3, vol: 0.08 });
    },
    shock(t) { [n('C3'), n('F#3'), n('C4')].forEach(m => tone(seBus, t, mtof(m), 1.4, { wave: 'square', vol: 0.09, filter: 2000, to: mtof(m) * 0.94 })); tone(seBus, t, 55, 1, { vol: 0.5 }); },
    heartbeat(t) { [0, 0.22, 0.9, 1.12].forEach((d, i) => tone(seBus, t + d, i % 2 ? 50 : 60, 0.2, { to: 35, vol: i % 2 ? 0.45 : 0.6 })); },
    wind(t) { burst(seBus, t, 2.6, { freq: 300, to: 1200, q: 4, vol: 0.18, attack: 0.8 }); burst(seBus, t + 0.8, 2, { freq: 900, to: 400, q: 6, vol: 0.12, attack: 0.5 }); },
    footsteps(t) { [0, 0.35, 0.7, 1.05].forEach(d => { tone(seBus, t + d, 110, 0.12, { to: 60, vol: 0.35 }); burst(seBus, t + d, 0.06, { freq: 400, vol: 0.12 }); }); },
    glass(t) { [2600, 3400, 4100, 5200].forEach((f, i) => tone(seBus, t + i * 0.03, f, 0.8, { vol: 0.07 })); burst(seBus, t, 0.3, { type: 'highpass', freq: 4000, vol: 0.2 }); },
    breaker(t) { burst(seBus, t, 0.08, { type: 'highpass', freq: 2000, vol: 0.5 }); tone(seBus, t, 90, 0.4, { to: 30, vol: 0.6, wave: 'square', filter: 400 }); },
    phone(t) { for (let i = 0; i < 6; i++) tone(seBus, t + i * 0.09 + (i >= 3 ? 0.3 : 0), 150, 0.07, { wave: 'square', vol: 0.08, filter: 500 }); },
    meow(t) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(550, t); o.frequency.linearRampToValueAtTime(850, t + 0.15); o.frequency.linearRampToValueAtTime(480, t + 0.5);
      f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1800, t + 0.2); f.frequency.linearRampToValueAtTime(800, t + 0.5); f.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(f); f.connect(g); g.connect(seBus); o.start(t); o.stop(t + 0.6);
    },
    bell(t) { tone(seBus, t, 1320, 1.4, { vol: 0.15 }); tone(seBus, t, 2640, 0.8, { vol: 0.05 }); tone(seBus, t, 3960, 0.4, { vol: 0.03 }); },
    pen(t) { for (let i = 0; i < 7; i++) burst(seBus, t + i * 0.07 + Math.random() * 0.03, 0.05, { freq: 3000 + Math.random() * 2000, q: 2, vol: 0.12 }); },
    splash(t) { burst(seBus, t, 0.35, { type: 'lowpass', freq: 2500, to: 300, vol: 0.4 }); },
    thud(t) { tone(seBus, t, 90, 0.35, { to: 35, vol: 0.7 }); burst(seBus, t, 0.1, { type: 'lowpass', freq: 500, vol: 0.3 }); },
    chime(t) { tone(seBus, t, 1568, 0.5, { vol: 0.15, wave: 'triangle' }); tone(seBus, t + 0.12, 2093, 0.9, { vol: 0.15, wave: 'triangle' }); },
    paper(t) { for (let i = 0; i < 4; i++) burst(seBus, t + i * 0.08, 0.1, { type: 'highpass', freq: 3000 + i * 500, vol: 0.12 }); }
  };
  function playSe(id) {
    init(); if (!ctx || !SE[id]) return;
    SE[id](ctx.currentTime + 0.01);
  }

  root.SOUND = { init: init, bgm: playBgm, stop: stopBgm, se: playSe, setVolume: setVolume, vol: vol };
})(this);
