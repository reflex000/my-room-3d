/* POST /api/tts — text → speech (audio/mpeg). body: { invite, text }
   Provider: ElevenLabs when ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID are set (Sid's cloned voice), otherwise an OpenAI stock voice. */
const { inviteOk, rateLimited } = require('./_lib.js');

const OPENAI_MODELS = (process.env.OPENAI_TTS_MODEL ? [process.env.OPENAI_TTS_MODEL] : []).concat(['gpt-4o-mini-tts', 'tts-1']);
const STYLE = 'Speak like a relaxed, friendly senior engineer chatting with a colleague: natural pace, warm, conversational, not a narrator.';

async function eleven(text) {
  const voice = process.env.ELEVENLABS_VOICE_ID, model = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true } }),
  });
  if (!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return Buffer.from(await r.arrayBuffer());
}

async function openai(text) {
  let lastErr = null;
  for (const model of OPENAI_MODELS) {
    const body = { model, voice: process.env.OPENAI_TTS_VOICE || 'ash', input: text, response_format: 'mp3' };
    if (model.startsWith('gpt-4o')) body.instructions = STYLE;
    const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const data = await r.json().catch(() => ({}));
    lastErr = (data.error && (data.error.code || data.error.message)) || ('http ' + r.status);
    if (!(r.status === 404 || r.status === 403 || r.status === 400 || /model|voice/i.test(String(lastErr)))) break;
  }
  throw new Error('openai tts: ' + lastErr);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (rateLimited('tts:' + ip, 30)) { res.status(429).json({ error: 'slow down a little' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (!inviteOk(body.invite)) { res.status(401).json({ error: 'invite_required' }); return; }
  /* spoken text only: no emoji, urls or markup; hard cap so one reply cannot run up the bill */
  const text = String(body.text || '').replace(/https?:\/\/\S+/g, 'a link').replace(/[*_`#>]/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!text) { res.status(400).json({ error: 'nothing to say' }); return; }
  try {
    const useEleven = process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID;
    let audio, provider = useEleven ? 'elevenlabs' : 'openai';
    try { audio = useEleven ? await eleven(text) : await openai(text); }
    catch (e) { if (useEleven && process.env.OPENAI_API_KEY) { audio = await openai(text); provider = 'openai-fallback'; } else throw e; }
    res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('x-voice-provider', provider);
    res.status(200).send(audio);
  } catch (e) { res.status(502).json({ error: String(e.message || e).slice(0, 200) }); }
};
