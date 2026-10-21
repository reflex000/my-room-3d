/* Sid's DJ booth.
   Engine: each deck plays a decoded AudioBuffer through Web Audio (buffer source -> 3-band EQ -> low/high-pass filter ->
   loudness trim -> channel fader -> crossfader -> master, plus a beat-synced echo send). Because the decks are buffers,
   starts, cue jumps and loops land on the exact sample, scheduled on the audio clock.
   Analysis (once per track): tempo + beat grid, downbeat, 8-bar phrases, where the outro starts, loudness.
   Two ways to play:
   - Simple: "Start the party" — Sid orders the set by tempo and auto-mixes like a DJ (phrase-aligned, beat-matched EQ
     blends; echo out + drop when tempos are far apart).
   - Pro decks: two decks with waveforms, hot cues, beat loops, CUE, play, tempo, sync, nudge, quantize, per-deck EQ /
     filter / fader, crossfader, echo out.
   Music comes from the visitor's own device (played locally, never uploaded) or from demo grooves generated here.
   Usage (room.js): import('./dj.js').then(m => m.initDJ({ avatar })) */
export function initDJ({ avatar }) {
  const css = document.createElement('style');
  css.textContent = `
  .dj-btn{position:fixed;right:16px;top:106px;z-index:60;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(12,14,20,.82);color:#e9ecf3;padding:9px 13px;border-radius:999px;font:600 12.5px/1 system-ui,sans-serif;backdrop-filter:blur(8px)}
  .dj-btn.on{border-color:#7ee0b3;color:#7ee0b3}
  .dj-panel{position:fixed;right:16px;top:150px;z-index:61;width:340px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box;padding:0 14px 12px;border-radius:16px;background:rgba(12,14,20,.93);color:#e9ecf3;border:1px solid rgba(255,255,255,.12);font:13px/1.4 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);display:none;backdrop-filter:blur(10px)}
  .dj-panel.open{display:block}
  .dj-panel.pro{width:1060px}
  .dj-head{display:flex;align-items:center;gap:6px;margin:0 -14px 8px;padding:10px 10px 8px 14px;cursor:grab;touch-action:none;user-select:none;border-bottom:1px solid rgba(255,255,255,.06)}
  .dj-head:active{cursor:grabbing}
  .dj-head h3{flex:1;min-width:0;margin:0;font:700 14px/1.2 system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dj-icon{background:none!important;border:none!important;color:#cfd8e0!important;font-size:16px!important;padding:2px 6px!important;cursor:pointer}
  .dj-icon.on{color:#4aa8e0!important}
  .dj-sub{color:#8fa3b3;font-size:12px;margin:0 0 8px}
  .dj-steps{margin:0 0 8px;padding:8px 10px;border-radius:12px;background:rgba(74,168,224,.08);color:#cfe3f1;font-size:12px}
  .dj-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
  .dj-panel button,.dj-panel label.dj-pick{cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#e9ecf3;padding:7px 11px;border-radius:999px;font:600 12px/1 system-ui,sans-serif}
  .dj-panel button:disabled{opacity:.45;cursor:default}
  .dj-panel button.primary{background:#7ee0b3;border-color:#7ee0b3;color:#06140e}
  .dj-panel button.big{flex:1;padding:11px 14px;font-size:14px}
  .dj-panel button.on{background:#4aa8e0;border-color:#4aa8e0;color:#04121d}
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
  .dj-list li .ld{display:none;padding:3px 8px!important;font-size:11px!important}
  .dj-panel.pro .dj-list li .ld{display:inline-block}
  .dj-panel input[type=range]{width:100%;accent-color:#4aa8e0}
  .dj-note{color:#6f8494;font-size:11.5px;margin:8px 0 0}
  .dj-panel.mini{width:auto;max-width:calc(100vw - 32px);padding:0 10px 0 14px;overflow:hidden}
  .dj-panel.mini .dj-body{display:none}
  .dj-panel.mini .dj-head{margin:0 -10px 0 -14px;border-bottom:none}
  .dj-panel:not(.mini) .dj-minictl{display:none}
  .dj-minictl{display:flex;gap:4px}
  .dj-panel:not(.pro) .dj-pro{display:none}
  .dj-panel.pro .dj-simple{display:none}
  .dj-pro{display:grid;grid-template-columns:1fr 200px 1fr;gap:12px;margin:4px 0 8px}
  .dj-pdeck{border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:8px 10px;background:rgba(255,255,255,.03);min-width:0}
  .dj-pdeck.live{border-color:rgba(126,224,179,.45)}
  .dj-pdeck .t{display:flex;gap:8px;align-items:baseline}
  .dj-pdeck .t b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dj-pdeck .t small{color:#8fa3b3;font-variant-numeric:tabular-nums;flex:none}
  .dj-pdeck canvas{display:block;width:100%;border-radius:8px;background:#0a1018;margin-top:6px;cursor:pointer}
  .dj-pdeck .r{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;align-items:center}
  .dj-pdeck .r button{padding:6px 9px;font-size:11.5px}
  .dj-pdeck .r small{color:#8fa3b3;margin-right:2px}
  .dj-pdeck .hc{min-width:34px}
  .dj-pdeck .hc.set{border-color:#ffc46b;color:#ffc46b}
  .dj-pdeck .tempo{display:flex;gap:6px;align-items:center;margin-top:6px}
  .dj-pdeck .tempo small{color:#8fa3b3;width:62px;font-variant-numeric:tabular-nums}
  .dj-mixer{display:flex;flex-direction:column;gap:6px;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:8px;background:rgba(255,255,255,.02)}
  .dj-mixer .ch{display:grid;grid-template-columns:34px 1fr 1fr;gap:4px;align-items:center;font-size:11px;color:#8fa3b3}
  .dj-mixer .hdr{display:grid;grid-template-columns:34px 1fr 1fr;font-weight:700;color:#cfd8e0;font-size:11px;text-align:center}
  .dj-mixer small{color:#8fa3b3}
  @media (max-width:820px){ .dj-pro{grid-template-columns:1fr} .dj-panel.pro{width:calc(100vw - 32px)} }`;
  document.head.appendChild(css);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), frac = (v) => v - Math.floor(v);

  /* ---------- frame: button, panel, header (drag / minimise / pro / close) ---------- */
  const btn = el('button', 'dj-btn', '🎧 DJ booth'); btn.type = 'button';
  const panel = el('div', 'dj-panel'), head = el('div', 'dj-head'), title = el('h3', null, "🎧 Sid's DJ booth");
  const miniPlay = el('button', 'dj-icon', '▶'), miniNext = el('button', 'dj-icon', '⏭'), miniCtl = el('div', 'dj-minictl'); miniCtl.append(miniPlay, miniNext);
  const proBtn = el('button', 'dj-icon', '🎛'), minBtn = el('button', 'dj-icon', '▁'), x = el('button', 'dj-icon', '×');
  [miniPlay, miniNext, proBtn, minBtn, x].forEach(b => { b.type = 'button'; });
  proBtn.title = 'Pro decks (cues, loops, EQ)'; minBtn.title = 'Make it small'; x.title = 'Close'; miniPlay.title = 'Play / pause'; miniNext.title = 'Mix into the next song';
  head.append(title, miniCtl, proBtn, minBtn, x); head.title = 'Drag me anywhere';
  const body = el('div', 'dj-body');
  panel.append(head, body); document.body.append(btn, panel);
  ['keydown', 'keyup', 'keypress', 'wheel', 'pointerdown'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  btn.onclick = () => { panel.classList.toggle('open'); place(); };
  x.onclick = () => panel.classList.remove('open');
  minBtn.onclick = () => { panel.classList.toggle('mini'); minBtn.textContent = panel.classList.contains('mini') ? '▢' : '▁'; store.set('dj.mini', panel.classList.contains('mini')); place(); };
  proBtn.onclick = () => setPro(!panel.classList.contains('pro'));
  if (store.get('dj.mini')) { panel.classList.add('mini'); minBtn.textContent = '▢'; }
  let pos = store.get('dj.pos');
  function place() {
    if (!pos) return; const r = panel.getBoundingClientRect(), w = r.width || 340;
    panel.style.left = Math.max(8, Math.min(innerWidth - w - 8, pos.x)) + 'px'; panel.style.top = Math.max(8, Math.min(innerHeight - 60, pos.y)) + 'px'; panel.style.right = 'auto';
  }
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; try { head.setPointerCapture(e.pointerId); } catch (err) {}
    const move = (ev) => { pos = { x: ev.clientX - dx, y: ev.clientY - dy }; place(); };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); store.set('dj.pos', pos); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  });
  addEventListener('resize', place); place();

  /* ---------- simple view ---------- */
  const simple = el('div', 'dj-simple');
  const steps = el('div', 'dj-steps', '1 · Add your songs (or try the demo grooves)   2 · Press “Start the party”. Sid orders them by tempo and mixes them for you. Want to perform yourself? Open 🎛 Pro decks.');
  const pickFiles = el('label', 'dj-pick'), fileIn = el('input'); fileIn.type = 'file'; fileIn.multiple = true; fileIn.accept = 'audio/*'; pickFiles.append('➕ Add songs', fileIn);
  const pickDir = el('label', 'dj-pick'), dirIn = el('input'); dirIn.type = 'file'; dirIn.multiple = true; dirIn.setAttribute('webkitdirectory', ''); pickDir.append('📁 Add a folder', dirIn);
  const demoBtn = el('button', null, '✨ Demo grooves'); demoBtn.type = 'button';
  const partyBtn = el('button', 'primary big', '🎉 Start the party'), mixBtn = el('button', null, '⏭ Mix now'); partyBtn.type = mixBtn.type = 'button';
  const status = el('p', 'dj-sub', 'Add songs to begin.');
  const deckUI = [0, 1].map(i => { const d = el('div', 'dj-deck'), t = el('b', null, 'Deck ' + 'AB'[i] + ' — empty'), m = el('small', null, ''), bar = el('div', 'dj-bar'), fill = el('i'), cue = el('u'); cue.style.display = 'none'; bar.append(fill, cue); d.append(t, m, bar); return { d, t, m, fill, cue }; });
  const row1 = el('div', 'dj-row'), row2 = el('div', 'dj-row'); row1.append(pickFiles, pickDir, demoBtn); row2.append(partyBtn, mixBtn);
  simple.append(steps, row2, deckUI[0].d, deckUI[1].d);
  const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = 0.85;
  const autoLbl = el('label'), autoIn = el('input'); autoIn.type = 'checkbox'; autoIn.checked = true; autoLbl.append(autoIn, ' Auto-mix');
  const quantLbl = el('label'), quantIn = el('input'); quantIn.type = 'checkbox'; quantIn.checked = true; quantLbl.append(quantIn, ' Quantize');
  const orderBtn = el('button', null, '↕ Order by tempo'); orderBtn.type = 'button';
  const list = el('ul', 'dj-list');
  const note = el('p', 'dj-note', 'Your songs play from your own device in this browser. Nothing is uploaded. Demo grooves are generated here.');
  const opts = el('div', 'dj-row'); opts.append(autoLbl, quantLbl, orderBtn);

  /* ---------- pro view ---------- */
  const pro = el('div', 'dj-pro');
  const proUI = [0, 1].map(i => {
    const box = el('div', 'dj-pdeck'), t = el('div', 't'), name = el('b', null, 'Deck ' + 'AB'[i] + ' — load a song'), info = el('small', null, '');
    t.append(name, info);
    const over = el('canvas'), zoom = el('canvas'); over.height = 72; zoom.height = 150; over.style.height = '36px'; zoom.style.height = '75px';
    over.title = 'Whole track — click to jump'; zoom.title = '8 seconds around the playhead — beats, bars (bright) and phrases (orange). Click to jump.';
    const tr = el('div', 'r'), cueB = el('button', null, 'CUE'), playB = el('button', 'primary', '▶'), syncB = el('button', null, 'SYNC'), echoB = el('button', null, 'Echo out');
    tr.append(cueB, playB, syncB, echoB);
    const hc = el('div', 'r'), hcs = [0, 1, 2, 3].map(k => { const b = el('button', 'hc', String(k + 1)); b.type = 'button'; b.title = 'Hot cue — tap: set / jump · Shift-tap or hold: clear'; hc.append(b); return b; });
    hc.prepend(el('small', null, 'Cues'));
    const lp = el('div', 'r'), loops = [0.5, 1, 2, 4, 8, 16].map(n => { const b = el('button', null, n === 0.5 ? '½' : String(n)); b.type = 'button'; b.title = 'Loop ' + n + ' beat' + (n === 1 ? '' : 's') + ' (tap again to leave)'; lp.append(b); return { n, b }; });
    lp.prepend(el('small', null, 'Loop'));
    const te = el('div', 'tempo'), tlab = el('small', null, '+0.0%'), tsl = el('input'), nd = el('button', null, '−'), nu = el('button', null, '+');
    tsl.type = 'range'; tsl.min = -8; tsl.max = 8; tsl.step = 0.05; tsl.value = 0; tsl.title = 'Tempo ±8% (double-click to reset)'; nd.title = 'Nudge slower (hold)'; nu.title = 'Nudge faster (hold)';
    te.append(tlab, tsl, nd, nu);
    [cueB, playB, syncB, echoB, nd, nu].forEach(b => { b.type = 'button'; });
    box.append(t, over, zoom, tr, hc, lp, te);
    return { box, name, info, over, zoom, cueB, playB, syncB, echoB, hcs, loops, tlab, tsl, nd, nu };
  });
  const mixer = el('div', 'dj-mixer'), hdr = el('div', 'hdr'); hdr.append(el('span', null, ''), el('span', null, 'A'), el('span', null, 'B')); mixer.append(hdr);
  const mk = (label, min, max, step, val) => { const row = el('div', 'ch'), s = [0, 1].map(() => { const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.title = label + ' (double-click to reset)'; return r; }); row.append(el('span', null, label), s[0], s[1]); mixer.append(row); return s; };
  const eqHi = mk('HI', -26, 6, 0.5, 0), eqMid = mk('MID', -26, 6, 0.5, 0), eqLow = mk('LOW', -26, 6, 0.5, 0), filt = mk('FILT', -1, 1, 0.01, 0), chan = mk('VOL', 0, 1, 0.01, 1);
  const xf = el('input'); xf.type = 'range'; xf.min = 0; xf.max = 1; xf.step = 0.01; xf.value = 0.5;
  mixer.append(el('small', null, 'Crossfader  A ◀ ▶ B'), xf, el('small', null, 'Master'), vol);
  pro.append(proUI[0].box, mixer, proUI[1].box);
  const help = el('p', 'dj-note', 'Hot cue: tap to set, tap again to jump (on the next beat with Quantize). Shift-tap or hold to clear. Loop: pick a length, tap again to leave. Load songs with the A / B buttons in the list. With Auto-mix off, the crossfader and faders are yours.');
  body.append(simple, pro, row1, status, opts, list, note);
  function setPro(on) {
    panel.classList.toggle('pro', on); proBtn.classList.toggle('on', on); store.set('dj.pro', on); help.remove(); if (on) note.before(help);
    if (on && autoIn.checked && !playingAny()) autoIn.checked = false;   // performing: the decks are yours
    applyXfader(); place();
  }

  /* ---------- audio graph ---------- */
  let ctx = null, master = null, analyser = null;
  const decks = [0, 1].map(i => ({ i, track: null, idx: -1, buffer: null, src: null, playing: false, ended: false, anchor: { t: 0, pos: 0 }, rate: 1, loop: null, synced: false, loading: null, peaks: null, cue: 0 }));
  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = +vol.value;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    for (const d of decks) {
      const f = (type, freq, q) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; if (q) n.Q.value = q; return n; };
      d.in = ctx.createGain(); d.low = f('lowshelf', 220); d.mid = f('peaking', 1000, 0.8); d.high = f('highshelf', 3500); d.lpf = f('lowpass', 20000, 0.7); d.hp = f('highpass', 10, 0.7);
      d.trim = ctx.createGain(); d.gain = ctx.createGain(); d.gain.gain.value = 0; d.xg = ctx.createGain();
      d.send = ctx.createGain(); d.send.gain.value = 0; d.delay = ctx.createDelay(2); d.fb = ctx.createGain(); d.fb.gain.value = 0.45;
      d.in.connect(d.low); d.low.connect(d.mid); d.mid.connect(d.high); d.high.connect(d.lpf); d.lpf.connect(d.hp); d.hp.connect(d.trim); d.trim.connect(d.gain); d.gain.connect(d.xg); d.xg.connect(master);
      d.trim.connect(d.send); d.send.connect(d.delay); d.delay.connect(d.fb); d.fb.connect(d.delay); d.delay.connect(master);   // echo send (pre-fader: the tail outlives the fade)
    }
    applyXfader();
  }
  vol.oninput = () => { if (master) master.gain.setTargetAtTime(+vol.value, ctx.currentTime, 0.05); };

  /* ---------- library ---------- */
  const tracks = []; let nowIdx = -1, nextIdx = -1;
  const fmt = (s) => !isFinite(s) ? '' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  function renderList() {
    list.replaceChildren(...tracks.map((t, i) => {
      const li = el('li', i === nowIdx ? 'now' : i === nextIdx ? 'next' : ''), name = el('span', null, (i === nowIdx ? '▶ ' : i === nextIdx ? '⏭ ' : '') + t.title);
      const la = el('button', 'ld', 'A'), lb = el('button', 'ld', 'B'); la.type = lb.type = 'button'; la.title = 'Load on deck A'; lb.title = 'Load on deck B';
      la.onclick = (e) => { e.stopPropagation(); loadDeck(decks[0], i); }; lb.onclick = (e) => { e.stopPropagation(); loadDeck(decks[1], i); };
      li.append(la, lb, name, el('small', null, t.bpm ? t.bpm.toFixed(1) + ' BPM' : t.analysing ? 'reading…' : '—'));
      li.title = i === nowIdx ? 'Playing' : 'Play this next'; li.onclick = () => { if (i !== nowIdx) { nextIdx = i; preloadNext(); renderList(); } };
      return li;
    }));
    steps.style.display = tracks.length ? 'none' : '';
  }
  function addTrack(t) { t.cues = t.cues || [null, null, null, null]; tracks.push(t); renderList(); return t; }
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i;
  let reading = 0;
  async function addFiles(files) {
    const fresh = [...files].filter(f => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of fresh) addTrack({ title: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f), file: f, bpm: null, firstBeat: 0, analysing: true });
    if (!fresh.length) { status.textContent = 'No audio files found there.'; return; }
    reading += fresh.length; status.textContent = `Reading ${reading} song${reading > 1 ? 's' : ''} (tempo, beats, phrases)…`;
    for (const t of tracks.filter(t => t.analysing)) { await analyse(t); reading = Math.max(0, reading - 1); renderList(); if (reading) status.textContent = `Reading ${reading} more…`; }
    if (!reading && !playingAny()) status.textContent = 'Ready. Press “Start the party” — or open 🎛 Pro decks.';
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
    /* tempo: up to 60 s from 15% in (skips quiet intros), autocorrelation with a prior around 122 BPM, then a comb fine-tune */
    const f0 = Math.floor(frames * 0.15), f1 = Math.min(frames, f0 + Math.floor(60 / hopT)); if (f1 - f0 < 8 / hopT) return null;
    const seg = on.subarray(f0, f1), mean = seg.reduce((s, v) => s + v, 0) / seg.length;
    const lag = (bpm) => 60 / (bpm * hopT);
    const ac = (L) => { const l0 = Math.floor(L), fr = L - l0; let s = 0; for (let i = 0; i + l0 + 1 < seg.length; i++) s += (seg[i] - mean) * ((seg[i + l0] - mean) * (1 - fr) + (seg[i + l0 + 1] - mean) * fr); return s; };
    let best = 0, bestS = -Infinity;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) { const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 122) / 0.55, 2)), sc = (ac(lag(bpm)) + 0.5 * ac(lag(bpm) * 2)) * prior; if (sc > bestS) { bestS = sc; best = bpm; } }
    let fb = best, fph = 0, fs = -Infinity;
    for (let bpm = best - 1.5; bpm <= best + 1.5; bpm += 0.05) {
      const P = lag(bpm), beats = Math.floor((seg.length - 1) / P);
      for (let ph = 0; ph < P; ph += 1) { let s = 0; for (let k = 0; k < beats; k++) s += seg[Math.round(ph + k * P)] || 0; if (s > fs) { fs = s; fb = bpm; fph = ph; } }
    }
    const bpm = Math.round(fb * 10) / 10, beatT = 60 / bpm, t0 = (f0 + fph) * hopT, firstBeat = ((t0 % beatT) + beatT) % beatT;
    /* per-beat energy + onset over the whole track -> downbeat (strongest hits), phrases (biggest 8-bar energy changes), outro, loudness */
    const nB = Math.max(0, Math.floor((audio.duration - firstBeat) / beatT)), E = new Float32Array(nB), O = new Float32Array(nB);
    for (let k = 0; k < nB; k++) {
      const fa = Math.floor((firstBeat + k * beatT) / hopT), fz = Math.min(frames, Math.floor((firstBeat + (k + 1) * beatT) / hopT)); let s = 0, m = 0;
      for (let f = fa; f < fz; f++) s += en[f]; E[k] = s / Math.max(1, fz - fa);
      for (let f = Math.max(0, fa - 2); f <= Math.min(frames - 1, fa + 2); f++) m = Math.max(m, on[f]); O[k] = m;
    }
    let down = 0, ds = -1; for (let o = 0; o < 4; o++) { let s = 0, c = 0; for (let k = o; k < nB; k += 4) { s += O[k]; c++; } if (c && s / c > ds) { ds = s / c; down = o; } }
    const nBar = Math.floor((nB - down) / 4), barE = new Float32Array(nBar); for (let b = 0; b < nBar; b++) barE[b] = (E[down + 4 * b] + E[down + 4 * b + 1] + E[down + 4 * b + 2] + E[down + 4 * b + 3]) / 4;
    let ph = 0, pbest = -1; for (let p = 0; p < 8; p++) { let s = 0, c = 0; for (let b = p + 8; b < nBar; b += 8) { s += Math.abs(barE[b] - barE[b - 1]) + 0.5 * Math.abs(barE[b] - barE[b - 2]); c++; } if (c && s / c > pbest) { pbest = s / c; ph = p; } }
    const phrase0 = (down + 4 * ph) % 32;
    const sorted = Array.from(barE).sort((u, v) => u - v), body = sorted[Math.floor(sorted.length * 0.6)] || 1e-9;
    let outro = -1;
    for (let s = phrase0; s < nB; s += 32) {
      if (s < nB * 0.5) continue; const b0 = Math.floor((s - down) / 4); let peak = 0; for (let b = b0; b < nBar; b++) peak = Math.max(peak, barE[b]);
      if (peak < 0.75 * body) { outro = s; break; }
    }
    let lastFit = phrase0; while (lastFit + 64 <= nB) lastFit += 32;
    if (outro < 0 || outro + 16 > nB) outro = lastFit;
    outro = Math.max(outro, nB - 96, phrase0);
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
  function orderByTempo() {
    const now = nowIdx >= 0 ? tracks[nowIdx] : null, next = nextIdx >= 0 ? tracks[nextIdx] : null;
    tracks.sort((p, q) => (p.bpm || 1e9) - (q.bpm || 1e9));
    nowIdx = now ? tracks.indexOf(now) : -1; nextIdx = next ? tracks.indexOf(next) : -1;
    decks.forEach(d => { if (d.track) d.idx = tracks.indexOf(d.track); }); renderList();
  }
  orderBtn.onclick = () => { orderByTempo(); if (playingAny()) preloadNext(true); };

  /* ---------- deck engine ---------- */
  const playingAny = () => decks.some(d => d.playing);
  const bl = (d) => 60 / d.track.bpm;                                   // track seconds per beat
  const beatOfPos = (d, p) => (p - d.track.firstBeat) / bl(d);
  const posOfBeat = (d, b) => d.track.firstBeat + b * bl(d);
  const hasGrid = (d) => !!(d.track && d.track.bpm && d.buffer);
  function posOf(d, t) {
    if (!d.buffer || !ctx) return d.anchor.pos; if (t === undefined) t = ctx.currentTime;
    let p = d.playing ? d.anchor.pos + Math.max(0, t - d.anchor.t) * d.rate : d.anchor.pos;
    if (d.loop && d.playing && p > d.loop.end) { const L = d.loop.end - d.loop.start; p = d.loop.start + ((p - d.loop.start) % L); }
    return Math.min(p, d.buffer.duration);
  }
  const phaseAt = (d, t) => frac(beatOfPos(d, posOf(d, t)));
  const trimFor = (t) => t.rms ? clamp(0.16 / t.rms, 0.4, 2.2) : 1;
  function makePeaks(buf) {
    const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0, sr = buf.sampleRate;
    const per = Math.max(1, Math.floor(sr / 150)), n = Math.floor(c0.length / per), hi = new Float32Array(n);   // 150 columns per second
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * per, e = j + per; j < e; j += 2) { const v = Math.abs(c0[j] + c1[j]) * 0.5; if (v > m) m = v; } hi[i] = m; }
    const W = 600, lo = new Float32Array(W), step = n / W; for (let i = 0; i < W; i++) { let m = 0; for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step); j++) if (hi[j] > m) m = hi[j]; lo[i] = m; }
    let mx = 1e-6; for (const v of lo) mx = Math.max(mx, v); return { hi, lo, rate: sr / per, norm: 1 / mx };
  }
  async function loadDeck(d, idx) {
    ensureCtx();
    const t = tracks[idx]; if (!t) return;
    if (mixing && (mixing.a === d || mixing.b === d)) return;                     // never yank a deck mid-mix
    stopDeck(d); d.track = t; d.idx = idx; d.loop = null; d.synced = false; d.buffer = null; d.peaks = null; d.anchor = { t: 0, pos: 0 }; d.rate = 1; d.ended = false; d.cue = 0;
    proUI[d.i].tsl.value = 0;
    const p = (async () => { const ab = await (await fetch(t.url)).arrayBuffer(); return await ctx.decodeAudioData(ab); })();
    d.loading = p;
    try { const buf = await p; if (d.track !== t) return; d.buffer = buf; d.peaks = makePeaks(buf); d.cue = t.bpm ? posOfBeat(d, t.intro || 0) : 0; d.anchor = { t: ctx.currentTime, pos: d.cue }; d.trim.gain.value = trimFor(t); }
    catch (e) { if (d.track === t) { d.track = null; status.textContent = `Could not read “${t.title}”.`; } }
    finally { if (d.loading === p) d.loading = null; }
  }
  function startAt(d, T, p) {
    if (!d.buffer) return;
    T = Math.max(T, ctx.currentTime);
    const old = d.src; if (old) { old.onended = null; try { old.stop(T); } catch (e) {} }
    const s = ctx.createBufferSource(); s.buffer = d.buffer; s.playbackRate.value = d.rate;
    if (d.loop) { s.loop = true; s.loopStart = d.loop.start; s.loopEnd = d.loop.end; }
    s.connect(d.in); p = clamp(p, 0, d.buffer.duration - 0.01); s.start(T, p);
    d.src = s; d.anchor = { t: T, pos: p }; d.playing = true; d.ended = false;
    s.onended = () => { if (d.src === s) { d.anchor = { t: ctx.currentTime, pos: d.buffer.duration }; d.playing = false; d.ended = true; d.src = null; onPlayState(); } };
  }
  function stopDeck(d) {
    if (!ctx) return; d.anchor = { t: ctx.currentTime, pos: posOf(d) };
    if (d.src) { d.src.onended = null; try { d.src.stop(); } catch (e) {} d.src = null; } d.playing = false;
  }
  function setRate(d, r) { if (!ctx) { d.rate = r; return; } d.anchor = { t: ctx.currentTime, pos: posOf(d) }; d.rate = r; if (d.src) d.src.playbackRate.setValueAtTime(r, ctx.currentTime); }
  /* the next grid line (every n beats; bars count from the downbeat) on a playing deck, as an audio-clock time */
  function nextGrid(d, every = 1) {
    const now = ctx.currentTime + 0.03, p = posOf(d, now), b = beatOfPos(d, p), off = every >= 4 ? (d.track.downbeat || 0) : 0;
    const nb = Math.floor((b - off) / every + 1e-6) * every + off + every;
    return { T: now + (posOfBeat(d, nb) - p) / d.rate, beat: nb };
  }
  const otherDeck = (d) => decks[1 - d.i];
  /* play / pause one deck. With Quantize and the other deck playing, it starts on the other deck's next beat, from a beat of its own */
  function togglePlay(d) {
    ensureCtx(); if (!d.buffer) return;
    if (d.playing) { stopDeck(d); onPlayState(); return; }
    let T = ctx.currentTime, p = d.anchor.pos >= d.buffer.duration - 0.05 ? 0 : d.anchor.pos; const o = otherDeck(d);
    if (quantIn.checked && hasGrid(d) && hasGrid(o) && o.playing) { T = nextGrid(o).T; p = posOfBeat(d, Math.round(beatOfPos(d, p))); }
    if (!mixing) { d.gain.gain.cancelScheduledValues(ctx.currentTime); d.gain.gain.setValueAtTime(panel.classList.contains('pro') ? +chan[d.i].value : 1, ctx.currentTime); }
    startAt(d, T, p); onPlayState();
  }
  function jumpTo(d, p) {
    ensureCtx(); if (!d.buffer) return;
    if (d.loop) exitLoop(d);
    if (!d.playing) { d.anchor = { t: ctx.currentTime, pos: p }; togglePlay(d); return; }
    const T = quantIn.checked && hasGrid(d) ? nextGrid(d).T : ctx.currentTime + 0.01; startAt(d, T, p);
  }
  function hotCue(d, k, clear) {
    if (!d.track || !d.buffer) return; const cues = d.track.cues;
    if (clear) { cues[k] = null; return; }
    if (cues[k] == null) { let p = posOf(d); if (quantIn.checked && hasGrid(d)) p = posOfBeat(d, Math.round(beatOfPos(d, p))); cues[k] = Math.max(0, p); return; }
    jumpTo(d, cues[k]);
  }
  function cueButton(d) {
    if (!d.buffer) return;
    if (d.playing) { stopDeck(d); d.anchor = { t: ctx.currentTime, pos: d.cue }; onPlayState(); return; }   // back to the cue point and stop
    let p = posOf(d); if (quantIn.checked && hasGrid(d)) p = posOfBeat(d, Math.round(beatOfPos(d, p))); d.cue = p; d.anchor = { t: ctx.currentTime, pos: p };
  }
  function setLoop(d, beats) {
    ensureCtx(); if (!d.buffer) return;
    if (d.loop && d.loop.beats === beats) { exitLoop(d); return; }
    const p = posOf(d), len = hasGrid(d) ? beats * bl(d) : beats * 0.5;
    const start = hasGrid(d) && quantIn.checked ? posOfBeat(d, Math.floor(beatOfPos(d, p) + 1e-6)) : p;
    d.anchor = { t: ctx.currentTime, pos: p }; d.loop = { start, end: start + len, beats };
    if (d.src) { d.src.loopStart = start; d.src.loopEnd = start + len; d.src.loop = true; }
  }
  function exitLoop(d) { if (!ctx) { d.loop = null; return; } d.anchor = { t: ctx.currentTime, pos: posOf(d) }; d.loop = null; if (d.src) d.src.loop = false; }
  function sync(d) {
    const o = otherDeck(d); if (!hasGrid(d) || !hasGrid(o)) return;
    let r = (o.track.bpm * o.rate) / d.track.bpm; while (r > 1.5) r /= 2; while (r < 0.75) r *= 2;
    setRate(d, r); d.synced = true; proUI[d.i].tsl.value = clamp((r - 1) * 100, -8, 8);
    if (d.playing && o.playing) {   // line the beats up, starting a hair from now
      const T = ctx.currentTime + 0.06, pD = posOf(d, T); let delta = phaseAt(d, T) - phaseAt(o, T); delta -= Math.round(delta);
      startAt(d, T, pD - delta * bl(d));
    }
  }
  function echoOut(d) {
    ensureCtx(); if (!d.playing) return;
    const B = hasGrid(d) ? bl(d) / d.rate : 0.5, T = hasGrid(d) ? nextGrid(d).T : ctx.currentTime + 0.02, back = d.gain.gain.value || 1, now = ctx.currentTime;
    d.delay.delayTime.setValueAtTime(Math.min(1.9, B * 0.75), now);
    d.send.gain.cancelScheduledValues(now); d.send.gain.setValueAtTime(0, now); d.send.gain.setValueAtTime(0.7, T); d.send.gain.setValueAtTime(0.7, T + B); d.send.gain.linearRampToValueAtTime(0, T + B * 1.5);
    const hp0 = Math.max(10, d.hp.frequency.value); d.hp.frequency.cancelScheduledValues(now); d.hp.frequency.setValueAtTime(hp0, now); d.hp.frequency.setValueAtTime(hp0, T); d.hp.frequency.exponentialRampToValueAtTime(1400, T + B * 2);
    d.gain.gain.cancelScheduledValues(now); d.gain.gain.setValueAtTime(back, now); d.gain.gain.setValueAtTime(back, T); d.gain.gain.linearRampToValueAtTime(0, T + B * 2);
    setTimeout(() => { stopDeck(d); d.hp.frequency.cancelScheduledValues(ctx.currentTime); applyFilter(d, true); d.gain.gain.cancelScheduledValues(ctx.currentTime); d.gain.gain.setValueAtTime(panel.classList.contains('pro') ? +chan[d.i].value : 0, ctx.currentTime); onPlayState(); }, Math.max(0, (T + B * 2.2 - ctx.currentTime) * 1000));
  }
  /* mixer (pro) */
  const dB = (node, v) => { if (ctx) node.gain.setTargetAtTime(+v, ctx.currentTime, 0.02); };
  function applyFilter(d, now) {
    if (!ctx) return; const v = +filt[d.i].value, lp = v < 0 ? 20000 * Math.pow(10, v * 2.7) : 20000, hp = v > 0 ? 10 * Math.pow(10, v * 3.1) : 10;
    if (now) { d.lpf.frequency.setValueAtTime(lp, ctx.currentTime); d.hp.frequency.setValueAtTime(hp, ctx.currentTime); } else { d.lpf.frequency.setTargetAtTime(lp, ctx.currentTime, 0.03); d.hp.frequency.setTargetAtTime(hp, ctx.currentTime, 0.03); }
  }
  function applyXfader() {
    if (!ctx) return; const manual = panel.classList.contains('pro') && !autoIn.checked, v = +xf.value;
    decks[0].xg.gain.setTargetAtTime(manual ? Math.min(1, Math.cos(v * Math.PI / 2) * Math.SQRT2) : 1, ctx.currentTime, 0.02);
    decks[1].xg.gain.setTargetAtTime(manual ? Math.min(1, Math.sin(v * Math.PI / 2) * Math.SQRT2) : 1, ctx.currentTime, 0.02);
  }
  [0, 1].forEach(i => {
    const d = decks[i], u = proUI[i];
    eqHi[i].oninput = () => dB(d.high, eqHi[i].value); eqMid[i].oninput = () => dB(d.mid, eqMid[i].value); eqLow[i].oninput = () => dB(d.low, eqLow[i].value);
    filt[i].oninput = () => applyFilter(d);
    [eqHi[i], eqMid[i], eqLow[i], filt[i]].forEach(r => { r.ondblclick = () => { r.value = 0; r.oninput(); }; });
    chan[i].oninput = () => { if (ctx && !mixing) d.gain.gain.setTargetAtTime(+chan[i].value, ctx.currentTime, 0.02); };
    u.playB.onclick = () => togglePlay(d);
    u.cueB.onclick = () => cueButton(d); u.syncB.onclick = () => sync(d); u.echoB.onclick = () => echoOut(d);
    u.hcs.forEach((b, k) => {
      let held = null;
      b.onpointerdown = () => { held = setTimeout(() => { held = 'cleared'; hotCue(d, k, true); }, 650); };
      b.onpointerup = (e) => { if (held === 'cleared') { held = null; return; } clearTimeout(held); held = null; hotCue(d, k, e.shiftKey); };
      b.onpointerleave = () => { if (held && held !== 'cleared') { clearTimeout(held); held = null; } };
    });
    u.loops.forEach(({ n, b }) => { b.onclick = () => setLoop(d, n); });
    u.tsl.oninput = () => { d.synced = false; setRate(d, 1 + u.tsl.value / 100); };
    u.tsl.ondblclick = () => { u.tsl.value = 0; u.tsl.oninput(); };
    const nudge = (b, f) => { let base = null; b.onpointerdown = () => { base = d.rate; setRate(d, base * f); }; const end = () => { if (base != null) { setRate(d, base); base = null; } }; b.onpointerup = end; b.onpointerleave = end; };
    nudge(u.nd, 0.97); nudge(u.nu, 1.03);
    const seek = (canvas, zoomView) => { canvas.onclick = (e) => {
      if (!d.buffer) return; const r = canvas.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      jumpTo(d, clamp(zoomView ? posOf(d) + (fx - 0.5) * 8 : fx * d.buffer.duration, 0, d.buffer.duration - 0.05));
    }; };
    seek(u.over, false); seek(u.zoom, true);
  });
  xf.oninput = applyXfader; autoIn.onchange = applyXfader;

  /* ---------- auto-mix (the simple "party" mode) ----------
     'blend' : beat-matched; incoming phrase starts on the outgoing outro phrase; highs in early, bass swap halfway, out by the end (32 or 16 beats)
     'echo'  : tempos >8% apart; old track gets a dotted-eighth echo + high-pass sweep and fades in 2 beats, new one drops on the downbeat
     'fade'  : no beat grid; 8 s equal-power crossfade */
  let cur = 0, mixing = null, rateEase = null;
  const other = () => 1 - cur;
  function pickNext() { if (!tracks.length) return -1; if (nextIdx >= 0 && nextIdx !== nowIdx) return nextIdx; return tracks.length > 1 ? (nowIdx + 1) % tracks.length : -1; }
  function preloadNext(force) { const i = pickNext(); nextIdx = i; const d = decks[other()]; if (i >= 0 && !mixing && !d.playing && (force || d.idx !== i)) loadDeck(d, i); renderList(); }
  function resetDeck(d) {
    const t = ctx.currentTime;
    for (const f of [d.low, d.mid, d.high]) { f.gain.cancelScheduledValues(t); f.gain.setValueAtTime(0, t); }
    d.hp.frequency.cancelScheduledValues(t); d.hp.frequency.setValueAtTime(10, t); d.lpf.frequency.cancelScheduledValues(t); d.lpf.frequency.setValueAtTime(20000, t);
    d.send.gain.cancelScheduledValues(t); d.send.gain.setValueAtTime(0, t);
  }
  async function start() {
    if (!tracks.length) { status.textContent = 'Add songs or the demo grooves first.'; return; }
    ensureCtx();
    const d = decks[cur];
    if (d.track && d.buffer && !d.playing && !d.ended && nowIdx >= 0 && d.idx === nowIdx) {   // resume
      togglePlay(d); if (mixing) { const b = mixing.b; if (b.buffer && !b.playing) startAt(b, ctx.currentTime, b.anchor.pos); } return;
    }
    nowIdx = nowIdx >= 0 ? nowIdx : 0;
    if (d.idx !== nowIdx || !d.buffer) await loadDeck(d, nowIdx);
    if (!d.buffer) return;
    resetDeck(d); d.gain.gain.cancelScheduledValues(ctx.currentTime); d.gain.gain.setValueAtTime(1, ctx.currentTime);
    startAt(d, ctx.currentTime + 0.05, hasGrid(d) ? posOfBeat(d, d.track.intro || 0) : 0); nextIdx = -1; preloadNext(); onPlayState();
  }
  function pauseAll() { decks.forEach(stopDeck); onPlayState(); }
  async function party() {
    if (playingAny()) { pauseAll(); return; }
    if (!tracks.length) await addDemos();
    if (nowIdx < 0) orderByTempo();
    autoIn.checked = true; applyXfader(); await start();
  }
  partyBtn.onclick = party; miniPlay.onclick = party;
  mixBtn.onclick = miniNext.onclick = () => { if (playingAny() && !mixing) startMix(true); };

  function startMix(now) {
    const a = decks[cur], b = decks[other()], i = pickNext(); if (i < 0 || !ctx || !a.buffer) return;
    if (b.idx !== i || !b.buffer) { if (b.idx !== i && !b.loading) loadDeck(b, i); return; }   // still decoding: the control loop tries again
    const ta = a.track, tb = b.track, grid = hasGrid(a) && hasGrid(b);
    const ratio = grid ? (ta.bpm * a.rate) / tb.bpm : 1;
    const style = !grid ? 'fade' : (ratio >= 0.92 && ratio <= 1.08 ? 'blend' : 'echo');
    const B = grid ? bl(a) / a.rate : 0.5, cb = grid ? beatOfPos(a, posOf(a)) : 0;
    let S = cb; if (grid) S = now ? (ta.downbeat || 0) + Math.ceil((cb + 0.6 - (ta.downbeat || 0)) / 4) * 4 : Math.max(ta.outro, Math.ceil(cb + 0.6));
    const beatsLeft = grid ? (ta.beats || 1e9) - S : 1e9;
    const L = style === 'blend' ? (beatsLeft >= 32 && !now ? 32 : 16) : style === 'echo' ? 8 : 0;
    const T = grid ? ctx.currentTime + (posOfBeat(a, S) - posOf(a)) / a.rate : ctx.currentTime + 0.05, D = style === 'fade' ? 8 : L * B;
    const rate = style === 'blend' ? ratio : 1;
    if (a.loop) exitLoop(a); b.loop = null; resetDeck(b); b.trim.gain.value = trimFor(tb); setRate(b, rate);
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
    startAt(b, T, tb.bpm ? posOfBeat(b, tb.intro || 0) : 0);   // sample-accurate: lands exactly on the outgoing phrase
    const drop = style === 'echo' ? T + B * 4 : T + D * 0.5;
    setTimeout(() => { if (playingAny() && avatar && avatar.hype) avatar.hype(Math.random() < 0.6 ? 'handsUp' : 'fistPump'); }, Math.max(0, (drop - ctx.currentTime) * 1000));
    mixing = { a, b, T, mid: style === 'echo' ? T : T + (style === 'fade' ? D / 2 : D * 0.5), end: T + Math.max(D, B * 8), rate, style };
    nextIdx = -1; renderList();
    status.textContent = `Mixing into “${tb.title}” · ${style === 'blend' ? `beat-matched${Math.abs(rate - 1) > 0.0005 ? `, tempo ${rate > 1 ? '+' : ''}${(rate * 100 - 100).toFixed(1)}%` : ''}` : style === 'echo' ? 'echo out, drop in' : 'crossfade'}`;
    if (avatar && avatar.play && !window.__dj) avatar.play('reach');   // at the DJ corner the right hand goes to the mixer instead
  }
  function endMix() {
    const { a, b, rate } = mixing; stopDeck(a); resetDeck(a); a.gain.gain.cancelScheduledValues(ctx.currentTime); a.gain.gain.setValueAtTime(0, ctx.currentTime);
    cur = b.i; nowIdx = b.idx; mixing = null;
    if (Math.abs(rate - 1) > 0.0005) rateEase = { d: b, from: b.rate, t0: performance.now(), dur: 32 * bl(b) * 1000, last: 0 };   // back to its own tempo over ~32 beats
    status.textContent = `Now playing “${b.track.title}”`; preloadNext(); onPlayState();
  }
  /* control loop: run the mix, plan the next one, update the UI */
  setInterval(() => {
    if (!ctx) return draw();
    if (mixing) { if (ctx.currentTime >= mixing.end) endMix(); return draw(); }
    if (rateEase) { const k = Math.min(1, (performance.now() - rateEase.t0) / rateEase.dur); if (performance.now() - rateEase.last > 400 || k >= 1) { rateEase.last = performance.now(); setRate(rateEase.d, rateEase.from + (1 - rateEase.from) * k); } if (k >= 1) rateEase = null; }
    const a = decks[cur];
    if (autoIn.checked && a.playing && a.track && a.buffer) {
      const nxt = pickNext();
      if (nxt >= 0) {
        if (hasGrid(a) && a.track.beats) { if (beatOfPos(a, posOf(a)) >= a.track.outro - 3) startMix(false); }
        else if (a.buffer.duration - posOf(a) < 10) startMix(false);
      }
    }
    if (autoIn.checked && a.ended && !mixing) { a.ended = false; const nxt = pickNext(); if (nxt >= 0) { cur = other(); nowIdx = nxt; start(); } }
    draw();
  }, 50);

  /* ---------- drawing ---------- */
  function draw() {
    decks.forEach((d, i) => {
      const u = deckUI[i], t = d.track, p = posOf(d), dur = d.buffer ? d.buffer.duration : t && t.duration; u.d.classList.toggle('live', d.playing);
      u.t.textContent = 'Deck ' + 'AB'[i] + ' — ' + (t ? t.title : 'empty');
      u.m.textContent = t ? `${t.bpm ? (t.bpm * d.rate).toFixed(1) + ' BPM' : 'tempo unknown'} · ${fmt(p)} / ${fmt(dur)}${d.loading ? ' · loading…' : ''}` : '';
      u.fill.style.width = (dur ? (p / dur) * 100 : 0) + '%';
      if (t && t.bpm && t.beats && dur) { u.cue.style.display = ''; u.cue.style.left = ((t.firstBeat + t.outro * 60 / t.bpm) / dur * 100) + '%'; } else u.cue.style.display = 'none';
    });
    const any = playingAny(); partyBtn.textContent = any ? '⏸ Pause' : (nowIdx >= 0 ? '▶ Resume' : '🎉 Start the party'); miniPlay.textContent = any ? '⏸' : '▶';
    const lead = loudest() || decks[cur]; title.textContent = any && lead.track ? '🎧 ' + lead.track.title : "🎧 Sid's DJ booth";
    const a = decks[cur];
    if (any && !mixing && autoIn.checked && hasGrid(a) && a.track.beats && pickNext() >= 0) {
      const secs = (posOfBeat(a, a.track.outro) - posOf(a)) / a.rate; if (secs > 0) status.textContent = `Now playing “${a.track.title}” · next mix in ${fmt(secs)}`;
    }
  }
  /* waveforms + deck state (pro view), every frame while it is showing */
  function drawPro() {
    requestAnimationFrame(drawPro);
    if (!panel.classList.contains('open') || !panel.classList.contains('pro') || panel.classList.contains('mini')) return;
    decks.forEach((d, i) => {
      const u = proUI[i], t = d.track, p = posOf(d);
      u.box.classList.toggle('live', d.playing); u.name.textContent = 'Deck ' + 'AB'[i] + ' — ' + (t ? t.title : 'load a song');
      u.info.textContent = t ? `${t.bpm ? (t.bpm * d.rate).toFixed(1) + ' BPM' : '—'} · ${fmt(p)} / -${fmt(Math.max(0, (d.buffer ? d.buffer.duration : 0) - p))}${d.loading ? ' · loading…' : ''}` : '';
      u.playB.textContent = d.playing ? '⏸' : '▶'; u.syncB.classList.toggle('on', d.synced); u.tlab.textContent = (d.rate >= 1 ? '+' : '') + ((d.rate - 1) * 100).toFixed(1) + '%';
      u.hcs.forEach((b, k) => b.classList.toggle('set', !!(t && t.cues && t.cues[k] != null)));
      u.loops.forEach(({ n, b }) => b.classList.toggle('on', !!(d.loop && d.loop.beats === n)));
      for (const [cv, zoom] of [[u.over, false], [u.zoom, true]]) {
        const w = Math.max(200, Math.round(cv.clientWidth * 2)); if (cv.width !== w) cv.width = w; const h = cv.height, g = cv.getContext('2d');
        g.clearRect(0, 0, w, h); if (!d.peaks) { g.fillStyle = '#334'; g.fillRect(0, h / 2 - 1, w, 2); continue; }
        const P = d.peaks, dur = d.buffer.duration;
        const x2t = zoom ? (xx) => p + (xx / w - 0.5) * 8 : (xx) => xx / w * dur, t2x = zoom ? (tt) => (tt - p) / 8 * w + w / 2 : (tt) => tt / dur * w;
        if (d.loop) { g.fillStyle = 'rgba(74,168,224,.25)'; g.fillRect(t2x(d.loop.start), 0, t2x(d.loop.end) - t2x(d.loop.start), h); }
        g.fillStyle = zoom ? '#5fd3a0' : '#3f8fbf';
        for (let xx = 0; xx < w; xx += 2) {
          const tt = x2t(xx); if (tt < 0 || tt > dur) continue;
          const v = zoom ? (P.hi[Math.floor(tt * P.rate)] || 0) : (P.lo[Math.floor(tt / dur * P.lo.length)] || 0), hh = Math.min(1, v * P.norm) * (h * 0.46);
          g.fillRect(xx, h / 2 - hh, 2, hh * 2);
        }
        if (zoom && t && t.bpm) {   // beat grid: beats, bars (bright), phrases (orange)
          const b0 = Math.ceil(beatOfPos(d, x2t(0))), b1 = Math.floor(beatOfPos(d, x2t(w)));
          for (let b = b0; b <= b1; b++) { const xx = t2x(posOfBeat(d, b)), bar = ((b - (t.downbeat || 0)) % 4 + 4) % 4 === 0, phr = ((b - (t.phrase0 || 0)) % 32 + 32) % 32 === 0; g.fillStyle = phr ? '#ffc46b' : bar ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.22)'; g.fillRect(xx - (phr ? 1.5 : 0.5), 0, phr ? 3 : bar ? 2 : 1, h); }
        }
        if (t && t.cues) t.cues.forEach((c, k) => { if (c == null) return; const xx = t2x(c); g.fillStyle = '#ffc46b'; g.fillRect(xx - 1, 0, 2, h); g.font = (zoom ? 22 : 18) + 'px system-ui'; g.fillText(String(k + 1), xx + 3, zoom ? 24 : 18); });
        g.fillStyle = '#ff6b7a'; const px = zoom ? w / 2 : t2x(p); g.fillRect(px - 1.5, 0, 3, h);
      }
    });
  }
  requestAnimationFrame(drawPro);

  /* ---------- the avatar: walks to the DJ corner (or sits at the desk) and moves with the music ---------- */
  const level = new Uint8Array(256);
  function loudest() { let best = null, bv = -1; for (const d of decks) { if (!d.playing || !d.gain) continue; const v = d.gain.gain.value * d.xg.gain.value; if (v > bv) { bv = v; best = d; } } return best; }
  function groove() {
    if (!playingAny() || !analyser) return null;
    analyser.getByteFrequencyData(level); let lo = 0; for (let i = 1; i < 8; i++) lo += level[i]; lo /= 7 * 255;
    const d = mixing ? (ctx.currentTime > mixing.mid ? mixing.b : mixing.a) : loudest();
    return { mixing: !!mixing, amp: Math.min(1, 0.5 + 0.5 * lo), phase: d && hasGrid(d) ? phaseAt(d) : (performance.now() / 500) % 1 };
  }
  let wasPlaying = false;
  function onPlayState() {
    const any = playingAny(); btn.classList.toggle('on', any);
    if (!avatar || any === wasPlaying) return; wasPlaying = any;
    const rig = window.__dj;
    if (any) { if (avatar.hold) avatar.hold(1e7); if (rig && rig.stand && avatar.djStand) avatar.djStand(rig.stand); else if (avatar.type) avatar.type(); if (avatar.groove) avatar.groove(groove); if (avatar.say) avatar.say(pickLine(), 3); }
    else { if (avatar.groove) avatar.groove(null); if (avatar.djStand) avatar.djStand(null); if (avatar.hold) avatar.hold(4); }
  }
  const pickLine = () => ['Let’s go 🎧', 'Turning it up 🔊', 'This one’s a vibe'][Math.floor(Math.random() * 3)];

  /* ---------- the DJ corner moves with the music (objects from the designer's dj-corner glb, see blender/README_DJ.md) ---------- */
  let rigLast = performance.now(), rigQ = null, rigAxis = null, rigV = null; const jogAng = [0, 0];
  function rigTick(t) {
    requestAnimationFrame(rigTick);
    const R = window.__dj, dt = Math.min(0.1, (t - rigLast) / 1000); rigLast = t; if (!R || !R.jogL) return;
    if (!rigQ) { rigQ = R.jogL.quaternion.clone(); rigAxis = R.jogL.up.clone().set(0, 1, 0); rigV = R.jogL.position.clone(); }
    const g = groove(), beat = g ? g.amp * Math.exp(-9 * g.phase) : 0, any = playingAny();
    [R.jogL, R.jogR].forEach((jog, i) => { const d = decks[i]; if (!jog) return; if (d.playing) jogAng[i] -= dt * 2 * Math.PI * 0.555 * d.rate; jog.quaternion.copy(jog.userData.restQuat).multiply(rigQ.setFromAxisAngle(rigAxis, jogAng[i])); });
    const slide = (o, x0, y0, z0) => { if (o) o.position.copy(o.userData.restPos).add(rigV.set(x0, y0, z0).applyQuaternion(o.quaternion)); };
    const lv = (d) => d.gain && d.playing ? d.gain.gain.value : 0, gA = lv(decks[0]), gB = lv(decks[1]);
    slide(R.fader1, 0, 0, (0.5 - Math.min(1, gA)) * 0.056); slide(R.fader2, 0, 0, (0.5 - Math.min(1, gB)) * 0.056);   // -Z = up
    const xv = panel.classList.contains('pro') && !autoIn.checked ? +xf.value : (gB + 1e-6) / (gA + gB + 2e-6);
    slide(R.xfader, (xv - 0.5) * 0.052, 0, 0);
    slide(R.coneL, 0, 0.0028 * beat, 0); slide(R.coneR, 0, 0.0028 * beat, 0);
    if (R.light) R.light.intensity = any ? 0.9 + 1.4 * beat : 1.4;
  }
  requestAnimationFrame(rigTick);

  if (store.get('dj.pro')) setPro(true);
  const api = { addFiles, addDemos, party, start, pause: pauseAll, mixNow: () => mixBtn.onclick(), orderByTempo, setPro,
    loadDeck: (i, idx) => loadDeck(decks[i], idx), togglePlay: (i) => togglePlay(decks[i]), hotCue: (i, k, clear) => hotCue(decks[i], k, clear),
    setLoop: (i, n) => setLoop(decks[i], n), exitLoop: (i) => exitLoop(decks[i]), sync: (i) => sync(decks[i]), echoOut: (i) => echoOut(decks[i]),
    state: () => ({ playing: playingAny(), mixing: mixing && mixing.style, cur, nowIdx, nextIdx, tracks: tracks.map(t => ({ title: t.title, bpm: t.bpm, firstBeat: t.firstBeat, downbeat: t.downbeat, phrase0: t.phrase0, outro: t.outro, beats: t.beats, rms: t.rms && +t.rms.toFixed(3), cues: t.cues })) }),
    _analyse: analyseAudio, _render: renderGroove, _demos: DEMOS, _debug: () => ({ decks, posOf, beatOfPos, phaseAt, ctx, mixing, rigTick, drawPro, proUI }) };
  window.__djBooth = api; return api;
}
