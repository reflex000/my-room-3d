/* POST /api/stt — speech → text. Body: raw audio bytes (application/octet-stream), headers x-invite + x-audio-type.
   → { text }. Audio is forwarded to the transcription API and never stored. */
const { inviteOk, rateLimited } = require('./_lib.js');

const MODELS = (process.env.OPENAI_STT_MODEL ? [process.env.OPENAI_STT_MODEL] : []).concat(['gpt-4o-mini-transcribe', 'whisper-1']);
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

function readBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('stt:' + ip, 30)) { res.status(429).json({ error: 'slow down a little' }); return; }
  if (!inviteOk(req.headers['x-invite'])) { res.status(401).json({ error: 'invite_required' }); return; }
  if (!process.env.OPENAI_API_KEY) { res.status(503).json({ error: 'no speech key configured' }); return; }
  try {
    const audio = await readBody(req);
    if (!audio || audio.length < 1200) { res.status(200).json({ text: '' }); return; }        // too short to be speech
    if (audio.length > 4 * 1024 * 1024) { res.status(413).json({ error: 'clip too long' }); return; }
    const type = String(req.headers['x-audio-type'] || 'audio/webm').split(';')[0];
    let lastErr = null;
    for (const model of MODELS) {
      const form = new FormData();
      form.append('file', new Blob([audio], { type }), 'speech.' + (EXT[type] || 'webm'));
      form.append('model', model);
      form.append('language', process.env.STT_LANGUAGE || 'en');
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { res.status(200).json({ text: String(data.text || '').trim() }); return; }
      lastErr = (data.error && (data.error.code || data.error.message)) || ('http ' + r.status);
      if (!(r.status === 404 || r.status === 403 || /model/i.test(String(lastErr)))) break;
    }
    res.status(502).json({ error: String(lastErr).slice(0, 200) });
  } catch (e) { res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
};
module.exports.config = { api: { bodyParser: false } };
