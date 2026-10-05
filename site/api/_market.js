/* Market data for the owner's briefing: live prices (CoinGecko for crypto, Yahoo chart endpoint for stocks),
   USD→CAD, simple chart indicators, and news headlines from public RSS feeds. Everything is cached in memory and
   every source is optional — if one fails the snapshot falls back to the last recorded values and says so. */
const mem = new Map();
async function cached(key, ttlMs, fn) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  try { const v = await fn(); mem.set(key, { t: Date.now(), v }); return v; }
  catch (e) { if (hit) return hit.v; throw e; }
}
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; my-room-3d/1.0)', accept: 'application/json,text/xml,*/*' };
const getJson = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status); return r.json(); };

/* ---------- prices ---------- */
const cryptoPrices = (ids) => cached('cg:' + ids.join(','), 60e3, async () =>
  getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=cad&include_24hr_change=true`));

const stockQuote = (symbol) => cached('yq:' + symbol, 5 * 60e3, async () => {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  const m = j.chart.result[0].meta;
  return { price: m.regularMarketPrice, prev: m.chartPreviousClose || m.previousClose, currency: m.currency };
});

const usdCad = () => cached('fx', 6 * 3600e3, async () => (await getJson('https://api.frankfurter.app/latest?from=USD&to=CAD')).rates.CAD).catch(() => 1.38);

const yahooSymbol = (h) => h.yahoo || (h.exchange === 'TSX' ? h.ticker.replace(/\.TO$/, '') + '.TO' : h.exchange === 'TSXV' ? h.ticker + '.V' : h.ticker);

/* ---------- portfolio snapshot ---------- */
async function snapshot(portfolio) {
  const hs = portfolio.holdings || [], fx = await usdCad(), notes = [];
  const ids = hs.filter(h => h.type === 'crypto' && h.coingecko_id).map(h => h.coingecko_id);
  let cg = {}; try { if (ids.length) cg = await cryptoPrices(ids); } catch (e) { notes.push('crypto prices unavailable — showing last recorded values'); }
  const rows = await Promise.all(hs.map(async (h) => {
    const toCad = h.currency === 'USD' ? fx : 1;
    let price = null, change24 = null, live = false;
    if (h.type === 'crypto' && cg[h.coingecko_id]) { price = cg[h.coingecko_id].cad; change24 = cg[h.coingecko_id].cad_24h_change; live = true; }
    else if (h.type === 'stock' && h.status !== 'suspended') {
      try { const q = await stockQuote(yahooSymbol(h)); if (q.price) { price = q.price; change24 = q.prev ? (q.price / q.prev - 1) * 100 : null; live = true; } } catch (e) {}
    }
    if (price == null) price = h.quantity ? h.value_at_capture / h.quantity : 0;
    const value = price * h.quantity, cost = h.cost_basis;
    return { ticker: h.ticker, name: h.name, type: h.type, currency: h.currency, quantity: h.quantity, price, live, change24,
      value, cost, gain: value - cost, gainPct: cost ? (value / cost - 1) * 100 : null, valueCad: value * toCad, costCad: cost * toCad, status: h.status || null };
  }));
  const total = rows.reduce((a, r) => a + r.valueCad, 0), cost = rows.reduce((a, r) => a + r.costCad, 0);
  const prev = rows.reduce((a, r) => a + (r.change24 == null ? r.valueCad : r.valueCad / (1 + r.change24 / 100)), 0);
  rows.forEach(r => { r.weightPct = total ? r.valueCad / total * 100 : 0; });
  const stale = rows.filter(r => !r.live && r.status !== 'suspended').map(r => r.ticker);
  if (stale.length) notes.push('no live price for: ' + stale.join(', '));
  const movers = rows.filter(r => r.change24 != null && r.valueCad > 200).sort((a, b) => Math.abs(b.change24) - Math.abs(a.change24)).slice(0, 4);
  /* accounts, the way the app shows them */
  const ca = (portfolio.accounts && portfolio.accounts.crypto) || {};
  const cryptoCoins = rows.filter(r => r.type === 'crypto').reduce((a, r) => a + r.valueCad, 0);
  const cryptoCost = rows.filter(r => r.type === 'crypto').reduce((a, r) => a + r.costCad, 0);
  const cryptoCash = ca.cash_cad || 0, cryptoAccount = cryptoCoins + cryptoCash;
  const cryptoReturn = ca.net_deposits_cad ? cryptoAccount - ca.net_deposits_cad : cryptoCoins - cryptoCost;
  const cryptoPrev = rows.filter(r => r.type === 'crypto').reduce((a, r) => a + (r.change24 == null ? r.valueCad : r.valueCad / (1 + r.change24 / 100)), 0) + cryptoCash;
  const stockRows = rows.filter(r => r.type === 'stock'), stockValue = stockRows.reduce((a, r) => a + r.valueCad, 0), stockCost = stockRows.reduce((a, r) => a + r.costCad, 0);
  const grand = cryptoAccount + stockValue;
  const btc = rows.find(r => r.ticker === 'BTC'), g = portfolio.goals || {};
  const monthly = g.freedom_number && g.freedom_number.monthly_income_cad;
  return {
    asOf: new Date().toISOString(), currency: 'CAD', usdCad: +fx.toFixed(4),
    total, cost, gain: total - cost, gainPct: cost ? (total / cost - 1) * 100 : null, change24Pct: prev ? (total / prev - 1) * 100 : null,
    cryptoValue: rows.filter(r => r.type === 'crypto').reduce((a, r) => a + r.valueCad, 0), stockValue: rows.filter(r => r.type === 'stock').reduce((a, r) => a + r.valueCad, 0),
    cashToDeploy: g.cash_to_deploy_cad || 0,
    crypto: { account: cryptoAccount, coins: cryptoCoins, cash: cryptoCash, netDeposits: ca.net_deposits_cad || null, allTimeReturn: cryptoReturn,
              allTimeReturnPct: ca.net_deposits_cad ? cryptoReturn / ca.net_deposits_cad * 100 : (cryptoCost ? cryptoReturn / cryptoCost * 100 : null), change24Pct: cryptoPrev ? (cryptoAccount / cryptoPrev - 1) * 100 : null },
    stocks: { value: stockValue, cost: stockCost, gain: stockValue - stockCost, gainPct: stockCost ? (stockValue / stockCost - 1) * 100 : null },
    grandTotal: grand,
    holdings: rows.sort((a, b) => b.valueCad - a.valueCad), movers,
    btc: btc ? { price: btc.price, owned: btc.quantity, toOneBtc: Math.max(0, 1 - btc.quantity), trigger: 200000, toTriggerPct: (200000 / btc.price - 1) * 100 } : null,
    goal: monthly ? { monthly, yearly: monthly * 12, at4pct: monthly * 12 / 0.04, at3pct: monthly * 12 / 0.03, progressAt4pct: (grand + (g.cash_to_deploy_cad || 0)) / (monthly * 12 / 0.04) * 100 } : null,
    alerts: portfolio.alerts || {}, notes,
  };
}

/* ---------- chart indicators (daily closes, 1 year) ---------- */
const sma = (a, n) => a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null;
function rsi(a, n = 14) {
  if (a.length <= n) return null; let g = 0, l = 0;
  for (let i = a.length - n; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
const indicators = (id) => cached('ind:' + id, 60 * 60e3, async () => {
  const j = await getJson(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=cad&days=365&interval=daily`);
  const c = j.prices.map(p => p[1]), last = c[c.length - 1], hi = Math.max(...c), lo = Math.min(...c), s50 = sma(c, 50), s200 = sma(c, 200);
  const pct = (n) => c.length > n ? (last / c[c.length - 1 - n] - 1) * 100 : null;
  return { price: last, sma50: s50, sma200: s200, aboveSma50: s50 ? last > s50 : null, aboveSma200: s200 ? last > s200 : null,
    trend: s50 && s200 ? (s50 > s200 ? 'up (50-day above 200-day)' : 'down (50-day below 200-day)') : null,
    rsi14: rsi(c), high1y: hi, low1y: lo, drawdownFromHighPct: (last / hi - 1) * 100, change7dPct: pct(7), change30dPct: pct(30), change90dPct: pct(90) };
});
async function charts(portfolio, max = 5) {
  const top = (portfolio.holdings || []).filter(h => h.type === 'crypto' && h.coingecko_id).sort((a, b) => b.value_at_capture - a.value_at_capture).slice(0, max), out = {};
  for (const h of top) { try { out[h.ticker] = await indicators(h.coingecko_id); } catch (e) { /* rate limited: skip, cached next time */ } }
  return out;
}

/* ---------- news (public RSS) ---------- */
/* themes Sid follows; every feed is public. RSS (<item>) and Atom (<entry>) are both parsed. */
const FEEDS = [
  ['crypto', 'CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
  ['crypto', 'Cointelegraph', 'https://cointelegraph.com/rss'],
  ['crypto', 'Decrypt', 'https://decrypt.co/feed'],
  ['crypto', 'The Block', 'https://www.theblock.co/rss.xml'],
  ['markets', 'CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
  ['markets', 'MarketWatch', 'https://feeds.content.dowjones.io/public/rss/mw_topstories'],
  ['ai', 'TechCrunch', 'https://techcrunch.com/category/artificial-intelligence/feed/'],
  ['ai', 'The Verge', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
  ['space', 'SpaceNews', 'https://spacenews.com/feed/'],
  ['energy', 'World Nuclear News', 'https://www.world-nuclear-news.org/rss'],
  ['tesla', 'Electrek', 'https://electrek.co/guides/tesla/feed/'],
];
const REDDIT = ['Bitcoin', 'CryptoCurrency', 'stocks', 'investing'];
const unescape = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&#8217;|&#x27;/g, "'").replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8211;|&#8212;/g, '—').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
function parseFeed(xml, max = 15) {
  const atom = !/<item[\s>]/.test(xml) && /<entry[\s>]/.test(xml), out = [];
  for (const it of xml.split(atom ? /<entry[\s>]/ : /<item[\s>]/).slice(1, max + 1)) {
    const pick = (tag) => { const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(it); return m ? unescape(m[1]) : ''; };
    const link = atom ? ((/<link[^>]*href="([^"]+)"/.exec(it) || [])[1] || '') : pick('link');
    const t = Date.parse(pick(atom ? 'updated' : 'pubDate') || pick('published'));
    const title = pick('title');
    if (title && link) out.push({ title: title.slice(0, 180), link: link.replace(/&amp;/g, '&'), time: isNaN(t) ? null : t, summary: (pick('description') || pick('summary') || pick('content')).slice(0, 240) });
  }
  return out;
}
async function getFeed(url) { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.text(); }
const news = () => cached('news', 10 * 60e3, async () => {
  const all = [];
  await Promise.all(FEEDS.map(async ([theme, source, url]) => {
    try { for (const n of parseFeed(await getFeed(url))) all.push({ ...n, source, theme }); } catch (e) {}
  }));
  const seen = new Set(), dayAgo = Date.now() - 36 * 3600e3;
  return all.filter(n => { const k = n.title.toLowerCase().slice(0, 50); if (seen.has(k)) return false; seen.add(k); return !n.time || n.time > dayAgo - 48 * 3600e3; })
    .sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 120);
});
/* a balanced pick for the board: newest per theme, round-robin so crypto does not drown everything */
function mixThemes(items, n = 12, order = ['crypto', 'markets', 'ai', 'space', 'energy', 'tesla']) {
  const by = {}; for (const it of items) (by[it.theme] ||= []).push(it);
  const out = []; for (let i = 0; out.length < n && i < 20; i++) for (const t of order) { const x = (by[t] || [])[i]; if (x && out.length < n) out.push(x); }
  return out;
}
/* what retail is talking about (titles only; Reddit is sentiment, not a source of facts) */
const reddit = () => cached('reddit', 60 * 60e3, async () => {
  const out = [];
  for (const sub of REDDIT) {                          // one at a time: Reddit rate-limits parallel requests
    try { for (const n of parseFeed(await getFeed(`https://www.reddit.com/r/${sub}/top/.rss?t=day`), 10)) if (!/daily (discussion|thread)|weekly/i.test(n.title)) out.push({ sub, title: n.title, link: n.link }); } catch (e) {}
    await new Promise(r => setTimeout(r, 1200));
  }
  if (!out.length) throw new Error('reddit unavailable');   // keep the last good copy in the cache
  return out;
});

/* headlines that touch what he holds or watches, plus alert keywords */
const AMBIGUOUS = new Set(['COIN', 'LINK', 'WELL', 'BEN', 'MAL', 'III', 'AC', 'MP', 'GD', 'IO', 'NOK', 'BLK', 'GFS', 'IVV']);   // tickers that are also ordinary words / too short
const STOP = new Set(['the', 'usa', 'air', 'well', 'general', 'advanced', 'quantum', 'rocket', 'global', 'imperial', 'franklin', 'apple', 'amazon']);
const ALIAS = { BTC: ['bitcoin'], ETH: ['ethereum', 'ether'], XRP: ['ripple'], LINK: ['chainlink'], COIN: ['coinbase'], DOGE: ['dogecoin'], IO: ['io.net'], GRT: ['the graph'], ONDO: ['ondo'] };
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function relevantNews(items, portfolio, watchlist) {
  const things = [];
  const add = (h) => {
    if (!h || !h.ticker) return; const pats = [];
    if (h.ticker.length >= 3 && !AMBIGUOUS.has(h.ticker)) pats.push(new RegExp('(^|[^A-Za-z0-9])\\$?' + esc(h.ticker) + '([^A-Za-z0-9]|$)'));      // exact-case ticker
    const words = (ALIAS[h.ticker] || []).slice();
    const name = String(h.name || '').toLowerCase(), first = name.split(/[\s,]/)[0];
    if (h.type === 'crypto' || h.coingecko_id) { if (name && name.length >= 3) words.push(name); }
    else if (first.length >= 5 && !STOP.has(first)) words.push(first);
    for (const w of new Set(words)) pats.push(new RegExp('(^|[^a-z0-9])' + esc(w) + '([^a-z0-9]|$)', 'i'));
    if (pats.length) things.push({ ticker: h.ticker, pats });
  };
  (portfolio.holdings || []).forEach(add); ((watchlist && watchlist.crypto) || []).forEach(add);
  const kw = ((portfolio.alerts && portfolio.alerts.keywords) || []).map(k => String(k).toLowerCase());
  return items.map(n => {
    const text = n.title + ' . ' + n.summary, low = text.toLowerCase();
    const tags = [...new Set(things.filter(t => t.pats.some(p => p.test(text))).map(t => t.ticker))];
    const hot = kw.filter(k => new RegExp('(^|[^a-z])' + esc(k) + '(s|ed|ing)?([^a-z]|$)').test(low));
    return { ...n, tags, hot: tags.length ? hot : [], score: tags.length * 2 + (tags.length ? hot.length * 3 : 0) };
  }).filter(n => n.tags.length).sort((a, b) => b.score - a.score || (b.time || 0) - (a.time || 0));
}

module.exports = { snapshot, charts, news, relevantNews, mixThemes, reddit, cached, getJson, getFeed, parseFeed };
