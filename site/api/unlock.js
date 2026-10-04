/* POST /api/unlock { invite, passphrase } — owner only. Turns on private mode (portfolio numbers, personal answers,
   numbers on the board) for 15 minutes by returning a signed session token. The passphrase lives only in the Vercel env
   var PRIVATE_PASSPHRASE; it is compared word-by-word so a spoken passphrase survives speech-to-text punctuation. */
const crypto = require('crypto');
const { roleFor, rateLimited, signSession } = require('./_lib.js');

const words = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).join(' ');
const TTL_MS = 15 * 60 * 1000;
const fails = new Map();   // per-IP lockout after repeated wrong tries

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('unlock:' + ip, 6, 10 * 60e3)) { res.status(429).json({ error: 'too many tries, wait a few minutes' }); return; }
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (Date.now() < f.until) { res.status(429).json({ error: 'locked for a while after wrong passphrases' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (roleFor(body.invite) !== 'owner') { res.status(403).json({ error: 'owner_only' }); return; }
  const want = words(process.env.PRIVATE_PASSPHRASE);
  if (!want) { res.status(503).json({ error: 'not_configured' }); return; }
  const got = words(body.passphrase), a = crypto.createHash('sha256').update(want).digest(), b = crypto.createHash('sha256').update(got).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    f.n += 1; if (f.n >= 5) { f.until = Date.now() + 30 * 60e3; f.n = 0; } fails.set(ip, f);
    res.status(401).json({ error: 'wrong_passphrase' }); return;
  }
  fails.delete(ip);
  const expiresAt = Date.now() + TTL_MS;
  res.status(200).json({ session: signSession({ scope: 'private', exp: expiresAt }), expiresAt });
};
