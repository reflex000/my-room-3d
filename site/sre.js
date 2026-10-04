/* SRE desk — talk to the avatar, file infra requests, watch the job on the room's main monitor and ops board.
   Backend: /api/chat (LLM + skills + validation) and /api/job (ticket status). Step 1 runs a simulated pipeline.
   Usage (room.js): import('./sre.js').then(m => m.initSRE({ T, stage, avatar, screens })); */

import { createVoice } from './voice.js';

export function initSRE({ T, stage, avatar, screens }) {
  const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  let pending = null, invite = LS.get('sre.invite', ''), jobs = LS.get('sre.jobs', []), status = {}, messages = [], busy = false, open = false, polling = null, announced = new Set(LS.get('sre.announced', []));
  const av = (fn, ...a) => { try { if (avatar && avatar.ready && typeof avatar[fn] === 'function') return avatar[fn](...a); } catch (e) {} };

  /* ---------- styles + DOM ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .sre-launch{position:fixed;right:16px;top:16px;z-index:60;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(12,14,20,.82);color:#e9ecf3;padding:10px 14px;border-radius:999px;font:600 13px/1 system-ui,sans-serif;backdrop-filter:blur(6px)}
  .sre-launch b{color:#7ee0b3;font-weight:600}
  .sre-toss{position:fixed;right:16px;top:62px;z-index:60;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:rgba(12,14,20,.82);color:#e9ecf3;padding:9px 13px;border-radius:999px;font:600 12.5px/1 system-ui,sans-serif;backdrop-filter:blur(6px)}
  .sre-toss span{color:#ffc46b;margin-left:6px;font-variant-numeric:tabular-nums}
  .sre-panel{position:fixed;right:16px;top:16px;bottom:16px;width:min(390px,calc(100vw - 32px));z-index:61;display:none;flex-direction:column;background:rgba(11,13,19,.94);color:#e9ecf3;border:1px solid rgba(255,255,255,.12);border-radius:16px;font:400 14px/1.45 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.55);backdrop-filter:blur(10px);overflow:hidden}
  .sre-panel.open{display:flex}
  @media (max-width:640px){.sre-panel{left:8px;right:8px;top:auto;bottom:8px;width:auto;height:64vh}}
  .sre-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
  .sre-head h2{margin:0;font:600 14px/1.2 system-ui,sans-serif;flex:1}
  .sre-badge{font:600 10px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border-radius:999px;background:rgba(255,190,80,.14);color:#ffc46b;border:1px solid rgba(255,190,80,.3)}
  .sre-x{cursor:pointer;background:none;border:0;color:#9aa3b5;font-size:18px;padding:4px 6px}
  .sre-tickets{padding:8px 14px 0}
  .sre-ticket{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 10px;margin-bottom:8px;background:rgba(255,255,255,.03);font-size:12.5px}
  .sre-ticket .row{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
  .sre-ticket .id{font:600 12px/1 ui-monospace,Consolas,monospace;color:#9fd0ff}
  .sre-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.1);margin-top:7px;overflow:hidden}.sre-bar i{display:block;height:100%;background:#3fb98f;transition:width .6s}
  .sre-ticket a{color:#9fd0ff;cursor:pointer;text-decoration:underline;font-size:11.5px}
  .sre-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
  .sre-m{max-width:88%;padding:8px 11px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
  .sre-m.u{align-self:flex-end;background:#2a5bd7;color:#fff;border-bottom-right-radius:4px}
  .sre-m.a{align-self:flex-start;background:rgba(255,255,255,.07);border-bottom-left-radius:4px}
  .sre-m.s{align-self:center;background:none;color:#8d97aa;font-size:12px;text-align:center}
  .sre-foot{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08)}
  .sre-foot textarea,.sre-foot input{flex:1;resize:none;background:rgba(255,255,255,.06);color:#e9ecf3;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 11px;font:inherit;outline:none;min-width:0}
  .sre-foot button{cursor:pointer;border:0;border-radius:10px;padding:0 14px;background:#3fb98f;color:#06130d;font:600 13px/1 system-ui,sans-serif}
  .sre-foot button:disabled{opacity:.5;cursor:default}
  .sre-foot .sre-mic{background:rgba(255,255,255,.08);color:#e9ecf3;border:1px solid rgba(255,255,255,.16);padding:0 12px;font-size:17px;transition:box-shadow .08s}
  .sre-foot .sre-mic.on{background:#d6455d;border-color:#d6455d;color:#fff}
  .sre-foot .sre-mic.speak{background:#2a5bd7;border-color:#2a5bd7;color:#fff}
  .sre-sub{font:500 11px/1.2 system-ui,sans-serif;color:#8d97aa;margin-top:2px}
  .sre-spk{cursor:pointer;background:none;border:1px solid rgba(255,255,255,.16);color:#e9ecf3;border-radius:999px;padding:3px 9px;font:600 12px/1 system-ui,sans-serif}
  .sre-spk.off{color:#8d97aa}`;
  document.head.appendChild(css);

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const launch = el('button', 'sre-launch'); launch.type = 'button'; launch.innerHTML = '💬 Talk to Sid · <b>SRE desk</b>';
  const panel = el('section', 'sre-panel'); panel.setAttribute('aria-label', 'SRE desk chat');
  const head = el('div', 'sre-head'); const title = el('h2', null, 'Sid · SRE desk'); const sub = el('div', 'sre-sub', 'AI version of Sid — type or tap the mic and talk'); title.appendChild(sub); const badge = el('span', 'sre-badge', 'simulated'); const x = el('button', 'sre-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  const spk = el('button', 'sre-spk'); spk.type = 'button';
  head.append(title, spk, badge, x);
  const tickets = el('div', 'sre-tickets'), msgs = el('div', 'sre-msgs'), foot = el('div', 'sre-foot');
  panel.append(head, tickets, msgs, foot); document.body.append(launch, panel);
  /* paper toss: every click makes Sid crumple a sheet and shoot for the waste basket */
  const tossBtn = el('button', 'sre-toss'); tossBtn.type = 'button'; tossBtn.innerHTML = '🗑️ Paper toss<span></span>'; tossBtn.title = 'Make Sid throw a paper ball at the bin';
  const tossScore = tossBtn.querySelector('span'); document.body.append(tossBtn);
  avatar.onToss = (sc) => { tossScore.textContent = sc.made + ' / ' + sc.tried; };
  tossBtn.onclick = () => { const r = av('toss'); if (r && !r.ok) { tossScore.textContent = r.reason === 'away' ? 'Sid is out' : 'Sid is asleep'; setTimeout(() => { const sc = av('score'); tossScore.textContent = sc && sc.tried ? sc.made + ' / ' + sc.tried : ''; }, 2500); } };
  ['keydown', 'keyup', 'keypress', 'wheel', 'pointerdown'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));

  function addMsg(role, text) { const m = el('div', 'sre-m ' + (role === 'user' ? 'u' : role === 'assistant' ? 'a' : 's'), text); msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight; return m; }

  function renderFoot() {
    foot.textContent = '';
    if (!invite) {
      const i = el('input'); i.placeholder = 'Invite code'; i.autocomplete = 'off'; i.setAttribute('aria-label', 'Invite code');
      const b = el('button', null, 'Enter'); b.type = 'button';
      /* verify the code right away (empty chat → 400 means the gate let us through, 401 means wrong code) */
      const go = async () => {
        const v = i.value.trim(); if (!v || b.disabled) return; b.disabled = true; b.textContent = '…';
        let ok = false; try { const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite: v, messages: [] }) }); ok = r.status !== 401; } catch (e) {}
        if (!ok) { b.disabled = false; b.textContent = 'Enter'; addMsg('system', 'That code did not match — check for typos (it looks like guest-xxxxxxxx).'); return; }
        invite = v; LS.set('sre.invite', invite); addMsg('system', 'Code accepted ✓'); renderFoot(); if (!messages.length) greet(); loadOwner(true);
        if (pending) { const t = pending; pending = null; send(t); }
      };
      b.onclick = go; i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      foot.append(i, b); return;
    }
    const t = el('textarea'); t.rows = 2; t.placeholder = 'e.g. "I need a server to try out my app"'; t.maxLength = 1500; t.setAttribute('aria-label', 'Message');
    const b = el('button', null, 'Send'); b.type = 'button'; b.disabled = busy;
    const go = () => { const v = t.value.trim(); if (!v || busy) return; t.value = ''; send(v); };
    b.onclick = go; t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    if (voice.supported) {
      micBtn = el('button', 'sre-mic' + (vState === 'listening' ? ' on' : vState === 'speaking' ? ' speak' : ''), vState === 'listening' ? '●' : vState === 'speaking' ? '■' : vState === 'thinking' ? '…' : '🎙'); micBtn.type = 'button';
      micBtn.title = vState === 'idle' ? 'Talk to Sid' : 'Stop'; micBtn.setAttribute('aria-label', micBtn.title); micBtn.onclick = toggleVoice;
      t.placeholder = vState === 'listening' ? 'Listening… just talk' : vState === 'speaking' ? 'Sid is talking…' : t.placeholder;
      foot.append(micBtn);
    }
    foot.append(t, b); if (open && vState === 'idle') t.focus();
  }

  /* ---------- voice: mic → /api/stt → chat → /api/tts → speakers, mouth follows the audio ---------- */
  let vState = 'idle', voiceLoop = false, micBtn = null, speakOn = LS.get('sre.speak', true), speakChain = Promise.resolve();
  const paintSpk = () => { spk.textContent = speakOn ? '🔊 Voice on' : '🔇 Voice off'; spk.className = 'sre-spk' + (speakOn ? '' : ' off'); spk.title = speakOn ? 'Sid reads his replies out loud' : 'Replies are text only'; };
  spk.onclick = () => { speakOn = !speakOn; LS.set('sre.speak', speakOn); paintSpk(); if (speakOn) { voice.unlock(); speakReply('Voice is on. You will hear me now.'); } else voice.stopSpeaking(); };
  const voice = createVoice({ onLevel: (v) => av('mouth', v), onMic: (v) => { if (micBtn && vState === 'listening') micBtn.style.boxShadow = `0 0 0 ${Math.round(v * 10)}px rgba(214,69,93,.25)`; } });
  const setV = (s) => { vState = s; renderFoot(); };
  paintSpk();
  let speakGen = 0;
  async function speakNow(text, gen) {
    let ok = false;
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite, text }) });
      if (!r.ok) { addMsg('system', 'Voice is unavailable right now (' + r.status + ').'); return false; }
      const buf = await r.arrayBuffer(); if (gen !== speakGen) return false;   // a newer reply arrived while this one was loading
      const prev = vState; setV('speaking'); av('speaking', true); av('converse', true);
      ok = await voice.speak(buf);
      if (vState === 'speaking') setV(voiceLoop ? 'thinking' : (prev === 'speaking' ? 'idle' : prev));
      if (!ok) {
        const m = addMsg('system', 'Your browser did not let the audio play. ');
        const btn = el('button', 'sre-spk', '▶ Play it'); btn.type = 'button'; btn.style.marginLeft = '6px';
        btn.onclick = () => { voice.unlock(); voice.speak(buf); m.remove(); }; m.appendChild(btn);
      }
    } catch (e) {} finally { av('speaking', false); }
    return ok;
  }
  /* a new reply cuts off whatever he is still saying (like a person would), then speaks */
  function speakReply(text) { const gen = ++speakGen; voice.stopSpeaking(); return speakNow(text, gen); }
  async function voiceConversation() {
    while (voiceLoop && open) {
      setV('listening'); let rec = null;
      try { rec = await voice.listenOnce(); } catch (e) { addMsg('system', 'I could not use the microphone — check the browser permission.'); voiceLoop = false; break; }
      if (!voiceLoop) break;
      if (!rec) { voiceLoop = false; addMsg('system', 'I did not hear anything, so I stopped listening. Tap 🎙 to talk again.'); break; }
      setV('thinking');
      let text = '';
      try { const r = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-invite': invite, 'x-audio-type': rec.type }, body: rec.blob }); const d = await r.json().catch(() => ({})); if (r.status === 401) { invite = ''; LS.set('sre.invite', ''); voiceLoop = false; addMsg('system', 'Enter your invite code first.'); break; } text = (d.text || '').trim(); } catch (e) {}
      if (!text) continue;
      await send(text, { voice: true });
    }
    setV('idle'); voice.release();
  }
  function toggleVoice() {
    if (!invite) { addMsg('system', 'Enter your invite code first.'); return; }
    if (voiceLoop) { voiceLoop = false; voice.stopListening(); voice.stopSpeaking(); setV('idle'); return; }
    voice.unlock(); if (!speakOn) { speakOn = true; LS.set('sre.speak', true); paintSpk(); } voiceLoop = true; voiceConversation();
  }

  /* any tap inside the panel counts as permission to play sound */
  panel.addEventListener('pointerdown', () => voice.unlock(), { capture: true });

  function greet() { addMsg('system', 'You walked into Sid\'s SRE shop. Ask for what you need — he will ask the questions an SRE would.'); }

  /* ---------- chat ---------- */
  const short = (s) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > 110 ? s.slice(0, 107) + '…' : s; };
  async function send(text, opts = {}) {
    messages.push({ role: 'user', content: text }); addMsg('user', text);
    voice.unlock(); busy = true; renderFoot(); const dots = addMsg('system', 'Sid is thinking…');
    av('converse', true); av('play', 'think', 6);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite, messages, jobs: jobs.map(j => j.token), voice: !!opts.voice }) });
      const data = await r.json().catch(() => ({}));
      dots.remove();
      if (r.status === 401) { invite = ''; LS.set('sre.invite', ''); messages.pop(); pending = text; addMsg('system', 'That invite code did not work — enter it again below and I will resend your message.'); }
      else if (!r.ok) { messages.pop(); addMsg('system', 'Hmm, connection issue (' + (data.error || r.status) + '). Try again.'); av('play', 'shrug'); }
      else {
        badge.textContent = data.mode || 'simulated';
        messages.push({ role: 'assistant', content: data.reply }); addMsg('assistant', data.reply);
        av('say', short(data.reply)); av('play', (data.actions && data.actions[0]) || 'talk', data.actions && data.actions[0] ? undefined : Math.min(6, 2 + data.reply.length * 0.04));
        if (speakOn || (opts.voice && voiceLoop)) { busy = false; renderFoot(); await speakReply(data.reply); }
        if (data.job) startJob(data.job);
        else if (jobs.some(j => status[j.id] && !status[j.id].done)) setTimeout(() => av('type'), 7000);   // he answers, then goes back to the job
      }
    } catch (e) { dots.remove(); messages.pop(); addMsg('system', 'Network error. Try again.'); }
    busy = false; renderFoot();
  }

  /* ---------- jobs ---------- */
  function startJob(job) {
    jobs.unshift({ token: job.token, id: job.status.id }); jobs = jobs.slice(0, 8); LS.set('sre.jobs', jobs); status[job.status.id] = job.status;
    if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
    renderTickets(); poll();
    setTimeout(() => { av('converse', false); av('hold', 120); av('type'); }, 2600);
  }
  const statusLink = (j) => location.origin + location.pathname + '?job=' + encodeURIComponent(j.token);
  function renderTickets() {
    tickets.textContent = '';
    for (const j of jobs.slice(0, 3)) {
      const s = status[j.id]; if (!s) continue;
      const c = el('div', 'sre-ticket'), row = el('div', 'row');
      row.append(el('span', 'id', s.id), el('span', null, s.done ? '✅ done' : s.stageLabel));
      const sub = el('div', null, `${s.params.vm_size || s.skill} · ${s.params.region || ''} · ttl ${s.params.ttl_days || '?'}d`); sub.style.color = '#9aa3b5';
      const bar = el('div', 'sre-bar'), fill = el('i'); fill.style.width = Math.round(s.progress * 100) + '%'; bar.appendChild(fill);
      const link = el('a', null, 'copy status link'); link.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(statusLink(j)); link.textContent = 'copied ✓'; };
      c.append(row, sub, bar, link); tickets.appendChild(c);
    }
    drawBoard();
  }
  async function poll() {
    if (polling) return;
    polling = setInterval(async () => {
      const active = jobs.filter(j => !(status[j.id] && status[j.id].done));
      if (!active.length) { clearInterval(polling); polling = null; return; }
      for (const j of active) {
        try { const r = await fetch('/api/job?token=' + encodeURIComponent(j.token)); if (!r.ok) continue; const s = await r.json(); status[j.id] = s; if (s.done) onDone(j, s); } catch (e) {}
      }
      renderTickets();
    }, 2000);
  }
  function onDone(j, s) {
    if (announced.has(s.id)) return; announced.add(s.id); LS.set('sre.announced', [...announced]);
    const o = s.outputs || {}, line = `Done ✅ ${s.id}: ${o.vm_name} is ready in ${o.region}. It will be removed automatically in ${o.expires_in_days} day(s).${o.note ? ' ' + o.note : ''}`;
    messages.push({ role: 'assistant', content: line }); addMsg('assistant', line);
    av('hold', 60); av('sit', () => { av('play', 'thumbs'); av('say', `All done — ${s.id} is ready ✅`, 6); });
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Sid · SRE desk', { body: `${s.id} is done — ${o.vm_name}` }); } catch (e) {} }
    setTimeout(() => { if (monitor && !jobs.some(k => status[k.id] && !status[k.id].done)) { monitor.draw = monitorOrig; } }, 25000);
  }

  /* ---------- the room's main monitor shows the live job log ---------- */
  const monitor = screens && screens[0], monitorOrig = monitor && monitor.draw;
  function drawJob(ctx, w, h, t) {
    const j = jobs.find(k => status[k.id]); const s = j && status[j.id]; if (!s) return monitorOrig(ctx, w, h, t);
    ctx.fillStyle = '#0a1118'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#10202c'; ctx.fillRect(0, 0, w, 86);
    ctx.font = '600 40px ui-monospace,Consolas,monospace'; ctx.fillStyle = '#e9f2f6'; ctx.textBaseline = 'middle'; ctx.fillText(`SRE DESK  ›  ${s.id}  ›  ${s.skill}`, 40, 44);
    ctx.font = '600 28px ui-monospace,Consolas,monospace'; ctx.fillStyle = s.mode === 'simulated' ? '#ffc46b' : '#7ee0b3'; ctx.textAlign = 'right'; ctx.fillText(s.mode.toUpperCase(), w - 40, 44); ctx.textAlign = 'left';
    /* stage pills */
    let px = 40; ctx.font = '500 24px system-ui,sans-serif';
    s.stages.forEach((lab, i) => { const tw = ctx.measureText(lab).width + 36; ctx.fillStyle = i < s.stageIndex || s.done ? '#1f6b52' : i === s.stageIndex ? '#2a5bd7' : '#18242f'; ctx.beginPath(); ctx.roundRect(px, 110, tw, 44, 22); ctx.fill(); ctx.fillStyle = '#e9f2f6'; ctx.fillText(lab, px + 18, 133); px += tw + 12; if (px > w - 300) px = w; });
    /* log */
    ctx.font = '400 30px ui-monospace,Consolas,monospace';
    const lines = s.log.slice(-14); lines.forEach((ln, i) => { ctx.fillStyle = /\[done\]|✓/.test(ln) ? '#7ee0b3' : /\[approval\]/.test(ln) ? '#ffc46b' : '#b8c7d3'; ctx.fillText(ln.slice(0, 84), 40, 210 + i * 44); });
    if (!s.done && Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#7ee0b3'; ctx.fillRect(40, 210 + lines.length * 44 - 16, 18, 32); }
    /* progress */
    ctx.fillStyle = '#18242f'; ctx.fillRect(40, h - 60, w - 80, 16); ctx.fillStyle = '#3fb98f'; ctx.fillRect(40, h - 60, (w - 80) * s.progress, 16);
  }

  /* ---------- Sid's board: a wall-mounted screen on the back wall, right of the desk (child of the avatar group so it
     survives the baked-GLB swap). Back wall face z = -1.76; right wall / pillar face x = 2.46. ---------- */
  const BW_ = 1.16, BH_ = 0.6525, BOARD = { x: 1.83, y: 1.80, z: -1.743 };
  const bc = document.createElement('canvas'); bc.width = 1280; bc.height = 720; const bx = bc.getContext('2d');
  const btex = new T.CanvasTexture(bc); btex.colorSpace = T.SRGBColorSpace; btex.anisotropy = 8;
  const board = new T.Mesh(new T.PlaneGeometry(BW_, BH_), new T.MeshBasicMaterial({ map: btex, toneMapped: false })); board.name = 'tickets_board';
  const bezelMat = new T.MeshStandardMaterial({ color: 0x08090c, roughness: 0.35, metalness: 0.3 });
  const bezel = new T.Mesh(new T.BoxGeometry(BW_ + 0.036, BH_ + 0.036, 0.022), bezelMat); bezel.name = 'tickets_board_bezel'; bezel.position.z = -0.0115; board.add(bezel);
  /* soft light spill on the wall around the screen */
  const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gx = gc.getContext('2d'), gg = gx.createRadialGradient(128, 128, 30, 128, 128, 128);
  gg.addColorStop(0, 'rgba(90,150,255,0.55)'); gg.addColorStop(0.6, 'rgba(60,110,230,0.18)'); gg.addColorStop(1, 'rgba(40,80,200,0)'); gx.fillStyle = gg; gx.fillRect(0, 0, 256, 256);
  const glow = new T.Mesh(new T.PlaneGeometry(BW_ * 1.9, BH_ * 2.1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(gc), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55 }));
  glow.name = 'tickets_board_glow'; glow.position.z = -0.0225; glow.raycast = () => {}; board.add(glow);
  board.position.set(BOARD.x, BOARD.y, BOARD.z); avatar.group.add(board);

  const fit = (ctx, text, max) => { if (ctx.measureText(text).width <= max) return text; let t = text; while (t.length > 4 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1); return t.trimEnd() + '…'; };
  const wrap = (ctx, text, max, lines) => { const words = String(text || '').split(/\s+/), out = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { out.push(cur); cur = w; if (out.length === lines) break; } else cur = t; } if (out.length < lines && cur) out.push(cur); if (out.length === lines && words.join(' ').length > out.join(' ').length) out[lines - 1] = fit(ctx, out[lines - 1] + '…', max); return out; };
  const ago = (t) => { if (!t) return ''; const h = (Date.now() - t) / 3600e3; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm' : h < 24 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd'; };
  const SLIDE = 8000, FADE = 600;
  let slideStart = performance.now(), slideIdx = 0, lastList = [];
  function boardItems() {
    const mine = owner && owner.headlines ? owner.headlines : [], seen = new Set(mine.map(n => n.title));
    return [...mine.slice(0, 4), ...headlines.filter(n => !seen.has(n.title))].slice(0, 8);
  }
  function drawBoard() {
    const W = 1280, H = 720, now = performance.now(), list = boardItems();
    if (list.length !== lastList.length || (list[0] && lastList[0] && list[0].title !== lastList[0].title)) { lastList = list; if (slideIdx >= list.length) slideIdx = 0; }
    if (now - slideStart > SLIDE && list.length > 1) { slideStart = now; slideIdx = (slideIdx + 1) % list.length; }
    const t = now - slideStart, alpha = Math.min(1, t / FADE, Math.max(0, (SLIDE - t) / FADE)) ;
    const g0 = bx.createLinearGradient(0, 0, 0, H); g0.addColorStop(0, '#0d1824'); g0.addColorStop(1, '#070b11');
    bx.fillStyle = g0; bx.fillRect(0, 0, W, H); bx.textBaseline = 'middle'; bx.textAlign = 'left';
    /* header */
    bx.fillStyle = '#e9f2f6'; bx.font = '800 44px system-ui,sans-serif'; bx.fillText("SID'S BOARD", 48, 56);
    const clock = new Date().toLocaleTimeString('en-CA', { timeZone: 'America/Vancouver', hour: 'numeric', minute: '2-digit' });
    bx.fillStyle = '#7e96a4'; bx.font = '600 24px system-ui,sans-serif'; bx.fillText('VANCOUVER · ' + clock.toUpperCase(), 330, 58);
    if (owner && owner.summary) {
      const cr = owner.summary.crypto || {}, up = (cr.change24Pct || 0) >= 0, k = (v) => '$' + (v / 1000).toFixed(1) + 'k';
      bx.textAlign = 'right'; bx.font = '800 34px system-ui,sans-serif'; bx.fillStyle = up ? '#7ee0b3' : '#ff8a8a';
      bx.fillText(`Crypto ${k(cr.account || 0)} ${up ? '▲' : '▼'}${Math.abs(cr.change24Pct || 0).toFixed(1)}%`, W - 48, 46);
      bx.font = '600 21px system-ui,sans-serif'; bx.fillStyle = '#9fb3c1';
      bx.fillText(`Stocks ${k((owner.summary.stocks || {}).value || 0)} · all-time ${(cr.allTimeReturn || 0) >= 0 ? '+' : '−'}$${Math.round(Math.abs(cr.allTimeReturn || 0)).toLocaleString('en-CA')}`, W - 48, 80); bx.textAlign = 'left';
    }
    bx.fillStyle = 'rgba(255,255,255,0.08)'; bx.fillRect(48, 106, W - 96, 2);
    /* featured headline (carousel) */
    const n = list[slideIdx];
    if (!n) { bx.fillStyle = '#7e96a4'; bx.font = '500 34px system-ui,sans-serif'; bx.fillText('Loading the news…', 48, 300); }
    else {
      bx.save(); bx.globalAlpha = alpha; const dx = (1 - alpha) * (t < FADE ? 40 : -40);
      const hot = n.hot && n.hot.length;
      bx.fillStyle = hot ? '#ff6b7a' : '#4aa8e0'; bx.beginPath(); bx.roundRect(48 + dx, 136, 12, 300, 6); bx.fill();
      bx.font = '700 22px system-ui,sans-serif'; bx.fillStyle = hot ? '#ff9aa5' : '#8fc9ef';
      bx.fillText(`${(n.source || '').toUpperCase()}  ·  ${ago(n.time)} AGO${n.tags && n.tags.length ? '  ·  ' + n.tags.slice(0, 4).join('  ') : ''}${hot ? '  ·  ' + n.hot[0].toUpperCase() : ''}`, 84 + dx, 156);
      bx.font = '800 50px system-ui,sans-serif'; bx.fillStyle = '#f2f6f9';
      wrap(bx, n.title, W - 150, 3).forEach((ln, i) => bx.fillText(ln, 84 + dx, 222 + i * 62));
      if (n.summary) { bx.font = '400 26px system-ui,sans-serif'; bx.fillStyle = '#a9bac6'; wrap(bx, n.summary, W - 150, 2).forEach((ln, i) => bx.fillText(ln, 84 + dx, 418 + i * 36)); }
      bx.restore();
      /* slide timer + dots */
      bx.fillStyle = 'rgba(255,255,255,0.08)'; bx.fillRect(84, 500, W - 168, 4); bx.fillStyle = '#4aa8e0'; bx.fillRect(84, 500, (W - 168) * Math.min(1, t / SLIDE), 4);
      list.forEach((_, i) => { bx.fillStyle = i === slideIdx ? '#e9f2f6' : 'rgba(255,255,255,0.25)'; bx.beginPath(); bx.arc(W / 2 - (list.length - 1) * 14 + i * 28, 530, i === slideIdx ? 7 : 5, 0, Math.PI * 2); bx.fill(); });
    }
    /* up next */
    const next = list.length > 1 ? list[(slideIdx + 1) % list.length] : null;
    bx.fillStyle = 'rgba(255,255,255,0.05)'; bx.beginPath(); bx.roundRect(48, 566, W - 96, 58, 12); bx.fill();
    bx.font = '700 20px system-ui,sans-serif'; bx.fillStyle = '#7e96a4'; bx.fillText('UP NEXT', 70, 595);
    if (next) { bx.font = '600 24px system-ui,sans-serif'; bx.fillStyle = '#cfdbe3'; bx.fillText(fit(bx, next.title + '  —  ' + next.source, W - 300), 190, 595); }
    /* tickets */
    const open = jobs.map(j => status[j.id]).filter(Boolean), active = open.filter(x => !x.done);
    bx.font = '700 20px system-ui,sans-serif'; bx.fillStyle = '#7e96a4'; bx.fillText('TICKETS', 48, 668);
    bx.font = '600 22px system-ui,sans-serif'; bx.fillStyle = active.length ? '#ffc46b' : '#9fb3c1';
    bx.fillText(active.length ? `${active[0].id} · ${active[0].stageLabel}${active.length > 1 ? `  (+${active.length - 1} more)` : ''}` : (open.length ? `${open.length} done — all clear` : 'No open tickets — talk to Sid to open one'), 170, 668);
    bx.textAlign = 'right'; bx.fillStyle = '#ffc46b'; bx.font = '700 18px system-ui,sans-serif'; bx.fillText(badge.textContent.toUpperCase(), W - 48, 668); bx.textAlign = 'left';
    btex.needsUpdate = true;
    if (monitor && jobs.some(k => status[k.id] && !status[k.id].done)) { monitor.draw = drawJob; monitor.live = true; }
  }
  /* animate the carousel (~20 fps is plenty for a fade) */
  setInterval(() => { if (!document.hidden) drawBoard(); }, 50);

  /* ---------- headlines for everyone; live portfolio + briefing only when the owner code is in this browser ---------- */
  let headlines = [], owner = null, briefed = false, spokeBrief = false;
  async function loadNews() { try { const r = await fetch('/api/news'); if (r.ok) { headlines = (await r.json()).items || []; drawBoard(); } } catch (e) {} }
  async function loadOwner(withText) {
    if (!invite) return;
    try {
      const r = await fetch('/api/brief', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite, text: !!withText }) });
      if (!r.ok) { if (r.status === 403) owner = null; return; }
      const d = await r.json(); owner = { ...(owner || {}), ...d, brief: d.brief || (owner && owner.brief) }; drawBoard();
      if (withText && d.brief && !briefed) {
        briefed = true; sub.textContent = 'Owner mode — your portfolio and news are loaded';
        messages.push({ role: 'assistant', content: d.brief }); addMsg('assistant', d.brief);
        const s0 = d.summary, lead = d.pokes && d.pokes.length ? 'Heads up — ' + d.pokes[0] : `Crypto $${Math.round((s0.crypto || {}).account || 0).toLocaleString('en-CA')}, ${(s0.change24Pct || 0) >= 0 ? 'up' : 'down'} ${Math.abs(s0.change24Pct || 0).toFixed(1)}% today. Click me for the briefing.`;
        const tell = () => { if (avatar.ready) av('say', lead.length > 150 ? lead.slice(0, 147) + '…' : lead, 9); else setTimeout(tell, 1500); }; setTimeout(tell, 4500);
      }
    } catch (e) {}
  }
  loadNews(); setInterval(loadNews, 10 * 60e3);
  loadOwner(true); setInterval(() => loadOwner(false), 5 * 60e3);

  /* ---------- open / close ---------- */
  function setOpen(v) {
    open = v; panel.classList.toggle('open', v); launch.style.display = v ? 'none' : ''; tossBtn.style.display = v ? 'none' : '';
    if (v) { voice.unlock(); if (speakOn && owner && owner.brief && !spokeBrief) { spokeBrief = true; speakReply(owner.brief.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')); }
      if (!messages.length && invite) greet(); av('converse', true); av('sit', () => av('play', 'wave')); renderFoot(); }
    else { av('converse', false); if (voiceLoop) { voiceLoop = false; voice.stopListening(); voice.stopSpeaking(); } }
  }
  launch.onclick = () => setOpen(true); x.onclick = () => setOpen(false);

  /* status link: ?job=<token> */
  const tok = new URLSearchParams(location.search).get('job');
  if (tok && !jobs.some(j => j.token === tok)) { jobs.unshift({ token: tok, id: '' }); }
  (async () => {
    for (const j of jobs) { try { const r = await fetch('/api/job?token=' + encodeURIComponent(j.token)); if (r.ok) { const s = await r.json(); j.id = s.id; status[s.id] = s; if (s.done) announced.add(s.id); } } catch (e) {} }
    jobs = jobs.filter(j => j.id); LS.set('sre.jobs', jobs); renderTickets(); if (jobs.some(j => !status[j.id].done)) poll(); if (tok) setOpen(true);
  })();
  renderFoot(); drawBoard();

  const api = { open: () => setOpen(true), close: () => setOpen(false), send };
  window.__sre = api; return api;
}
