/* GET /api/news — top crypto headlines from public RSS feeds, for the board on the wall. Public: contains nothing personal. */
const { rateLimited } = require('./_lib.js');
const { news } = require('./_market.js');

module.exports = async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('news:' + ip, 30)) { res.status(429).json({ error: 'slow down a little' }); return; }
  try {
    const items = await news();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ items: items.slice(0, 10).map(n => ({ source: n.source, title: n.title, link: n.link, time: n.time, summary: n.summary })) });
  } catch (e) { res.status(502).json({ error: 'news unavailable' }); }
};
