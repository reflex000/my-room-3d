/* The avatar's private knowledge lives in a separate PRIVATE GitHub repo (persona, skills, portfolio).
   This reads it at runtime with a read-only token and hands back only what the caller's role may see.
   Nothing from that repo is ever written into this (public) one. */
const YAML = require('yaml');

const REPO = process.env.BRAIN_REPO || 'reflex000/sid-brain';
const token = () => process.env.BRAIN_TOKEN || process.env.Brain_Token || process.env.brain_token || '';
const TTL = 5 * 60 * 1000, cache = new Map();

async function gh(path, raw = true) {
  const key = (raw ? 'r:' : 'j:') + path, hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  if (!token()) throw new Error('brain token not configured');
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    headers: { authorization: 'Bearer ' + token(), accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'my-room-3d' },
  });
  if (!r.ok) throw new Error(`brain ${path}: ${r.status}`);
  const v = raw ? await r.text() : await r.json();
  cache.set(key, { t: Date.now(), v });
  return v;
}

function frontMatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!m) return { meta: {}, body: md };
  let meta = {}; try { meta = YAML.parse(m[1]) || {}; } catch (e) {}
  return { meta, body: md.slice(m[0].length) };
}

const ALLOWED = { owner: ['owner', 'guest', 'public'], guest: ['guest', 'public'], public: ['public'] };

/* role: 'owner' | 'guest' | 'public'  →  { persona, skills:[{name, description, text}], portfolio?, watchlist? } */
async function loadBrain(role) {
  const allow = ALLOWED[role] || ALLOWED.public, out = { persona: '', skills: [], portfolio: null, watchlist: null };
  const core = frontMatter(await gh('persona/core.md'));
  if (allow.includes(core.meta.audience || 'owner')) out.persona = core.body.trim();
  const dirs = (await gh('skills', false)).filter(d => d.type === 'dir').map(d => d.name);
  const files = await Promise.all(dirs.map(d => gh(`skills/${d}/SKILL.md`).then(frontMatter).catch(() => null)));
  files.forEach((f, i) => {
    if (!f) return;
    const aud = f.meta.audience || 'owner';                       // no audience → treated as owner-only
    if (!allow.includes(aud) || f.meta.status === 'not-interviewed') return;
    out.skills.push({ name: f.meta.name || dirs[i], description: f.meta.description || '', text: f.body.trim() });
  });
  if (role === 'owner') {
    try { out.portfolio = YAML.parse(await gh('knowledge/portfolio.yaml')); } catch (e) { out.portfolioError = String(e.message || e); }
    try { out.watchlist = YAML.parse(await gh('knowledge/watchlist.yaml')); } catch (e) {}
  }
  return out;
}

module.exports = { loadBrain, hasBrain: () => !!token() };
