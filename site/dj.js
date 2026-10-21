/* Sid's DJ booth: two decks, BPM detection, beat-matched auto-mix with an EQ bass swap.
   Music comes from the visitor's own device (files or a folder — played locally in this browser, never uploaded) or from
   demo grooves generated right here (original, so they are free to play). Each deck is an <audio> element routed through
   Web Audio (3-band EQ -> gain -> master); crossfades are scheduled on the audio clock so they also run in a background tab.
   Usage (room.js): import('./dj.js').then(m => m.initDJ({ avatar })) */
export function initDJ({ avatar }) {
  const css = document.createElement('style');
  css.textContent = `
  .dj-btn{position:fixed;right:16px;top:106px;z-index:60;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(12,14,20,.82);color:#e9ecf3;padding:9px 13px;border-radius:999px;font:600 12.5px/1 system-ui,sans-serif;backdrop-filter:blur(8px)}
  .dj-btn.on{border-color:#7ee0b3;color:#7ee0b3}
  .dj-panel{position:fixed;right:16px;top:150px;z-index:61;width:360px;max-width:calc(100vw - 32px);max-height:calc(100vh - 170px);overflow:auto;box-sizing:border-box;padding:14px;border-radius:16px;background:rgba(12,14,20,.94);color:#e9ecf3;border:1px solid rgba(255,255,255,.12);font:13px/1.4 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);display:none}
  .dj-panel.open{display:block}
  .dj-panel h3{margin:0 0 2px;font:700 15px/1.2 system-ui,sans-serif}
  .dj-panel .dj-sub{color:#8fa3b3;font-size:12px;margin:0 0 10px}
  .dj-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
  .dj-panel button,.dj-panel label.dj-pick{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#e9ecf3;padding:7px 11px;border-radius:999px;font:600 12px/1 system-ui,sans-serif}
  .dj-panel button.primary{background:#7ee0b3;border-color:#7ee0b3;color:#06140e}
  .dj-panel label.dj-pick input{display:none}
  .dj-x{position:absolute;right:10px;top:8px;background:none!important;border:none!important;font-size:18px!important;padding:4px!important}
  .dj-deck{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:8px 10px;margin:6px 0;background:rgba(255,255,255,.03)}
  .dj-deck.live{border-color:rgba(126,224,179,.5)}
  .dj-deck b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dj-deck small{color:#8fa3b3}
  .dj-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:6px;overflow:hidden}
  .dj-bar i{display:block;height:100%;width:0;background:#4aa8e0}
  .dj-list{margin:6px 0 0;padding:0;list-style:none;max-height:180px;overflow:auto}
  .dj-list li{display:flex;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer}
  .dj-list li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dj-list li small{color:#8fa3b3;flex:none;font-variant-numeric:tabular-nums}
  .dj-list li.now span{color:#7ee0b3}
  .dj-list li.next span{color:#ffc46b}
  .dj-panel input[type=range]{width:100%}
  .dj-note{color:#6f8494;font-size:11.5px;margin-top:8px}`;
  document.head.appendChild(css);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- UI ---------- */
  const btn = el('button', 'dj-btn', '🎧 DJ booth'); btn.type = 'button';
  const panel = el('div', 'dj-panel'), x = el('button', 'dj-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  const pickFiles = el('label', 'dj-pick'), fileIn = el('input'); fileIn.type = 'file'; fileIn.multiple = true; fileIn.accept = 'audio/*'; pickFiles.append('➕ Add songs', fileIn);
  const pickDir = el('label', 'dj-pick'), dirIn = el('input'); dirIn.type = 'file'; dirIn.multiple = true; dirIn.setAttribute('webkitdirectory', ''); pickDir.append('📁 Add a folder', dirIn);
  const demoBtn = el('button', null, '✨ Demo grooves'); demoBtn.type = 'button';
  const playBtn = el('button', 'primary', '▶ Play'), mixBtn = el('button', null, '⏭ Mix now'); playBtn.type = mixBtn.type = 'button';
  const autoLbl = el('label'), autoIn = el('input'); autoIn.type = 'checkbox'; autoIn.checked = true; autoLbl.append(autoIn, ' Auto-mix');
  const deckUI = [0, 1].map(i => { const d = el('div', 'dj-deck'), t = el('b', null, 'Deck ' + 'AB'[i] + ' — empty'), m = el('small', null, ''), bar = el('div', 'dj-bar'), fill = el('i'); bar.append(fill); d.append(t, m, bar); return { d, t, m, fill }; });
  const xfLbl = el('small', null, 'Crossfader'), xf = el('input'); xf.type = 'range'; xf.min = 0; xf.max = 1; xf.step = 0.01; xf.value = 0;
  const volLbl = el('small', null, 'Volume'), vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = 0.85;
  const list = el('ul', 'dj-list');
  const note = el('p', 'dj-note', 'Your songs play from your own device in this browser. Nothing is uploaded. Demo grooves are generated here.');
  const status = el('p', 'dj-sub', 'Add your songs or start the demo grooves.');
  const head = el('h3', null, "🎧 Sid's DJ booth");
  const row1 = el('div', 'dj-row'), row2 = el('div', 'dj-row');
  row1.append(pickFiles, pickDir, demoBtn); row2.append(playBtn, mixBtn, autoLbl);
  panel.append(x, head, status, row1, deckUI[0].d, deckUI[1].d, row2, xfLbl, xf, volLbl, vol, list, note);
  document.body.append(btn, panel);
  ['keydown', 'keyup', 'keypress', 'wheel', 'pointerdown'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  btn.onclick = () => panel.classList.toggle('open'); x.onclick = () => panel.classList.remove('open');

  /* ---------- audio graph ---------- */
  let ctx = null, master = null, analyser = null;
  const decks = [0, 1].map(i => { const a = new Audio(); a.preload = 'auto'; a.preservesPitch = true; return { i, el: a, track: null, gain: null, low: null, mid: null, high: null }; });
  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = +vol.value;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    for (const d of decks) {
      const src = ctx.createMediaElementSource(d.el);
      d.low = ctx.createBiquadFilter(); d.low.type = 'lowshelf'; d.low.frequency.value = 220;
      d.mid = ctx.createBiquadFilter(); d.mid.type = 'peaking'; d.mid.frequency.value = 1000; d.mid.Q.value = 0.8;
      d.high = ctx.createBiquadFilter(); d.high.type = 'highshelf'; d.high.frequency.value = 3500;
      d.gain = ctx.createGain(); d.gain.gain.value = 0;
      src.connect(d.low); d.low.connect(d.mid); d.mid.connect(d.high); d.high.connect(d.gain); d.gain.connect(master);
    }
  }
  vol.oninput = () => { if (master) master.gain.setTargetAtTime(+vol.value, ctx.currentTime, 0.05); };

  /* ---------- tracks ---------- */
  const tracks = []; let nowIdx = -1, nextIdx = -1;
  const fmt = (s) => !isFinite(s) ? '' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function renderList() {
    list.replaceChildren(...tracks.map((t, i) => {
      const li = el('li', i === nowIdx ? 'now' : i === nextIdx ? 'next' : ''), name = el('span', null, (i === nowIdx ? '▶ ' : i === nextIdx ? '⏭ ' : '') + t.title);
      li.append(name, el('small', null, t.bpm ? t.bpm.toFixed(1) + ' BPM' : t.analysing ? 'reading…' : '—'));
      li.title = i === nowIdx ? 'Playing' : 'Play this next'; li.onclick = () => { if (i !== nowIdx) { nextIdx = i; preloadNext(); renderList(); } };
      return li;
    }));
  }
  function addTrack(t) { tracks.push(t); if (nextIdx < 0 && nowIdx >= 0) nextIdx = tracks.length - 1; renderList(); return t; }
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i;
  async function addFiles(files) {
    const fresh = [...files].filter(f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of fresh) addTrack({ title: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f), file: f, bpm: null, firstBeat: 0, analysing: true });
    status.textContent = fresh.length ? `Added ${fresh.length} song${fresh.length > 1 ? 's' : ''}. Reading their tempo…` : 'No audio files found there.';
    for (const t of tracks.filter(t => t.analysing)) { await analyse(t); renderList(); }
    if (fresh.length) status.textContent = 'Ready. Press play.';
  }
  fileIn.onchange = () => { addFiles(fileIn.files); fileIn.value = ''; };
  dirIn.onchange = () => { addFiles(dirIn.files); dirIn.value = ''; };

  /* ---------- tempo + beat grid (offline: 11 kHz mono, kick-weighted onset envelope, autocorrelation, comb fine-tune) ---------- */
  async function analyse(t) {
    try {
      const buf = await (await fetch(t.url)).arrayBuffer();
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, SR = 11025;
      const audio = await new AC(1, SR, SR).decodeAudioData(buf);
      t.duration = audio.duration;
      const r = detectTempo(audio);
      if (r) { t.bpm = r.bpm; t.firstBeat = r.firstBeat; }
    } catch (e) { /* unreadable / unsupported: it still plays, it just crossfades without beat sync */ }
    t.analysing = false;
  }
  function detectTempo(audio) {
    const SR = audio.sampleRate, ch = audio.numberOfChannels, n = audio.length, HOP = 128, hopT = HOP / SR;
    const mono = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
    /* onset strength: rise in low-band (kick) energy plus a little full-band rise */
    const a = 1 - Math.exp(-2 * Math.PI * 160 / SR), frames = Math.floor(n / HOP), on = new Float32Array(frames);
    let lp = 0, pl = 1e-6, pa = 1e-6;
    for (let f = 0; f < frames; f++) {
      let el = 0, ea = 0; for (let i = f * HOP; i < (f + 1) * HOP; i++) { const v = mono[i]; lp += a * (v - lp); el += lp * lp; ea += v * v; }
      el += 1e-9; ea += 1e-9; on[f] = Math.max(0, Math.log(el / pl)) + 0.4 * Math.max(0, Math.log(ea / pa)); pl = el; pa = ea;
    }
    /* analyse up to 60 s from 15% in (skips quiet intros) */
    const f0 = Math.floor(frames * 0.15), f1 = Math.min(frames, f0 + Math.floor(60 / hopT)); if (f1 - f0 < 8 / hopT) return null;
    const seg = on.subarray(f0, f1), mean = seg.reduce((s, v) => s + v, 0) / seg.length;
    const lag = (bpm) => 60 / (bpm * hopT);
    const ac = (L) => { const l0 = Math.floor(L), fr = L - l0; let s = 0; for (let i = 0; i + l0 + 1 < seg.length; i++) s += (seg[i] - mean) * ((seg[i + l0] - mean) * (1 - fr) + (seg[i + l0 + 1] - mean) * fr); return s; };
    let best = 0, bestS = -Infinity;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) { const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 122) / 0.55, 2)), sc = (ac(lag(bpm)) + 0.5 * ac(lag(bpm) * 2)) * prior; if (sc > bestS) { bestS = sc; best = bpm; } }
    /* fine tune tempo + phase with a comb over the onset envelope */
    let fb = best, fph = 0, fs = -Infinity;
    for (let bpm = best - 1.5; bpm <= best + 1.5; bpm += 0.05) {
      const P = lag(bpm), beats = Math.floor((seg.length - 1) / P);
      for (let ph = 0; ph < P; ph += 1) { let s = 0; for (let k = 0; k < beats; k++) s += seg[Math.round(ph + k * P)] || 0; if (s > fs) { fs = s; fb = bpm; fph = ph; } }
    }
    const beatT = 60 / fb, t0 = (f0 + fph) * hopT;
    return { bpm: Math.round(fb * 10) / 10, firstBeat: ((t0 % beatT) + beatT) % beatT };
  }

  /* ---------- demo grooves: original 4/4 house loops rendered offline (DJ-friendly: 8-bar drum intro and outro) ---------- */
  const DEMOS = [
    { title: 'Demo groove · Night Drive', bpm: 122, root: 45, minor: true, seed: 1 },
    { title: 'Demo groove · Harbour Lights', bpm: 124, root: 41, minor: true, seed: 2 },
    { title: 'Demo groove · Kitsilano Sunrise', bpm: 126, root: 48, minor: false, seed: 3 },
  ];
  /* synthesised straight into a sample buffer (thousands of Web Audio nodes in an OfflineAudioContext took ~40 s) */
  async function renderGroove(g) {
    const SR = 22050, beat = 60 / g.bpm, bars = 40, N = Math.ceil(SR * (bars * 4 * beat + 1.5)), out = new Float32Array(N);
    let seed = g.seed * 9301 + 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 116640 - 1;
    const add = (t, len, fn) => { const i0 = Math.floor(t * SR), n = Math.min(N - i0, Math.floor(len * SR)); for (let i = 0; i < n; i++) out[i0 + i] += fn(i / SR); };
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12), k = (f) => 1 - Math.exp(-2 * Math.PI * f / SR);
    const kick = (t) => { let ph = 0; add(t, 0.42, (x) => { ph += 2 * Math.PI * (45 + 105 * Math.exp(-x / 0.03)) / SR; return Math.sin(ph) * Math.exp(-x / 0.12) * 0.95; }); };
    const hat = (t, len, lvl) => { let lp = 0; const c = k(6000); add(t, len, (x) => { const n = rnd(); lp += c * (n - lp); return (n - lp) * lvl * Math.exp(-x / (len / 4)); }); };
    const clap = (t) => { let p = 0, q = 0; const c1 = k(2600), c2 = k(700); add(t, 0.2, (x) => { const n = rnd(); p += c1 * (n - p); q += c2 * (p - q); return (p - q) * 1.4 * Math.exp(-x / 0.055); }); };
    const saw = (t, len, f, lvl, cut) => { let ph = 0, lp = 0; const c = k(cut); add(t, len, (x) => { ph += f / SR; ph -= Math.floor(ph); lp += c * ((2 * ph - 1) - lp); return lp * lvl * Math.min(1, x / 0.01) * Math.exp(-x / (len * 0.55)); }); };
    const scale = g.minor ? [0, 3, 5, 7, 10] : [0, 4, 5, 7, 9], prog = g.minor ? [0, -4, -2, -5] : [0, 5, -3, -5];
    for (let bar = 0; bar < bars; bar++) {
      const t0 = bar * 4 * beat, body = bar >= 8 && bar < bars - 8, full = bar >= 16 && bar < bars - 8, chord = prog[Math.floor(bar / 2) % 4];
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat; kick(t); hat(t + beat / 2, 0.07, 0.35);
        if (body && (b === 1 || b === 3)) clap(t);
        if (full) hat(t + beat * 0.25, 0.03, 0.12);
        if (body) saw(t + beat / 2, beat * 0.45, hz(g.root - 12 + chord + (b === 3 ? scale[(b + g.seed) % scale.length] : 0)), 0.45, 420);
      }
      if (full && bar % 2 === 0) [0, g.minor ? 3 : 4, 7].forEach((iv, j) => saw(t0, 8 * beat * 0.95, hz(g.root + 12 + chord + iv) * (1 + (j - 1) * 0.003), 0.07, 1300));
    }
    let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i])); const gain = 0.9 / (peak || 1); for (let i = 0; i < N; i++) out[i] *= gain;
    return URL.createObjectURL(new Blob([wav(out, SR)], { type: 'audio/wav' }));
  }
  function wav(d, sr) {
    const n = d.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    return b;
  }
  let demosAdded = false;
  demoBtn.onclick = async () => {
    if (demosAdded) return; demosAdded = true; demoBtn.disabled = true; status.textContent = 'Making the demo grooves…';
    for (const g of DEMOS) addTrack({ title: g.title, url: await renderGroove(g), bpm: g.bpm, firstBeat: 0, analysing: false });
    status.textContent = 'Demo grooves ready. Press play.'; renderList();
  };

  /* ---------- playback + mixing ---------- */
  let cur = 0, playing = false, mixing = null, rateEase = null;
  const other = () => 1 - cur;
  const beatLen = (t) => 60 / t.bpm;
  const phaseOf = (d) => (d.track && d.track.bpm) ? ((((d.el.currentTime - d.track.firstBeat) / beatLen(d.track)) % 1) + 1) % 1 : 0;
  function load(d, idx) { const t = tracks[idx]; d.track = t; d.idx = idx; d.el.src = t.url; d.el.playbackRate = 1; d.el.load(); }
  function pickNext() { if (!tracks.length) return -1; if (nextIdx >= 0 && nextIdx !== nowIdx) return nextIdx; return tracks.length > 1 ? (nowIdx + 1) % tracks.length : -1; }
  function preloadNext() { const i = pickNext(); nextIdx = i; const d = decks[other()]; if (i >= 0 && !mixing && d.idx !== i) load(d, i); }
  function resetEQ(d) { const t = ctx.currentTime; for (const f of [d.low, d.mid, d.high]) { f.gain.cancelScheduledValues(t); f.gain.setValueAtTime(0, t); } }
  function start() {
    if (!tracks.length) { status.textContent = 'Add songs or the demo grooves first.'; return; }
    ensureCtx();
    if (!playing && nowIdx >= 0 && decks[cur].track) {   // resume
      decks[cur].el.play(); if (mixing) decks[other()].el.play(); playing = true; onPlayState(); return;
    }
    nowIdx = nowIdx >= 0 ? nowIdx : 0; const d = decks[cur]; load(d, nowIdx); resetEQ(d);
    d.gain.gain.cancelScheduledValues(ctx.currentTime); d.gain.gain.setValueAtTime(1, ctx.currentTime);
    d.el.play().catch(() => {}); playing = true; nextIdx = -1; preloadNext(); onPlayState(); renderList();
  }
  function pause() { playing = false; for (const d of decks) d.el.pause(); onPlayState(); }
  playBtn.onclick = () => (playing ? pause() : start());
  mixBtn.onclick = () => { if (playing && !mixing) startMix(true); };

  function startMix(now) {
    const a = decks[cur], b = decks[other()], i = pickNext(); if (i < 0 || !ctx) return;
    if (b.idx !== i) load(b, i);
    const ta = a.track, tb = b.track, synced = !!(ta.bpm && tb.bpm);
    let rate = 1;
    if (synced) rate = (ta.bpm * a.el.playbackRate) / tb.bpm;
    const sync = synced && rate >= 0.92 && rate <= 1.08;       // more than ±8% sounds wrong: just crossfade, no beat sync
    if (!sync) rate = 1;
    const realBeat = synced ? beatLen(ta) / a.el.playbackRate : 0.5;
    const D = synced ? 16 * realBeat : 8;                      // 16 beats (4 bars) of overlap
    const toBeat = sync ? (1 - phaseOf(a)) * realBeat : 0.05;
    b.el.playbackRate = rate; b.el.currentTime = tb.bpm ? tb.firstBeat : 0;
    const T = ctx.currentTime + toBeat, g = (p, v, t) => { p.cancelScheduledValues(ctx.currentTime); p.setValueAtTime(p.value, ctx.currentTime); p.setValueAtTime(v, t); };
    resetEQ(b);
    g(b.gain.gain, 0, T); b.gain.gain.linearRampToValueAtTime(1, T + D * 0.5);
    b.low.gain.setValueAtTime(-26, ctx.currentTime); b.low.gain.setValueAtTime(-26, T + D * 0.5); b.low.gain.linearRampToValueAtTime(0, T + D * 0.56);   // bass swap at the halfway point
    a.low.gain.cancelScheduledValues(ctx.currentTime); a.low.gain.setValueAtTime(0, T + D * 0.5); a.low.gain.linearRampToValueAtTime(-26, T + D * 0.56);
    g(a.gain.gain, 1, T + D * 0.5); a.gain.gain.linearRampToValueAtTime(0, T + D);
    setTimeout(() => { if (playing) b.el.play().catch(() => {}); }, Math.max(0, toBeat * 1000 - 25));
    mixing = { a, b, mid: T + D * 0.5, end: T + D, sync, rate };
    nextIdx = -1; status.textContent = `Mixing into “${tb.title}”${sync ? ` · beat-matched${rate !== 1 ? `, tempo ${rate > 1 ? '+' : ''}${(rate * 100 - 100).toFixed(1)}%` : ''}` : ''}`;
    if (avatar && avatar.play && !window.__dj) avatar.play('reach');   // at the DJ corner the right hand goes to the mixer instead
  }
  function endMix() {
    const { a, b, rate } = mixing; a.el.pause(); resetEQ(a); a.gain.gain.cancelScheduledValues(ctx.currentTime); a.gain.gain.setValueAtTime(0, ctx.currentTime);
    cur = b.i; nowIdx = b.idx; mixing = null;
    if (rate !== 1) rateEase = { d: b, from: b.el.playbackRate, t0: performance.now(), dur: 20000 };   // drift back to its own tempo over ~20 s
    status.textContent = `Now playing “${b.track.title}”`; preloadNext(); renderList();
  }
  /* control loop: keep the incoming deck's beats on the outgoing deck's beats, trigger auto-mixes, update the UI */
  setInterval(() => {
    if (!ctx || !playing) return draw();
    const a = decks[cur];
    if (mixing) {
      if (mixing.sync && !mixing.b.el.paused) { let e = phaseOf(mixing.b) - phaseOf(mixing.a); e -= Math.round(e); mixing.b.el.playbackRate = mixing.rate * (1 - Math.max(-0.5, Math.min(0.5, e)) * 0.08); }
      if (ctx.currentTime >= mixing.end) endMix();
    } else {
      if (rateEase) { const k = Math.min(1, (performance.now() - rateEase.t0) / rateEase.dur); rateEase.d.el.playbackRate = rateEase.from + (1 - rateEase.from) * k; if (k >= 1) rateEase = null; }
      const left = (a.el.duration || 0) - a.el.currentTime, realBeat = a.track && a.track.bpm ? beatLen(a.track) / a.el.playbackRate : 0.5;
      if (autoIn.checked && isFinite(left) && left > 0 && left < (a.track && a.track.bpm ? 16 * realBeat : 8) + 3 && pickNext() >= 0) startMix();
      else if (a.el.ended) { if (pickNext() >= 0) { const i = pickNext(); cur = other(); nowIdx = i; start(); } else pause(); }
    }
    draw();
  }, 50);
  /* manual crossfader (when auto-mix is off it is the only thing that moves the gains) */
  xf.oninput = () => {
    if (!ctx || mixing) return; const v = +xf.value, A = decks[0], B = decks[1];
    A.gain.gain.setTargetAtTime(Math.cos(v * Math.PI / 2), ctx.currentTime, 0.03); B.gain.gain.setTargetAtTime(Math.sin(v * Math.PI / 2), ctx.currentTime, 0.03);
    if (v > 0.02 && B.track && B.el.paused && playing) B.el.play(); if (v < 0.98 && A.track && A.el.paused && playing) A.el.play();
  };
  function draw() {
    decks.forEach((d, i) => {
      const u = deckUI[i], t = d.track; u.d.classList.toggle('live', playing && !d.el.paused);
      u.t.textContent = 'Deck ' + 'AB'[i] + ' — ' + (t ? t.title : 'empty');
      u.m.textContent = t ? `${t.bpm ? (t.bpm * d.el.playbackRate).toFixed(1) + ' BPM' : 'tempo unknown'} · ${fmt(d.el.currentTime)} / ${fmt(d.el.duration)}` : '';
      u.fill.style.width = (d.el.duration ? (d.el.currentTime / d.el.duration) * 100 : 0) + '%';
    });
    playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
    if (!mixing && ctx && autoIn.checked) xf.value = cur;
  }

  /* ---------- the avatar: sits at the desk and nods to the beat while the music plays ---------- */
  const level = new Uint8Array(256);
  function groove() {
    if (!playing || !analyser) return null;
    analyser.getByteFrequencyData(level); let lo = 0; for (let i = 1; i < 8; i++) lo += level[i]; lo /= 7 * 255;
    const d = mixing ? (ctx.currentTime > mixing.mid ? mixing.b : mixing.a) : decks[cur];
    return { mixing: !!mixing, amp: Math.min(1, 0.5 + 0.5 * lo), phase: d.track && d.track.bpm ? phaseOf(d) : (performance.now() / 500) % 1 };
  }
  function onPlayState() {
    btn.classList.toggle('on', playing);
    if (!avatar) return;
    const rig = window.__dj;
    if (playing) { if (avatar.hold) avatar.hold(1e7); if (rig && rig.stand && avatar.djStand) avatar.djStand(rig.stand); else if (avatar.type) avatar.type(); if (avatar.groove) avatar.groove(groove); if (avatar.say) avatar.say(pickLine(), 3); }
    else { if (avatar.groove) avatar.groove(null); if (avatar.djStand) avatar.djStand(null); if (avatar.hold) avatar.hold(4); }
  }
  const pickLine = () => ['Let’s go 🎧', 'Turning it up 🔊', 'This one’s a vibe'][Math.floor(Math.random() * 3)];

  /* ---------- the DJ corner moves with the music (objects from the designer's dj-corner glb, see blender/README_DJ.md) ---------- */
  let rigLast = performance.now(); const jogAng = [0, 0], qY = (a) => { rigQ.setFromAxisAngle(rigAxis, a); return rigQ; };
  let rigQ = null, rigAxis = null, rigV = null;
  function rigTick(t) {
    requestAnimationFrame(rigTick);
    const R = window.__dj, dt = Math.min(0.1, (t - rigLast) / 1000); rigLast = t; if (!R || !R.jogL) return;
    if (!rigQ) { rigQ = R.jogL.quaternion.clone(); rigAxis = R.jogL.up.clone().set(0, 1, 0); rigV = R.jogL.position.clone(); }
    const g = groove(), beat = g ? g.amp * Math.exp(-9 * g.phase) : 0;
    [R.jogL, R.jogR].forEach((jog, i) => {
      const d = decks[i]; if (!jog) return;
      if (ctx && playing && !d.el.paused) jogAng[i] -= dt * 2 * Math.PI * 0.555 * d.el.playbackRate;   // 33⅓ rpm platter, clockwise
      jog.quaternion.copy(jog.userData.restQuat).multiply(qY(jogAng[i]));
    });
    const slide = (o, x, y, z) => { if (o) o.position.copy(o.userData.restPos).add(rigV.set(x, y, z).applyQuaternion(o.quaternion)); };
    const gA = decks[0].gain ? decks[0].gain.gain.value : 0, gB = decks[1].gain ? decks[1].gain.gain.value : 0;
    slide(R.fader1, 0, 0, (0.5 - (playing ? gA : 0)) * 0.056); slide(R.fader2, 0, 0, (0.5 - (playing ? gB : 0)) * 0.056);   // -Z = up
    slide(R.xfader, ((gB + 1e-6) / (gA + gB + 2e-6) - 0.5) * 0.052, 0, 0);
    slide(R.coneL, 0, 0.0028 * beat, 0); slide(R.coneR, 0, 0.0028 * beat, 0);
    if (R.light) R.light.intensity = playing ? 0.9 + 1.4 * beat : 1.4;
  }
  requestAnimationFrame(rigTick);

  const api = { addFiles, start, pause, mixNow: () => mixBtn.onclick(), state: () => ({ playing, mixing: !!mixing, cur, nowIdx, nextIdx, tracks: tracks.map(t => ({ title: t.title, bpm: t.bpm, firstBeat: t.firstBeat })) }), _detect: detectTempo, _render: renderGroove, _demos: DEMOS, _debug: () => ({ decks, phaseOf, ctx, mixing, rigTick }) };
  window.__djBooth = api; return api;
}
