/* GET /api/digest — today's research digest (public news + Reddit pulse, condensed). Nothing personal. */
const { rateLimited } = require('./_lib.js');
const { digest } = require('./_digest.js');

module.exports = async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('digest:' + ip, 20)) { res.status(429).json({ error: 'slow down a little' }); return; }
  try {
    const d = await digest();
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.status(200).json(d);
  } catch (e) { res.status(502).json({ error: 'digest unavailable' }); }
};
