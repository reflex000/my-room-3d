/* Everything the avatar knows when it is talking to Sid himself: live portfolio snapshot, chart read, relevant news,
   and the pokes worth interrupting him for. Built from the private brain repo + public market data. Owner only. */
const { snapshot, charts, news, relevantNews } = require('./_market.js');

const money = (v) => '$' + Math.round(v).toLocaleString('en-CA');
const pct = (v, d = 1) => v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
const ago = (t) => { if (!t) return ''; const h = (Date.now() - t) / 3600e3; return h < 1 ? Math.max(1, Math.round(h * 60)) + 'm ago' : h < 24 ? Math.round(h) + 'h ago' : Math.round(h / 24) + 'd ago'; };

async function ownerContext(brain) {
  const p = brain.portfolio; if (!p) return null;
  const [snap, ch, allNews] = await Promise.all([snapshot(p), charts(p).catch(() => ({})), news().catch(() => [])]);
  const rel = relevantNews(allNews, p, brain.watchlist).slice(0, 8);

  /* pokes: things worth saying before he asks */
  const a = snap.alerts || {}, pokes = [];
  if (snap.change24Pct != null && Math.abs(snap.change24Pct) >= (a.portfolio_move_pct_24h || 7)) pokes.push(`Portfolio is ${pct(snap.change24Pct)} in 24 hours.`);
  for (const h of snap.holdings) if (h.change24 != null && h.valueCad > 500 && Math.abs(h.change24) >= (a.move_pct_24h || 10)) pokes.push(`${h.ticker} is ${pct(h.change24)} in 24 hours.`);
  for (const n of rel) if (n.hot.length && n.time && Date.now() - n.time < 18 * 3600e3) pokes.push(`${n.tags.join('/')}: "${n.title}" (${n.source}, ${ago(n.time)})`);

  const lines = [];
  lines.push(`PORTFOLIO right now (CAD): total ${money(snap.total)}, put in ${money(snap.cost)}, gain ${money(snap.gain)} (${pct(snap.gainPct)}), last 24h ${pct(snap.change24Pct, 2)}. Crypto ${money(snap.cryptoValue)}, stocks ${money(snap.stockValue)}. Cash in savings waiting to be deployed: ${money(snap.cashToDeploy)}.`);
  lines.push('HOLDINGS (biggest first): ' + snap.holdings.map(h => `${h.ticker} ${h.quantity} = ${money(h.valueCad)} (${h.weightPct.toFixed(1)}% of portfolio, all-time ${pct(h.gainPct)}, 24h ${pct(h.change24)}${h.status ? ', ' + h.status : ''}${h.live ? '' : ', last recorded price'})`).join('; ') + '.');
  if (snap.btc) lines.push(`BTC: price ${money(snap.btc.price)} CAD; he owns ${snap.btc.owned}; ${snap.btc.toOneBtc.toFixed(3)} BTC short of one full coin; his 200,000 CAD trigger is ${pct(snap.btc.toTriggerPct, 0)} away.`);
  if (snap.goal) lines.push(`GOAL: ${money(snap.goal.monthly)}/month from investments within 5–8 years. Rule-of-thumb scale only (not a plan): that income needs about ${money(snap.goal.at4pct)} at a 4% withdrawal rate; portfolio plus cash is ${snap.goal.progressAt4pct.toFixed(1)}% of that.`);
  const chartLines = Object.entries(ch).map(([t, c]) => `${t}: ${c.aboveSma200 ? 'above' : 'below'} its 200-day average and ${c.aboveSma50 ? 'above' : 'below'} its 50-day; trend ${c.trend || 'n/a'}; RSI ${c.rsi14 == null ? 'n/a' : c.rsi14.toFixed(0)}; ${pct(c.drawdownFromHighPct, 0)} from its 1-year high; 7d ${pct(c.change7dPct)}, 30d ${pct(c.change30dPct)}, 90d ${pct(c.change90dPct)}`);
  if (chartLines.length) lines.push('CHARTS (daily, 1 year — these describe what has happened, they do not predict): ' + chartLines.join(' | ') + '.');
  if (rel.length) lines.push('NEWS touching what he holds or watches (newest feeds, headline only — treat as reported, not verified):\n' + rel.map(n => `- [${n.source}, ${ago(n.time)}] ${n.title} (${n.tags.join(', ')})`).join('\n'));
  if (snap.notes.length) lines.push('DATA NOTES: ' + snap.notes.join('; ') + '.');
  if (pokes.length) lines.push('WORTH FLAGGING NOW: ' + pokes.join(' '));
  return { snapshot: snap, charts: ch, headlines: rel, pokes, text: lines.join('\n') };
}

const OWNER_RULES = `# Talking to Sid himself (owner mode)
You are talking to the real Sid, your owner — not a visitor. Be his thinking partner on his own money: the companion he does not have for these decisions.
- You have his live portfolio, chart read and relevant news below. Use the actual numbers; do not make any up. If a figure is marked "last recorded price", say so when it matters.
- Think the way he does (see the investing skill): technology first, BTC as the anchor, an SRE's eye for single points of failure and what breaks under load, calm and positive.
- You may: report values and P&L, describe what the charts and news show, lay out options with their trade-offs, do arithmetic on his own positions, quote what named sources say, point out where a plan conflicts with something he told you, and name risks he may be missing.
- You may not: tell him to buy, sell or size anything, or predict where a price will go. If he asks "should I…", give him the options, the numbers and the considerations, say plainly that the call is his, and stop there. No lecture.
- Headlines are reported claims, not verified facts; say who reported it.
- Keep it short and human. No tables in speech.`;

module.exports = { ownerContext, OWNER_RULES, money, pct };
