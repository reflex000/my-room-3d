/* POST /api/chat — the avatar's brain.
   body: { invite, messages:[{role:'user'|'assistant', content}], jobs:[token,…] }
   → { reply, actions:[…], job?:{ token, status }, mode }
   The model can only (a) talk, (b) animate the avatar, (c) submit a request that validates against a skill schema.
   It never sees credentials and never produces commands; execution is a separate pipeline (simulated in Step 1). */
const { MODE, inviteOk, rateLimited, readSkills, VALIDATORS, signJob, verifyJob, newJob, jobStatus } = require('./_lib.js');

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
    name: 'avatar_action',
    description: 'Make the 3D avatar perform a short gesture while you speak.',
    parameters: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ACTIONS } } } } },
];

function systemPrompt(jobTokens) {
  const { persona, skills } = readSkills();
  const jobs = (jobTokens || []).map(verifyJob).filter(Boolean).slice(-5).map(j => { const s = jobStatus(j); return `- ${s.id} (${s.skill}): ${s.stageLabel}${s.done ? ' — outputs: ' + JSON.stringify(s.outputs) : ''}`; });
  return [
    persona,
    '# Skills you can execute\n' + (skills.map(s => `## ${s.name}\n${s.text}`).join('\n\n') || '(none loaded)'),
    `# System context\nmode: ${MODE}\ndate: ${new Date().toISOString().slice(0, 10)}\nvisitor tickets:\n${jobs.join('\n') || '- none yet'}`,
  ].join('\n\n');
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
  if (!inviteOk(body.invite)) { res.status(401).json({ error: 'invite_required' }); return; }
  if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: 'no LLM key configured' }); return; }

  const history = (Array.isArray(body.messages) ? body.messages : []).slice(-24)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!history.length || history[history.length - 1].role !== 'user') { res.status(400).json({ error: 'last message must be from the user' }); return; }

  const messages = [{ role: 'system', content: systemPrompt(body.jobs) }, ...history];
  const actions = []; let job = null, reply = '';
  try {
    for (let round = 0; round < 4; round++) {
      const msg = await callOpenAI(messages);
      messages.push(msg);
      if (!msg.tool_calls || !msg.tool_calls.length) { reply = msg.content || ''; break; }
      for (const tc of msg.tool_calls) {
        let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
        let result;
        if (tc.function.name === 'avatar_action') {
          if (ACTIONS.includes(args.action)) actions.push(args.action);
          result = { ok: true };
        } else if (tc.function.name === 'submit_request') {
          const validate = VALIDATORS[args.skill];
          if (!validate) result = { ok: false, errors: ['unknown skill'] };
          else if (job) result = { ok: false, errors: ['one request per message'] };
          else {
            const v = validate(args.params);
            if (v.errors) result = { ok: false, errors: v.errors };
            else { const j = newJob(args.skill, v.params); job = { token: signJob(j), status: jobStatus(j) }; result = { ok: true, ticket: j.id, mode: MODE, pipeline: job.status.stages }; }
          }
        } else result = { ok: false, errors: ['unknown tool'] };
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    res.status(200).json({ reply: reply || (job ? `Ticket ${job.status.id} ban gaya — kaam pe lagta hoon.` : '…'), actions, job, mode: MODE });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
};
