/* Daily research digest: themed headlines from credible outlets + what Reddit is talking about, condensed by the LLM
   into a short brief the avatar can talk from. Public news only — nothing personal goes in or comes out. Cached for 3h. */
const { news, reddit } = require('./_market.js');

let memo = null, building = null;
const TTL = 3 * 3600e3;
const THEMES = ['crypto', 'markets', 'ai', 'space', 'energy', 'tesla'];

async function build() {
  const [items, posts] = await Promise.all([news(), reddit().catch(() => [])]);
  const byTheme = {}; for (const n of items) (byTheme[n.theme] ||= []).push(n);
  const lines = [];
  for (const t of THEMES) for (const n of (byTheme[t] || []).slice(0, t === 'crypto' ? 14 : 7)) lines.push(`[${t}] ${n.source}: ${n.title}${n.summary ? ' — ' + n.summary.slice(0, 160) : ''}`);
  const redditLines = posts.slice(0, 24).map(p => `r/${p.sub}: ${p.title}`);
  if (!process.env.OPENAI_API_KEY || !lines.length) return { generatedAt: Date.now(), text: '', themes: {}, sources: [] };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', max_completion_tokens: 900, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You condense market news for a long-term crypto and tech investor. Be factual, attribute claims to the outlet, no predictions, no advice. Reddit lines are retail sentiment, not facts.' },
        { role: 'user', content: `Headlines (newest first, by theme):\n${lines.join('\n')}\n\nReddit top posts today:\n${redditLines.join('\n') || '(unavailable)'}\n\nReturn JSON: {"crypto_mood": "bullish|bearish|mixed|quiet", "crypto_why": "one sentence", "markets_mood": "risk-on|risk-off|mixed|quiet", "markets_why": "one sentence", "themes": {"crypto": ["up to 3 short bullets with outlet names"], "markets": [], "ai": [], "space": [], "energy": [], "tesla": []}, "reddit_pulse": "one or two sentences on what retail is focused on, or empty", "watch": ["up to 3 things worth watching this week, with outlet names"]}` },
      ],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('digest llm ' + r.status);
  let j = {}; try { j = JSON.parse(d.choices[0].message.content); } catch (e) {}
  const out = [`Crypto mood: ${j.crypto_mood || 'n/a'} — ${j.crypto_why || ''}`, `Markets mood: ${j.markets_mood || 'n/a'} — ${j.markets_why || ''}`];
  for (const t of THEMES) if (j.themes && j.themes[t] && j.themes[t].length) out.push(`${t.toUpperCase()}: ` + j.themes[t].join(' | '));
  if (j.reddit_pulse) out.push(`Reddit pulse: ${j.reddit_pulse}`);
  if (j.watch && j.watch.length) out.push('Worth watching: ' + j.watch.join(' | '));
  return { generatedAt: Date.now(), ...j, redditCount: posts.length, text: out.join('\n') };
}

async function digest() {
  if (memo && Date.now() - memo.generatedAt < TTL) return memo;
  if (!building) building = build().then(v => { memo = v; return v; }).finally(() => { building = null; });
  try { return await building; } catch (e) { if (memo) return memo; throw e; }
}

module.exports = { digest };
