/* POST /api/chat — the avatar's brain.
   body: { invite, messages:[{role:'user'|'assistant', content}], jobs:[token,…] }
   → { reply, actions:[…], job?:{ token, status }, mode }
   The model can only (a) talk, (b) animate the avatar, (c) submit a request that validates against a skill schema.
   It never sees credentials and never produces commands; execution is a separate pipeline (simulated in Step 1). */
const { MODE, roleFor, sessionOk, rateLimited, readSkills, VALIDATORS, signJob, verifyJob, newJob, jobStatus } = require('./_lib.js');
const { loadBrain, hasBrain } = require('./_brain.js');
const { ownerContext, OWNER_RULES } = require('./_owner.js');
const { isPersonal } = require('./_personal.js');
const { digest } = require('./_digest.js');

const MODELS = (process.env.OPENAI_MODEL ? [process.env.OPENAI_MODEL] : []).concat(['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini']);
const ACTIONS = ['wave', 'nod', 'no', 'think', 'thumbs', 'laugh', 'shrug', 'drink', 'stretch'];

const TOOLS = [
  { type: 'function', function: {
    name: 'submit_request',
    description: 'Submit a fully specified, visitor-confirmed infrastructure request. The server validates it against the skill schema and returns a ticket or a list of errors to fix.',
    parameters: { type: 'object', required: ['skill', 'params'], properties: {
      skill: { type: 'string', enum: Object.keys(VALIDATORS) },
      params: { type: 'object', description: 'Parameters exactly as described in the skill file.', additionalProperties: true },
    } } } },
  { type: 'function', function: {
    name: 'request_unlock',
    description: 'Owner only, private mode locked: ask the client to collect his passphrase (he says it out loud or types it). Call this when he asks about his own portfolio, holdings, money, goals or other personal details, or says "show me on the board". Do not ask him to type the passphrase into the chat yourself and never repeat it.',
    parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: {
    name: 'avatar_action',
    description: 'Make the 3D avatar perform a short gesture while you speak.',
    parameters: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ACTIONS } } } } },
];

/* read the digest through our own CDN-cached endpoint (shared across instances; this function's memory is not) */
async function digestText(host) {
  try {
    let d = null;
    if (host) { const r = await fetch(`https://${host}/api/digest`, { signal: AbortSignal.timeout(4000) }).catch(() => null); if (r && r.ok) d = await r.json().catch(() => null); }
    if (!d) d = await Promise.race([digest(), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
    return d && d.text ? `# Today's research digest (public news + Reddit pulse; ${new Date(d.generatedAt).toISOString().slice(0, 16)}Z)
Use this when people ask what is happening in crypto, markets, AI, space, energy or Tesla. Attribute to the outlet; Reddit is sentiment, not fact; no predictions.
${d.text}` : '';
  } catch (e) { return ''; }
}

async function systemPrompt(jobTokens, voice, role, unlocked, host) {
  const { persona, skills } = readSkills();                      // desk rules + executable playbooks that ship with the site (public-safe)
  const jobs = (jobTokens || []).map(verifyJob).filter(Boolean).slice(-5).map(j => { const s = jobStatus(j); return `- ${s.id} (${s.skill}): ${s.stageLabel}${s.done ? ' — outputs: ' + JSON.stringify(s.outputs) : ''}`; });
  /* private brain: who Sid is + the skills this caller is allowed to hear; owner also gets his live portfolio */
  let brainText = '', ownerText = '';
  if (hasBrain()) {
    try {
      const brain = await loadBrain(role === 'owner' && !unlocked ? 'guest' : role);   // owner-only skills (trading style, family) need the passphrase too
      brainText = [brain.persona && '# Who you are (Sid)\n' + brain.persona, ...brain.skills.map(k => `# Skill: ${k.name}\n${k.text}`)].filter(Boolean).join('\n\n');
      if (role === 'owner' && unlocked) { const ctx = await ownerContext(brain); if (ctx) ownerText = OWNER_RULES + '\n\n# Live data (private mode is ON — he unlocked it with his passphrase)\n' + ctx.text; }
      else if (role === 'owner') ownerText = `# Talking to Sid himself — private mode is LOCKED
You are talking to the real Sid (owner code), but his personal data is locked. You do not have his portfolio numbers right now and must not guess them.
If he asks about his own holdings, portfolio value, gains, money, goals, family or anything personal, or says "show me on the board": call the request_unlock tool and tell him in one short sentence to say his passphrase. Never ask for it in any other way and never repeat it.
General knowledge (how markets, crypto, stocks, trading strategies work), news and chat are fine without unlocking.`;
    } catch (e) { brainText = ''; }
  }
  return [
    persona,
    brainText,
    '# Things this desk can execute\n' + (skills.map(s => `## ${s.name}\n${s.text}`).join('\n\n') || '(none loaded)'),
    ownerText,
    await digestText(host),
    `# System context\nmode: ${MODE}\ncaller: ${role}\ndate: ${new Date().toISOString().slice(0, 10)}\nvisitor tickets:\n${jobs.join('\n') || '- none yet'}`,
    voice ? '# Voice conversation\nThe visitor is talking to you out loud and your reply will be spoken in your voice. Answer the way you would say it across a desk: one or two short sentences, contractions, no lists, no emoji, no symbols or markdown, numbers the way people say them. Their words come from speech recognition, so forgive small transcription mistakes and ask if something is unclear.' : '',
  ].filter(Boolean).join('\n\n');
}

async function callOpenAI(messages) {
  let lastErr = null;
  for (const model of MODELS) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', max_completion_tokens: 900 }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return data.choices[0].message;
    lastErr = (data.error && (data.error.code || data.error.message)) || ('http ' + r.status);
    if (!(r.status === 404 || r.status === 403 || /model/i.test(String(lastErr)))) break;   // only fall through on model-availability errors
  }
  throw new Error('llm: ' + lastErr);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited(ip)) { res.status(429).json({ error: 'slow down a little' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const role = roleFor(body.invite);
  if (!role) { res.status(401).json({ error: 'invite_required' }); return; }
  if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: 'no LLM key configured' }); return; }

  const history = (Array.isArray(body.messages) ? body.messages : []).slice(-24)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!history.length || history[history.length - 1].role !== 'user') { res.status(400).json({ error: 'last message must be from the user' }); return; }

  /* locked owner asking about his own money/plans: ask for the passphrase straight away (deterministic, no model call) */
  const lastUser = history[history.length - 1].content;
  if (role === 'owner' && !sessionOk(body.session) && isPersonal(lastUser)) {
    res.status(200).json({ reply: "That's personal — say your passphrase and I'll pull it up.", actions: ['ask_passphrase'], job: null, mode: MODE, role });
    return;
  }

  const messages = [{ role: 'system', content: await systemPrompt(body.jobs, !!body.voice, role, role === 'owner' && sessionOk(body.session), req.headers.host) }, ...history];
  const actions = []; let job = null, reply = '';
  try {
    for (let round = 0; round < 4; round++) {
      const msg = await callOpenAI(messages);
      messages.push(msg);
      if (!msg.tool_calls || !msg.tool_calls.length) { reply = msg.content || ''; break; }
      for (const tc of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
        let result;
        if (tc.function.name === 'request_unlock') {
          if (role === 'owner') actions.push('ask_passphrase');
          result = role === 'owner' ? { ok: true, note: 'the client is now listening for his passphrase' } : { ok: false, errors: ['not available'] };
        } else if (tc.function.name === 'avatar_action') {
          if (ACTIONS.includes(args.action)) actions.push(args.action);
          result = { ok: true };
        } else if (tc.function.name === 'submit_request') {
          const validate = VALIDATORS[args.skill];
          if (!validate) result = { ok: false, errors: ['unknown skill'] };
          else if (job) result = { ok: false, errors: ['one request per message'] };
          else {
            const v = validate(args.params, { ip });
            if (v.errors) result = { ok: false, errors: v.errors };
            else { const j = newJob(args.skill, v.params); job = { token: signJob(j), status: jobStatus(j) }; result = { ok: true, ticket: j.id, mode: MODE, pipeline: job.status.stages }; }
          }
        } else result = { ok: false, errors: ['unknown tool'] };
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    /* belt and braces: if the locked owner is being asked for his passphrase, make sure the client captures the next
       message as the passphrase (so it never reaches this model) even if the model forgot to call the tool */
    if (role === 'owner' && !sessionOk(body.session) && /pass\s?phrase/i.test(reply) && !actions.includes('ask_passphrase')) actions.push('ask_passphrase');
    res.status(200).json({ reply: reply || (job ? `Ticket ${job.status.id} is open — I'm on it.` : '…'), actions, job, mode: MODE, role });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
};
