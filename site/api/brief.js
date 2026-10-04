/* POST /api/brief { invite, text?: false } — owner only. Live portfolio snapshot, chart read, relevant headlines,
   pokes, and (unless text:false) a short spoken-style briefing. Guests get 403; the portfolio never leaves for them. */
const { roleFor, rateLimited, sessionOk } = require('./_lib.js');
const { loadBrain } = require('./_brain.js');
const { ownerContext, OWNER_RULES } = require('./_owner.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('brief:' + ip, 20)) { res.status(429).json({ error: 'slow down a little' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const role = roleFor(body.invite);
  if (!role) { res.status(401).json({ error: 'invite_required' }); return; }
  if (role !== 'owner') { res.status(403).json({ error: 'owner_only' }); return; }
  if (!sessionOk(body.session)) { res.status(403).json({ error: 'locked' }); return; }
  try {
    const brain = await loadBrain('owner');
    const ctx = await ownerContext(brain);
    if (!ctx) { res.status(503).json({ error: 'portfolio not available', detail: brain.portfolioError || null }); return; }
    let brief = null;
    if (body.text !== false && process.env.OPENAI_API_KEY) {
      const order = (brain.portfolio.briefing && brain.portfolio.briefing.order || []).join(', ');
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', max_completion_tokens: 260, messages: [
          { role: 'system', content: OWNER_RULES + '\n\n' + ctx.text },
          { role: 'user', content: `Give me my briefing as you would say it out loud when I walk into the room: about 70 words, plain sentences, no lists. Write numbers as digits, like $109,000 and 0.2%. Order: ${order || 'total value, 24h change, biggest movers, goal progress, news'}. Start with the CRYPTO account value and its 24h change (that is the number he sees in his app), then one short clause for stocks; do not lead with the combined total. Mention at most two news items and say who reported them. If something is flagged as worth flagging now, lead with it. Do not tell me what to do.` },
        ] }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) brief = (d.choices[0].message.content || '').trim();
    }
    const s = ctx.snapshot;
    res.status(200).json({
      role, brief, pokes: ctx.pokes,
      summary: { crypto: s.crypto, stocks: s.stocks, grandTotal: s.grandTotal, total: s.grandTotal, change24Pct: s.crypto.change24Pct, cashToDeploy: s.cashToDeploy, asOf: s.asOf, notes: s.notes },
      holdings: s.holdings.map(h => ({ ticker: h.ticker, valueCad: h.valueCad, weightPct: h.weightPct, gainPct: h.gainPct, change24: h.change24, live: h.live })),
      btc: s.btc, goal: s.goal, charts: ctx.charts,
      headlines: ctx.headlines.map(n => ({ source: n.source, title: n.title, link: n.link, time: n.time, tags: n.tags, hot: n.hot, summary: n.summary })),
    });
  } catch (e) { res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
};
