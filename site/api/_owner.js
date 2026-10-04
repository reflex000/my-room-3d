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
  const c = snap.crypto, st = snap.stocks;
  lines.push(`ACCOUNTS right now (CAD) — use these, they match his Wealthsimple app: CRYPTO account ${money(c.account)} (coins ${money(c.coins)} + cash available to trade ${money(c.cash)}), all-time return ${money(c.allTimeReturn)}${c.netDeposits ? ' on net deposits of ' + money(c.netDeposits) : ''} (${pct(c.allTimeReturnPct)}), last 24h ${pct(c.change24Pct, 2)}. STOCKS ${money(st.value)} (put in ${money(st.cost)}, ${pct(st.gainPct)}; USD positions converted at ${snap.usdCad}). Crypto + stocks together: ${money(snap.grandTotal)}. Separate cash in a savings account waiting to be deployed: ${money(snap.cashToDeploy)}. When he says "my portfolio" he usually means the crypto account; say which one you mean.`);
  lines.push('HOLDINGS (biggest first): ' + snap.holdings.map(h => `${h.ticker} ${h.quantity} = ${money(h.valueCad)} (${h.weightPct.toFixed(1)}% of crypto+stocks, all-time ${pct(h.gainPct)}, 24h ${pct(h.change24)}${h.status ? ', ' + h.status : ''}${h.live ? '' : ', last recorded price'})`).join('; ') + '.');
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
- When he asks "should I…" about money, do not bounce it back with questions and do not treat him like a customer at the desk. Answer in this shape, in a few sentences: (1) the arithmetic on his own position — what it would become (coins held, new average cost, share of portfolio, distance to his own targets); (2) the two or three ways people usually do it and the trade-off of each (for example all at once versus spread over weeks); (3) anything from his own skill or goals that bears on it, including where it conflicts; (4) "your call". At most one question at the end, and only if the answer truly depends on it.
- State chart facts as facts. Do not gloss them as "a good sign", "healthy", "room to grow" or "overbought so it will drop" — say what the number is and what it measures.
- Headlines are reported claims, not verified facts; say who reported it.
- This is not the SRE desk intake: no steering him toward "what do you need built" unless he brings up infrastructure.
- Keep it short and human. No tables in speech.`;

module.exports = { ownerContext, OWNER_RULES, money, pct };
