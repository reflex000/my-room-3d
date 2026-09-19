/* SRE desk — talk to the avatar, file infra requests, watch the job on the room's main monitor and ops board.
   Backend: /api/chat (LLM + skills + validation) and /api/job (ticket status). Step 1 runs a simulated pipeline.
   Usage (room.js): import('./sre.js').then(m => m.initSRE({ T, stage, avatar, screens })); */

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
  .sre-foot button:disabled{opacity:.5;cursor:default}`;
  document.head.appendChild(css);

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const launch = el('button', 'sre-launch'); launch.type = 'button'; launch.innerHTML = '💬 Talk to Sid · <b>SRE desk</b>';
  const panel = el('section', 'sre-panel'); panel.setAttribute('aria-label', 'SRE desk chat');
  const head = el('div', 'sre-head'); const title = el('h2', null, 'Sid · SRE desk'); const badge = el('span', 'sre-badge', 'simulated'); const x = el('button', 'sre-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  head.append(title, badge, x);
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
        invite = v; LS.set('sre.invite', invite); addMsg('system', 'Code accepted ✓'); renderFoot(); if (!messages.length) greet();
        if (pending) { const t = pending; pending = null; send(t); }
      };
      b.onclick = go; i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      foot.append(i, b); return;
    }
    const t = el('textarea'); t.rows = 2; t.placeholder = 'e.g. "I need a server to try out my app"'; t.maxLength = 1500; t.setAttribute('aria-label', 'Message');
    const b = el('button', null, 'Send'); b.type = 'button'; b.disabled = busy;
    const go = () => { const v = t.value.trim(); if (!v || busy) return; t.value = ''; send(v); };
    b.onclick = go; t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    foot.append(t, b); if (open) t.focus();
  }

  function greet() { addMsg('system', 'You walked into Sid\'s SRE shop. Ask for what you need — he will ask the questions an SRE would.'); }

  /* ---------- chat ---------- */
  const short = (s) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > 110 ? s.slice(0, 107) + '…' : s; };
  async function send(text) {
    messages.push({ role: 'user', content: text }); addMsg('user', text);
    busy = true; renderFoot(); const dots = addMsg('system', 'Sid is thinking…');
    av('converse', true); av('play', 'think', 6);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ invite, messages, jobs: jobs.map(j => j.token) }) });
      const data = await r.json().catch(() => ({}));
      dots.remove();
      if (r.status === 401) { invite = ''; LS.set('sre.invite', ''); messages.pop(); pending = text; addMsg('system', 'That invite code did not work — enter it again below and I will resend your message.'); }
      else if (!r.ok) { messages.pop(); addMsg('system', 'Hmm, connection issue (' + (data.error || r.status) + '). Try again.'); av('play', 'shrug'); }
      else {
        badge.textContent = data.mode || 'simulated';
        messages.push({ role: 'assistant', content: data.reply }); addMsg('assistant', data.reply);
        av('say', short(data.reply)); av('play', (data.actions && data.actions[0]) || 'talk', data.actions && data.actions[0] ? undefined : Math.min(6, 2 + data.reply.length * 0.04));
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

  /* ---------- ops board on the back wall (child of the avatar group so it survives the baked-GLB swap) ---------- */
  const bc = document.createElement('canvas'); bc.width = 1024; bc.height = 640; const bx = bc.getContext('2d');
  const btex = new T.CanvasTexture(bc); btex.colorSpace = T.SRGBColorSpace; btex.anisotropy = 8;
  const board = new T.Mesh(new T.PlaneGeometry(1.0, 0.625), new T.MeshBasicMaterial({ map: btex, toneMapped: false })); board.name = 'tickets_board';
  const frame = new T.Mesh(new T.BoxGeometry(1.06, 0.685, 0.03), new T.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.6 })); frame.name = 'tickets_board_frame'; frame.position.z = -0.018; board.add(frame);
  board.position.set(2.05, 1.66, -1.74); avatar.group.add(board);
  function drawBoard() {
    bx.fillStyle = '#0b1219'; bx.fillRect(0, 0, 1024, 640);
    bx.fillStyle = '#e9f2f6'; bx.font = '700 44px system-ui,sans-serif'; bx.textBaseline = 'middle'; bx.fillText('OPS BOARD', 40, 56);
    bx.font = '600 22px system-ui,sans-serif'; bx.fillStyle = '#ffc46b'; bx.textAlign = 'right'; bx.fillText(badge.textContent.toUpperCase(), 984, 56); bx.textAlign = 'left';
    const list = jobs.map(j => status[j.id]).filter(Boolean).slice(0, 5);
    if (!list.length) { bx.fillStyle = '#7e96a4'; bx.font = '400 30px system-ui,sans-serif'; bx.fillText('No tickets yet — talk to Sid to open one.', 40, 330); }
    list.forEach((s, i) => {
      const y = 110 + i * 102; bx.fillStyle = '#132836'; bx.beginPath(); bx.roundRect(32, y, 960, 88, 14); bx.fill();
      bx.fillStyle = '#9fd0ff'; bx.font = '700 28px ui-monospace,Consolas,monospace'; bx.fillText(s.id, 52, y + 30);
      bx.fillStyle = '#e9f2f6'; bx.font = '500 24px system-ui,sans-serif'; bx.fillText(`${s.skill} · ${s.params.vm_size || ''} · ${s.params.region || ''}`, 250, y + 30);
      bx.fillStyle = s.done ? '#7ee0b3' : '#ffc46b'; bx.textAlign = 'right'; bx.fillText(s.done ? 'DONE' : s.stageLabel, 972, y + 30); bx.textAlign = 'left';
      bx.fillStyle = '#0b1219'; bx.fillRect(52, y + 58, 920, 12); bx.fillStyle = '#3fb98f'; bx.fillRect(52, y + 58, 920 * s.progress, 12);
    });
    btex.needsUpdate = true;
    if (monitor && jobs.some(k => status[k.id] && !status[k.id].done)) { monitor.draw = drawJob; monitor.live = true; }
  }

  /* ---------- open / close ---------- */
  function setOpen(v) {
    open = v; panel.classList.toggle('open', v); launch.style.display = v ? 'none' : ''; tossBtn.style.display = v ? 'none' : '';
    if (v) { if (!messages.length && invite) greet(); av('converse', true); av('sit', () => av('play', 'wave')); renderFoot(); }
    else av('converse', false);
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
