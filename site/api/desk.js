/* GET /api/desk — everything the market page (desk.html) shows. Public: built from public news and prices only. */
const { rateLimited } = require('./_lib.js');
const { desk } = require('./_desk.js');

module.exports = async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('desk:' + ip, 20)) { res.status(429).json({ error: 'slow down a little' }); return; }
  try {
    const d = await desk();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=7200');
    res.status(200).json(d);
  } catch (e) { res.status(502).json({ error: 'desk unavailable' }); }
};
