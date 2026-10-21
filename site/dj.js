/* Sid's DJ booth.
   Two decks, each an <audio> element routed through Web Audio (3-band EQ -> high-pass -> loudness trim -> fader, plus a
   beat-synced echo send). Every track is analysed once: tempo + beat grid, downbeat, 8-bar phrases, where its outro
   starts, and how loud it is. The auto-mixer then works like a DJ: it brings the next track in on a phrase boundary at
   the start of the outgoing track's outro, beat-matched, with an EQ blend (highs in early, bass swap at the halfway point);
   when two tempos are too far apart it echoes the old track out and drops the new one in on the downbeat.
   Music comes from the visitor's own device (files or a folder — played locally in this browser, never uploaded) or from
   demo grooves generated right here (original, so they are free to play). Gain changes are scheduled on the audio clock so
   transitions also run in a background tab.
   Usage (room.js): import('./dj.js').then(m => m.initDJ({ avatar })) */
export function initDJ({ avatar }) {
  const css = document.createElement('style');
  css.textContent = `
  .dj-btn{position:fixed;right:16px;top:106px;z-index:60;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(12,14,20,.82);color:#e9ecf3;padding:9px 13px;border-radius:999px;font:600 12.5px/1 system-ui,sans-serif;backdrop-filter:blur(8px)}
  .dj-btn.on{border-color:#7ee0b3;color:#7ee0b3}
  .dj-panel{position:fixed;right:16px;top:150px;z-index:61;width:340px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:0 14px 12px;border-radius:16px;background:rgba(12,14,20,.92);color:#e9ecf3;border:1px solid rgba(255,255,255,.12);font:13px/1.4 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);display:none;backdrop-filter:blur(10px)}
  .dj-panel.open{display:block}
  .dj-head{display:flex;align-items:center;gap:6px;margin:0 -14px 8px;padding:10px 10px 8px 14px;cursor:grab;touch-action:none;user-select:none;border-bottom:1px solid rgba(255,255,255,.06)}
  .dj-head:active{cursor:grabbing}
  .dj-head h3{flex:1;margin:0;font:700 14px/1.2 system-ui,sans-serif}
  .dj-head small{color:#6f8494;font-size:11px}
  .dj-icon{background:none!important;border:none!important;color:#cfd8e0!important;font-size:16px!important;padding:2px 6px!important;cursor:pointer}
  .dj-sub{color:#8fa3b3;font-size:12px;margin:0 0 8px}
  .dj-steps{margin:0 0 8px;padding:8px 10px;border-radius:12px;background:rgba(74,168,224,.08);color:#cfe3f1;font-size:12px}
  .dj-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
  .dj-panel button,.dj-panel label.dj-pick{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#e9ecf3;padding:7px 11px;border-radius:999px;font:600 12px/1 system-ui,sans-serif}
  .dj-panel button.primary{background:#7ee0b3;border-color:#7ee0b3;color:#06140e}
  .dj-panel button.big{flex:1;padding:11px 14px;font-size:14px}
  .dj-panel label.dj-pick input{display:none}
  .dj-deck{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:7px 10px;margin:6px 0;background:rgba(255,255,255,.03)}
  .dj-deck.live{border-color:rgba(126,224,179,.5)}
  .dj-deck b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
  .dj-deck small{color:#8fa3b3}
  .dj-bar{position:relative;height:4px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:6px;overflow:hidden}
  .dj-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:#4aa8e0}
  .dj-bar u{position:absolute;top:0;bottom:0;width:2px;background:#ffc46b;opacity:.9}
  .dj-list{margin:6px 0 0;padding:0;list-style:none;max-height:170px;overflow:auto}
  .dj-list li{display:flex;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer}
  .dj-list li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dj-list li small{color:#8fa3b3;flex:none;font-variant-numeric:tabular-nums}
  .dj-list li.now span{color:#7ee0b3}
  .dj-list li.next span{color:#ffc46b}
  .dj-panel input[type=range]{width:100%}
  .dj-panel details{margin-top:6px;color:#8fa3b3}
  .dj-panel summary{cursor:pointer;font-size:12px}
  .dj-note{color:#6f8494;font-size:11.5px;margin:8px 0 0}
  .dj-panel.mini{width:auto;max-width:calc(100vw - 32px);padding:0 10px 0 14px;overflow:hidden}
  .dj-panel.mini .dj-body{display:none}
  .dj-panel.mini .dj-head{margin:0 -10px 0 -14px;border-bottom:none}
  .dj-panel:not(.mini) .dj-minictl{display:none}
  .dj-minictl{display:flex;gap:4px}`;
  document.head.appendChild(css);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  /* ---------- UI ---------- */
  const btn = el('button', 'dj-btn', '🎧 DJ booth'); btn.type = 'button';
  const panel = el('div', 'dj-panel'), head = el('div', 'dj-head'), title = el('h3', null, "🎧 Sid's DJ booth");
  const miniPlay = el('button', 'dj-icon', '▶'), miniNext = el('button', 'dj-icon', '⏭'), miniCtl = el('div', 'dj-minictl'); miniCtl.append(miniPlay, miniNext);
  const minBtn = el('button', 'dj-icon', '▁'), x = el('button', 'dj-icon', '×');
  [miniPlay, miniNext, minBtn, x].forEach(b => { b.type = 'button'; }); minBtn.title = 'Make it small'; x.title = 'Close'; miniPlay.title = 'Play / pause'; miniNext.title = 'Mix into the next song';
  head.append(title, miniCtl, minBtn, x); head.title = 'Drag me anywhere';
  const body = el('div', 'dj-body');
  const steps = el('div', 'dj-steps', '1 · Add your songs (or try the demo grooves)   2 · Press “Start the party”. Sid orders them by tempo and mixes them for you.');
  const pickFiles = el('label', 'dj-pick'), fileIn = el('input'); fileIn.type = 'file'; fileIn.multiple = true; fileIn.accept = 'audio/*'; pickFiles.append('➕ Add songs', fileIn);
  const pickDir = el('label', 'dj-pick'), dirIn = el('input'); dirIn.type = 'file'; dirIn.multiple = true; dirIn.setAttribute('webkitdirectory', ''); pickDir.append('📁 Add a folder', dirIn);
  const demoBtn = el('button', null, '✨ Demo grooves'); demoBtn.type = 'button';
  const partyBtn = el('button', 'primary big', '🎉 Start the party'), mixBtn = el('button', null, '⏭ Mix now'); partyBtn.type = mixBtn.type = 'button';
  const status = el('p', 'dj-sub', 'Add songs to begin.');
  const deckUI = [0, 1].map(i => { const d = el('div', 'dj-deck'), t = el('b', null, 'Deck ' + 'AB'[i] + ' — empty'), m = el('small', null, ''), bar = el('div', 'dj-bar'), fill = el('i'), cue = el('u'); cue.style.display = 'none'; bar.append(fill, cue); d.append(t, m, bar); return { d, t, m, fill, cue }; });
  const volLbl = el('small', null, 'Volume'), vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = 0.85;
  const manual = el('details'), sum = el('summary', null, 'Manual controls');
  const autoLbl = el('label'), autoIn = el('input'); autoIn.type = 'checkbox'; autoIn.checked = true; autoLbl.append(autoIn, ' Auto-mix');
  const xfLbl = el('small', null, 'Crossfader (when auto-mix is off)'), xf = el('input'); xf.type = 'range'; xf.min = 0; xf.max = 1; xf.step = 0.01; xf.value = 0;
  const orderBtn = el('button', null, '↕ Order by tempo'); orderBtn.type = 'button';
  const mrow = el('div', 'dj-row'); mrow.append(autoLbl, orderBtn); manual.append(sum, mrow, xfLbl, xf);
  const list = el('ul', 'dj-list');
  const note = el('p', 'dj-note', 'Your songs play from your own device in this browser. Nothing is uploaded. Demo grooves are generated here.');
  const row1 = el('div', 'dj-row'), row2 = el('div', 'dj-row');
  row1.append(pickFiles, pickDir, demoBtn); row2.append(partyBtn, mixBtn);
  body.append(steps, row1, row2, status, deckUI[0].d, deckUI[1].d, volLbl, vol, manual, list, note);
  panel.append(head, body); document.body.append(btn, panel);
  ['keydown', 'keyup', 'keypress', 'wheel', 'pointerdown'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  btn.onclick = () => { panel.classList.toggle('open'); place(); };
  x.onclick = () => panel.classList.remove('open');
  minBtn.onclick = () => { panel.classList.toggle('mini'); minBtn.textContent = panel.classList.contains('mini') ? '▢' : '▁'; store.set('dj.mini', panel.classList.contains('mini')); place(); };
  if (store.get('dj.mini')) { panel.classList.add('mini'); minBtn.textContent = '▢'; }

  /* drag the booth anywhere by its header (mouse or touch); remembered per browser */
  let pos = store.get('dj.pos');
  function place() {
    if (!pos) return; const r = panel.getBoundingClientRect(), w = r.width || 340, h = r.height || 60;
    const left = Math.max(8, Math.min(innerWidth - w - 8, pos.x)), top = Math.max(8, Math.min(innerHeight - Math.min(h, 120) - 8, pos.y));
    panel.style.left = left + 'px'; panel.style.top = top + 'px'; panel.style.right = 'auto';
  }
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; try { head.setPointerCapture(e.pointerId); } catch (err) {}
    const move = (ev) => { pos = { x: ev.clientX - dx, y: ev.clientY - dy }; place(); };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); store.set('dj.pos', pos); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  });
  addEventListener('resize', place); place();

  /* ---------- audio graph ---------- */
  let ctx = null, master = null, analyser = null;
  const decks = [0, 1].map(i => { const a = new Audio(); a.preload = 'auto'; a.preservesPitch = true; return { i, el: a, track: null, idx: -1 }; });
  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = +vol.value;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    for (const d of decks) {
      const src = ctx.createMediaElementSource(d.el), f = (type, freq, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; if (q) n.Q.value = q; return n; };
      d.low = f('lowshelf', 220); d.mid = f('peaking', 1000, 0.8); d.high = f('highshelf', 3500); d.hp = f('highpass', 10, 0.7);
      d.trim = ctx.createGain(); d.gain = ctx.createGain(); d.gain.gain.value = 0;
      d.send = ctx.createGain(); d.send.gain.value = 0; d.delay = ctx.createDelay(2); d.fb = ctx.createGain(); d.fb.gain.value = 0.45;
      src.connect(d.low); d.low.connect(d.mid); d.mid.connect(d.high); d.high.connect(d.hp); d.hp.connect(d.trim); d.trim.connect(d.gain); d.gain.connect(master);
      d.trim.connect(d.send); d.send.connect(d.delay); d.delay.connect(d.fb); d.fb.connect(d.delay); d.delay.connect(master);   // echo send (pre-fader, so the tail outlives the fade)
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
    steps.style.display = tracks.length ? 'none' : '';
  }
  function addTrack(t) { tracks.push(t); renderList(); return t; }
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i;
  let reading = 0;
  async function addFiles(files) {
    const fresh = [...files].filter(f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of fresh) addTrack({ title: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f), file: f, bpm: null, firstBeat: 0, analysing: true });
    if (!fresh.length) { status.textContent = 'No audio files found there.'; return; }
    reading += fresh.length; status.textContent = `Reading ${reading} song${reading > 1 ? 's' : ''} (tempo, beats, phrases)…`;
    for (const t of tracks.filter(t => t.analysing)) { await analyse(t); reading = Math.max(0, reading - 1); renderList(); if (reading) status.textContent = `Reading ${reading} more…`; }
    if (!reading) status.textContent = playing ? status.textContent : 'Ready. Press “Start the party”.';
  }
  fileIn.onchange = () => { addFiles(fileIn.files); fileIn.value = ''; };
  dirIn.onchange = () => { addFiles(dirIn.files); dirIn.value = ''; };

  /* ---------- analysis (offline, 11 kHz mono): tempo, beat grid, downbeat, phrases, outro, loudness ---------- */
  async function analyse(t) {
    try {
      const buf = await (await fetch(t.url)).arrayBuffer();
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, SR = 11025;
      const audio = await new AC(1, SR, SR).decodeAudioData(buf);
      t.duration = audio.duration;
      Object.assign(t, analyseAudio(audio) || {});
    } catch (e) { /* unreadable / unsupported: it still plays, it just crossfades without beat sync */ }
    t.analysing = false;
  }
  function analyseAudio(audio) {
    const SR = audio.sampleRate, ch = audio.numberOfChannels, n = audio.length, HOP = 128, hopT = HOP / SR;
    const mono = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / ch; }
    /* onset strength: rise in low-band (kick) energy plus a little full-band rise */
    const a = 1 - Math.exp(-2 * Math.PI * 160 / SR), frames = Math.floor(n / HOP), on = new Float32Array(frames), en = new Float32Array(frames);
    let lp = 0, pl = 1e-6, pa = 1e-6;
    for (let f = 0; f < frames; f++) {
      let el = 0, ea = 0; for (let i = f * HOP; i < (f + 1) * HOP; i++) { const v = mono[i]; lp += a * (v - lp); el += lp * lp; ea += v * v; }
      en[f] = ea / HOP; el += 1e-9; ea += 1e-9; on[f] = Math.max(0, Math.log(el / pl)) + 0.4 * Math.max(0, Math.log(ea / pa)); pl = el; pa = ea;
    }
    /* tempo: analyse up to 60 s from 15% in (skips quiet intros) */
    const f0 = Math.floor(frames * 0.15), f1 = Math.min(frames, f0 + Math.floor(60 / hopT)); if (f1 - f0 < 8 / hopT) return null;
    const seg = on.subarray(f0, f1), mean = seg.reduce((s, v) => s + v, 0) / seg.length;
    const lag = (bpm) => 60 / (bpm * hopT);
    const ac = (L) => { const l0 = Math.floor(L), fr = L - l0; let s = 0; for (let i = 0; i + l0 + 1 < seg.length; i++) s += (seg[i] - mean) * ((seg[i + l0] - mean) * (1 - fr) + (seg[i + l0 + 1] - mean) * fr); return s; };
    let best = 0, bestS = -Infinity;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) { const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 122) / 0.55, 2)), sc = (ac(lag(bpm)) + 0.5 * ac(lag(bpm) * 2)) * prior; if (sc > bestS) { bestS = sc; best = bpm; } }
    let fb = best, fph = 0, fs = -Infinity;   // fine tune tempo + phase with a comb over the onset envelope
    for (let bpm = best - 1.5; bpm <= best + 1.5; bpm += 0.05) {
      const P = lag(bpm), beats = Math.floor((seg.length - 1) / P);
      for (let ph = 0; ph < P; ph += 1) { let s = 0; for (let k = 0; k < beats; k++) s += seg[Math.round(ph + k * P)] || 0; if (s > fs) { fs = s; fb = bpm; fph = ph; } }
    }
    const bpm = Math.round(fb * 10) / 10, beatT = 60 / bpm, t0 = (f0 + fph) * hopT, firstBeat = ((t0 % beatT) + beatT) % beatT;
    /* per-beat energy and onset, over the whole track */
    const nB = Math.max(0, Math.floor((audio.duration - firstBeat) / beatT)), E = new Float32Array(nB), O = new Float32Array(nB);
    for (let k = 0; k < nB; k++) {
      const fa = Math.floor((firstBeat + k * beatT) / hopT), fz = Math.min(frames, Math.floor((firstBeat + (k + 1) * beatT) / hopT)); let s = 0, m = 0;
      for (let f = fa; f < fz; f++) s += en[f]; E[k] = s / Math.max(1, fz - fa);
      for (let f = Math.max(0, fa - 2); f <= Math.min(frames - 1, fa + 2); f++) m = Math.max(m, on[f]); O[k] = m;
    }
    /* downbeat: the beat of the bar with the strongest hits; phrase: the 8-bar boundary where the energy changes most */
    let down = 0, ds = -1; for (let o = 0; o < 4; o++) { let s = 0, c = 0; for (let k = o; k < nB; k += 4) { s += O[k]; c++; } if (c && s / c > ds) { ds = s / c; down = o; } }
    const nBar = Math.floor((nB - down) / 4), barE = new Float32Array(nBar); for (let b = 0; b < nBar; b++) barE[b] = (E[down + 4 * b] + E[down + 4 * b + 1] + E[down + 4 * b + 2] + E[down + 4 * b + 3]) / 4;
    let ph = 0, pbest = -1; for (let p = 0; p < 8; p++) { let s = 0, c = 0; for (let b = p + 8; b < nBar; b += 8) { s += Math.abs(barE[b] - barE[b - 1]) + 0.5 * Math.abs(barE[b] - barE[b - 2]); c++; } if (c && s / c > pbest) { pbest = s / c; ph = p; } }
    const phrase0 = (down + 4 * ph) % 32;                              // beat index of a phrase start
    const sorted = Array.from(barE).sort((u, v) => u - v), body = sorted[Math.floor(sorted.length * 0.6)] || 1e-9;
    /* outro: the earliest phrase start in the second half after which the track never gets back to its body level */
    let outro = -1;
    for (let s = phrase0; s < nB; s += 32) {
      if (s < nB * 0.5) continue; const b0 = Math.floor((s - down) / 4); let peak = 0; for (let b = b0; b < nBar; b++) peak = Math.max(peak, barE[b]);
      if (peak < 0.75 * body) { outro = s; break; }
    }
    let lastFit = phrase0; while (lastFit + 64 <= nB) lastFit += 32;   // the last phrase start that still leaves a full 32-beat mix
    if (outro < 0 || outro + 16 > nB) outro = lastFit;
    outro = Math.max(outro, nB - 96, phrase0);                       // never mix out more than ~96 beats before the end
    outro = phrase0 + Math.round((outro - phrase0) / 32) * 32; if (outro + 16 > nB) outro -= 32;
    let rs = 0, rc = 0; for (let b = 0; b < nBar; b++) if (barE[b] >= body * 0.5) { rs += barE[b]; rc++; }
    return { bpm, firstBeat, beats: nB, downbeat: down, phrase0, intro: phrase0, outro: Math.max(0, outro), rms: Math.sqrt(rc ? rs / rc : body) };
  }

  /* ---------- demo grooves: original 4/4 house loops (8-bar drum intro and outro), synthesised straight into a buffer ---------- */
  const DEMOS = [
    { title: 'Demo groove · Night Drive', bpm: 122, root: 45, minor: true, seed: 1 },
    { title: 'Demo groove · Harbour Lights', bpm: 124, root: 41, minor: true, seed: 2 },
    { title: 'Demo groove · Kitsilano Sunrise', bpm: 126, root: 48, minor: false, seed: 3 },
  ];
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
      const t0 = bar * 4 * beat, bodyBar = bar >= 8 && bar < bars - 8, full = bar >= 16 && bar < bars - 8, chord = prog[Math.floor(bar / 2) % 4];
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat; kick(t); hat(t + beat / 2, 0.07, 0.35);
        if (bodyBar && (b === 1 || b === 3)) clap(t);
        if (full) hat(t + beat * 0.25, 0.03, 0.12);
        if (bodyBar) saw(t + beat / 2, beat * 0.45, hz(g.root - 12 + chord + (b === 3 ? scale[(b + g.seed) % scale.length] : 0)), 0.45, 420);
      }
      if (full && bar % 2 === 0) [0, g.minor ? 3 : 4, 7].forEach((iv, j) => saw(t0, 8 * beat * 0.95, hz(g.root + 12 + chord + iv) * (1 + (j - 1) * 0.003), 0.07, 1300));
    }
    let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i])); const gain = 0.9 / (peak || 1); let ss = 0; for (let i = 0; i < N; i++) { out[i] *= gain; ss += out[i] * out[i]; }
    return { url: URL.createObjectURL(new Blob([wav(out, SR)], { type: 'audio/wav' })), rms: Math.sqrt(ss / N), beats: bars * 4, duration: N / SR };
  }
  function wav(d, sr) {
    const n = d.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    return b;
  }
  let demosAdded = false;
  async function addDemos() {
    if (demosAdded) return; demosAdded = true; demoBtn.disabled = true; status.textContent = 'Making the demo grooves…';
    for (const g of DEMOS) { const r = await renderGroove(g); addTrack({ title: g.title, url: r.url, bpm: g.bpm, firstBeat: 0, beats: r.beats, downbeat: 0, phrase0: 0, intro: 0, outro: r.beats - 32, rms: r.rms, duration: r.duration, analysing: false }); }
    status.textContent = 'Demo grooves ready.';
  }
  demoBtn.onclick = addDemos;

  /* ---------- set order: tempo climbs gently through the set (warm-up -> peak); unknown tempos go last ---------- */
  function orderByTempo() {
    const now = nowIdx >= 0 ? tracks[nowIdx] : null, next = nextIdx >= 0 ? tracks[nextIdx] : null;
    tracks.sort((p, q) => (p.bpm || 1e9) - (q.bpm || 1e9));
    nowIdx = now ? tracks.indexOf(now) : -1; nextIdx = next ? tracks.indexOf(next) : -1; renderList();
  }
  orderBtn.onclick = () => { orderByTempo(); if (playing) preloadNext(true); };

  /* ---------- playback ---------- */
  let cur = 0, playing = false, mixing = null, rateEase = null;
  const other = () => 1 - cur;
  const beatLen = (t) => 60 / t.bpm;
  const beatAt = (d) => (d.el.currentTime - d.track.firstBeat) / beatLen(d.track);
  const phaseOf = (d) => (d.track && d.track.bpm) ? ((beatAt(d) % 1) + 1) % 1 : 0;
  const trimFor = (t) => t.rms ? Math.max(0.4, Math.min(2.2, 0.16 / t.rms)) : 1;   // loudness match between songs
  function load(d, idx) { const t = tracks[idx]; d.track = t; d.idx = idx; d.el.src = t.url; d.el.playbackRate = 1; d.el.load(); if (d.trim) d.trim.gain.value = trimFor(t); }
  function pickNext() { if (!tracks.length) return -1; if (nextIdx >= 0 && nextIdx !== nowIdx) return nextIdx; return tracks.length > 1 ? (nowIdx + 1) % tracks.length : -1; }
  function preloadNext(force) { const i = pickNext(); nextIdx = i; const d = decks[other()]; if (i >= 0 && !mixing && (force || d.idx !== i)) load(d, i); renderList(); }
  function resetDeck(d) {
    const t = ctx.currentTime;
    for (const f of [d.low, d.mid, d.high]) { f.gain.cancelScheduledValues(t); f.gain.setValueAtTime(0, t); }
    d.hp.frequency.cancelScheduledValues(t); d.hp.frequency.setValueAtTime(10, t);
    d.send.gain.cancelScheduledValues(t); d.send.gain.setValueAtTime(0, t);
  }
  function start() {
    if (!tracks.length) { status.textContent = 'Add songs or the demo grooves first.'; return; }
    ensureCtx();
    if (!playing && nowIdx >= 0 && decks[cur].track) { decks[cur].el.play(); if (mixing) decks[other()].el.play(); playing = true; onPlayState(); return; }   // resume
    nowIdx = nowIdx >= 0 ? nowIdx : 0; const d = decks[cur]; load(d, nowIdx); resetDeck(d);
    d.gain.gain.cancelScheduledValues(ctx.currentTime); d.gain.gain.setValueAtTime(1, ctx.currentTime);
    d.el.play().catch(() => {}); playing = true; nextIdx = -1; preloadNext(); onPlayState();
  }
  function pause() { playing = false; for (const d of decks) d.el.pause(); onPlayState(); }
  async function party() {
    if (playing) { pause(); return; }
    if (!tracks.length) { await addDemos(); }
    if (nowIdx < 0) { orderByTempo(); autoIn.checked = true; }
    start();
  }
  partyBtn.onclick = party; miniPlay.onclick = party;
  mixBtn.onclick = miniNext.onclick = () => { if (playing && !mixing) startMix(true); };

  /* ---------- the mix ----------
     style 'blend' : beat-matched, incoming phrase starts on the outgoing phrase start; highs in early, bass swap halfway, out by the end (32 or 16 beats)
     style 'echo'  : tempos too far apart; outgoing gets a dotted-eighth echo + high-pass sweep and fades in 2 beats, incoming drops on the downbeat
     style 'fade'  : no beat grid known; 8 s equal-power crossfade */
  function startMix(now) {
    const a = decks[cur], b = decks[other()], i = pickNext(); if (i < 0 || !ctx) return;
    if (b.idx !== i) load(b, i);
    const ta = a.track, tb = b.track, grid = !!(ta.bpm && tb.bpm);
    const ratio = grid ? (ta.bpm * a.el.playbackRate) / tb.bpm : 1;
    const style = !grid ? 'fade' : (ratio >= 0.92 && ratio <= 1.08 ? 'blend' : 'echo');
    const realBeat = grid ? beatLen(ta) / a.el.playbackRate : 0.5, cb = grid ? beatAt(a) : 0;
    /* where: the planned phrase (auto) or the next bar line (mix now) */
    let S = cb + 0.05;
    if (grid) { S = now ? ta.downbeat + Math.ceil((cb + 0.6 - ta.downbeat) / 4) * 4 : Math.max(ta.outro, Math.ceil(cb + 0.6)); }
    const beatsLeft = grid ? (ta.beats || 1e9) - S : 1e9;
    const L = style === 'blend' ? (beatsLeft >= 32 && !now ? 32 : 16) : style === 'echo' ? 8 : 0;
    const T = ctx.currentTime + (grid ? (S - cb) * realBeat : 0.05), D = style === 'fade' ? 8 : L * realBeat, B = realBeat;
    const rate = style === 'blend' ? ratio : 1;
    b.el.playbackRate = rate; b.el.currentTime = tb.bpm ? tb.firstBeat + (tb.intro || 0) * beatLen(tb) : 0;
    resetDeck(b); b.trim.gain.value = trimFor(tb);
    const at = (p, v, t) => p.setValueAtTime(v, t), ramp = (p, v, t) => p.linearRampToValueAtTime(v, t), hold = (p) => { p.cancelScheduledValues(ctx.currentTime); p.setValueAtTime(p.value, ctx.currentTime); };
    [a.gain.gain, b.gain.gain, a.low.gain, b.low.gain, a.high.gain, b.high.gain, a.hp.frequency, a.send.gain].forEach(hold);
    if (style === 'blend') {
      at(b.gain.gain, 0, T); ramp(b.gain.gain, 1, T + D * 0.5);
      at(b.low.gain, -26, T); at(b.low.gain, -26, T + D * 0.5); ramp(b.low.gain, 0, T + D * 0.5 + B);                // bass swap
      at(b.high.gain, -9, T); ramp(b.high.gain, 0, T + D * 0.3);
      at(a.low.gain, 0, T + D * 0.5); ramp(a.low.gain, -26, T + D * 0.5 + B);
      at(a.high.gain, 0, T + D * 0.5); ramp(a.high.gain, -10, T + D * 0.85);
      at(a.gain.gain, 1, T + D * 0.62); ramp(a.gain.gain, 0, T + D);
    } else if (style === 'echo') {
      a.delay.delayTime.setValueAtTime(Math.min(1.9, B * 0.75), ctx.currentTime);
      at(a.send.gain, 0.7, T); at(a.send.gain, 0.7, T + B); ramp(a.send.gain, 0, T + B * 1.5);                      // catch one beat, let it ring
      at(a.hp.frequency, 10, T); a.hp.frequency.exponentialRampToValueAtTime(1400, T + B * 2);
      at(a.gain.gain, 1, T); ramp(a.gain.gain, 0, T + B * 2);
      at(b.gain.gain, 1, T); at(b.low.gain, -26, T); at(b.low.gain, -26, T + B * 4); ramp(b.low.gain, 0, T + B * 8);   // bass drops in after a bar
    } else {
      for (let k = 0; k <= 16; k++) { const u = k / 16; b.gain.gain.linearRampToValueAtTime(Math.sin(u * Math.PI / 2), T + D * u); a.gain.gain.linearRampToValueAtTime(Math.cos(u * Math.PI / 2), T + D * u); }
    }
    setTimeout(() => { if (playing) b.el.play().catch(() => {}); }, Math.max(0, (T - ctx.currentTime) * 1000 - 25));
    const drop = style === 'blend' ? T + D * 0.5 : style === 'echo' ? T + B * 4 : T + D * 0.5;
    setTimeout(() => { if (playing && avatar && avatar.hype) avatar.hype(Math.random() < 0.6 ? 'handsUp' : 'fistPump'); }, Math.max(0, (drop - ctx.currentTime) * 1000));
    mixing = { a, b, T, mid: T + (style === 'fade' ? D / 2 : style === 'echo' ? 0 : D * 0.5), end: T + Math.max(D, B * 8), sync: style === 'blend', rate, style };
    nextIdx = -1; renderList();
    status.textContent = `Mixing into “${tb.title}” · ${style === 'blend' ? `beat-matched${rate !== 1 ? `, tempo ${rate > 1 ? '+' : ''}${(rate * 100 - 100).toFixed(1)}%` : ''}` : style === 'echo' ? 'echo out, drop in' : 'crossfade'}`;
    if (avatar && avatar.play && !window.__dj) avatar.play('reach');   // at the DJ corner the right hand goes to the mixer instead
  }
  function endMix() {
    const { a, b, rate } = mixing; a.el.pause(); resetDeck(a); a.gain.gain.cancelScheduledValues(ctx.currentTime); a.gain.gain.setValueAtTime(0, ctx.currentTime);
    cur = b.i; nowIdx = b.idx; mixing = null;
    if (rate !== 1) rateEase = { d: b, from: b.el.playbackRate, t0: performance.now(), dur: 32 * beatLen(b.track) * 1000 };   // back to its own tempo over ~32 beats
    status.textContent = `Now playing “${b.track.title}”`; preloadNext();
  }
  /* control loop: beat-lock the incoming deck, plan the next mix, update the UI */
  setInterval(() => {
    if (!ctx || !playing) return draw();
    const a = decks[cur];
    if (mixing) {
      if (mixing.sync && !mixing.b.el.paused) { let e = phaseOf(mixing.b) - phaseOf(mixing.a); e -= Math.round(e); mixing.b.el.playbackRate = mixing.rate * (1 - Math.max(-0.5, Math.min(0.5, e)) * 0.08); }
      if (ctx.currentTime >= mixing.end) endMix();
    } else if (a.track) {
      if (rateEase) { const k = Math.min(1, (performance.now() - rateEase.t0) / rateEase.dur); rateEase.d.el.playbackRate = rateEase.from + (1 - rateEase.from) * k; if (k >= 1) rateEase = null; }
      const t = a.track, nxt = pickNext();
      if (autoIn.checked && nxt >= 0) {
        if (t.bpm && t.beats) { if (beatAt(a) >= t.outro - 3 && decks[other()].track) startMix(false); }
        else { const left = (a.el.duration || 0) - a.el.currentTime; if (isFinite(left) && left > 0 && left < 10) startMix(false); }
      }
      if (!mixing && a.el.ended) { if (nxt >= 0) { cur = other(); nowIdx = nxt; playing = true; const d = decks[cur]; if (d.idx !== nxt) load(d, nxt); resetDeck(d); d.gain.gain.setValueAtTime(1, ctx.currentTime); d.el.play(); preloadNext(); } else pause(); }
    }
    draw();
  }, 50);
  /* manual crossfader (only when auto-mix is off) */
  xf.oninput = () => {
    if (!ctx || mixing || autoIn.checked) return; const v = +xf.value, A = decks[0], Bd = decks[1];
    A.gain.gain.setTargetAtTime(Math.cos(v * Math.PI / 2), ctx.currentTime, 0.03); Bd.gain.gain.setTargetAtTime(Math.sin(v * Math.PI / 2), ctx.currentTime, 0.03);
    if (v > 0.02 && Bd.track && Bd.el.paused && playing) Bd.el.play(); if (v < 0.98 && A.track && A.el.paused && playing) A.el.play();
  };
  function draw() {
    decks.forEach((d, i) => {
      const u = deckUI[i], t = d.track; u.d.classList.toggle('live', playing && !d.el.paused);
      u.t.textContent = 'Deck ' + 'AB'[i] + ' — ' + (t ? t.title : 'empty');
      u.m.textContent = t ? `${t.bpm ? (t.bpm * d.el.playbackRate).toFixed(1) + ' BPM' : 'tempo unknown'} · ${fmt(d.el.currentTime)} / ${fmt(d.el.duration || t.duration)}` : '';
      const dur = d.el.duration || t && t.duration; u.fill.style.width = (dur ? (d.el.currentTime / dur) * 100 : 0) + '%';
      if (t && t.bpm && t.beats && dur) { u.cue.style.display = ''; u.cue.style.left = ((t.firstBeat + t.outro * beatLen(t)) / dur * 100) + '%'; } else u.cue.style.display = 'none';
    });
    partyBtn.textContent = playing ? '⏸ Pause' : (nowIdx >= 0 ? '▶ Resume' : '🎉 Start the party'); miniPlay.textContent = playing ? '⏸' : '▶';
    const a = decks[cur]; title.textContent = playing && a.track ? '🎧 ' + a.track.title : "🎧 Sid's DJ booth";
    if (playing && !mixing && a.track && a.track.bpm && a.track.beats && autoIn.checked && pickNext() >= 0) {
      const secs = (a.track.outro - beatAt(a)) * beatLen(a.track) / a.el.playbackRate; if (secs > 0) status.textContent = `Now playing “${a.track.title}” · next mix in ${fmt(secs)}`;
    }
    if (!mixing && ctx && autoIn.checked) xf.value = cur;
  }

  /* ---------- the avatar: walks to the DJ corner (or sits at the desk) and moves with the music ---------- */
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
  let rigLast = performance.now(), rigQ = null, rigAxis = null, rigV = null; const jogAng = [0, 0];
  function rigTick(t) {
    requestAnimationFrame(rigTick);
    const R = window.__dj, dt = Math.min(0.1, (t - rigLast) / 1000); rigLast = t; if (!R || !R.jogL) return;
    if (!rigQ) { rigQ = R.jogL.quaternion.clone(); rigAxis = R.jogL.up.clone().set(0, 1, 0); rigV = R.jogL.position.clone(); }
    const g = groove(), beat = g ? g.amp * Math.exp(-9 * g.phase) : 0;
    [R.jogL, R.jogR].forEach((jog, i) => {
      const d = decks[i]; if (!jog) return;
      if (ctx && playing && !d.el.paused) jogAng[i] -= dt * 2 * Math.PI * 0.555 * d.el.playbackRate;   // 33⅓ rpm platter, clockwise
      jog.quaternion.copy(jog.userData.restQuat).multiply(rigQ.setFromAxisAngle(rigAxis, jogAng[i]));
    });
    const slide = (o, x0, y0, z0) => { if (o) o.position.copy(o.userData.restPos).add(rigV.set(x0, y0, z0).applyQuaternion(o.quaternion)); };
    const gA = decks[0].gain ? decks[0].gain.gain.value : 0, gB = decks[1].gain ? decks[1].gain.gain.value : 0;
    slide(R.fader1, 0, 0, (0.5 - (playing ? gA : 0)) * 0.056); slide(R.fader2, 0, 0, (0.5 - (playing ? gB : 0)) * 0.056);   // -Z = up
    slide(R.xfader, ((gB + 1e-6) / (gA + gB + 2e-6) - 0.5) * 0.052, 0, 0);
    slide(R.coneL, 0, 0.0028 * beat, 0); slide(R.coneR, 0, 0.0028 * beat, 0);
    if (R.light) R.light.intensity = playing ? 0.9 + 1.4 * beat : 1.4;
  }
  requestAnimationFrame(rigTick);

  const api = { addFiles, addDemos, party, start, pause, mixNow: () => mixBtn.onclick(), orderByTempo,
    state: () => ({ playing, mixing: mixing && mixing.style, cur, nowIdx, nextIdx, tracks: tracks.map(t => ({ title: t.title, bpm: t.bpm, firstBeat: t.firstBeat, downbeat: t.downbeat, phrase0: t.phrase0, outro: t.outro, beats: t.beats, rms: t.rms && +t.rms.toFixed(3) })) }),
    _analyse: analyseAudio, _render: renderGroove, _demos: DEMOS, _debug: () => ({ decks, phaseOf, beatAt, ctx, mixing, rigTick }) };
  window.__djBooth = api; return api;
}
