/* Voice I/O for the SRE desk: microphone capture with simple voice-activity detection, and audio playback that
   reports a loudness level every frame so the avatar's mouth follows the real sound. No audio is stored anywhere. */

export function createVoice({ onLevel = () => {}, onMic = () => {} } = {}) {
  let ctx = null, stream = null, playing = null, cancelListen = null;
  const audioCtx = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  async function mic() {
    if (stream && stream.active) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    return stream;
  }

  /* Record one utterance: waits for speech, stops after `silenceMs` of quiet. Resolves { blob, type } or null (nothing said / cancelled). */
  async function listenOnce({ silenceMs = 1100, maxMs = 25000, waitMs = 9000 } = {}) {
    const s = await mic(), ac = audioCtx();
    const src = ac.createMediaStreamSource(s), an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(s, type ? { mimeType: type } : undefined), chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    return new Promise((resolve) => {
      let spoke = false, lastLoud = 0, noise = 0.008, raf = 0, done = false; const t0 = performance.now();
      const finish = (keep) => {
        if (done) return; done = true; cancelAnimationFrame(raf); cancelListen = null; onMic(0);
        try { src.disconnect(); } catch (e) {}
        rec.onstop = () => resolve(keep && spoke && chunks.length ? { blob: new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }), type: (rec.mimeType || type || 'audio/webm') } : null);
        try { rec.stop(); } catch (e) { resolve(null); }
      };
      cancelListen = () => finish(false);
      rec.start(250);
      const tick = () => {
        an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length), now = performance.now();
        if (!spoke) noise = noise * 0.97 + rms * 0.03;                       // adapt to the room before speech starts
        const loud = rms > Math.max(0.018, noise * 2.6);
        if (loud) { lastLoud = now; if (!spoke && now - t0 > 150) spoke = true; }
        onMic(Math.min(1, rms * 9));
        if (spoke && now - lastLoud > silenceMs) return finish(true);
        if (!spoke && now - t0 > waitMs) return finish(false);
        if (now - t0 > maxMs) return finish(true);
        raf = requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /* Playback goes through ONE <audio> element: it plays even with the iPhone silent switch on (Web Audio does not),
     and once it has played inside a tap, later play() calls are allowed on every browser. The mouth is driven by a
     loudness envelope computed from the decoded clip, so no live Web Audio graph is needed for output. */
  const player = new Audio(); player.preload = 'auto'; player.playsInline = true; player.setAttribute('playsinline', '');
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  let unlocked = false;
  /* Must run inside a click/tap. */
  function unlock() {
    try { audioCtx(); } catch (e) {}
    if (!unlocked) {
      try { player.muted = true; player.src = SILENT; const p = player.play(); if (p && p.then) p.then(() => { unlocked = true; player.pause(); player.muted = false; }).catch(() => { player.muted = false; }); } catch (e) { player.muted = false; }
    }
    return unlocked;
  }

  async function envelope(arrayBuffer) {
    try {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new OAC(1, 44100, 44100);
      const audio = await oc.decodeAudioData(arrayBuffer.slice(0)), d = audio.getChannelData(0), step = Math.floor(audio.sampleRate / 50), env = [];
      for (let i = 0; i < d.length; i += step) { let sum = 0, n = Math.min(step, d.length - i); for (let j = 0; j < n; j++) sum += d[i + j] * d[i + j]; env.push(Math.min(1, Math.sqrt(sum / n) * 5.5)); }
      return { env, rate: 50 };
    } catch (e) { return null; }
  }

  /* Play encoded audio (ArrayBuffer, mp3). Resolves true when it played to the end (or was stopped), false if the
     browser refused to play it. A hard timeout guarantees the promise always settles. */
  async function speak(arrayBuffer) {
    stopSpeaking();
    const env = await envelope(arrayBuffer);
    const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
    return new Promise((resolve) => {
      let raf = 0, ended = false, guard = 0;
      const end = (ok) => {
        if (ended) return; ended = true; cancelAnimationFrame(raf); clearTimeout(guard); onLevel(0); playing = null;
        try { player.pause(); } catch (e) {} player.onended = player.onerror = player.onloadedmetadata = null;
        setTimeout(() => URL.revokeObjectURL(url), 1000); resolve(ok);
      };
      const tick = () => {
        const t = player.currentTime;
        const lvl = player.paused ? 0 : env ? (env.env[Math.min(env.env.length - 1, Math.floor(t * env.rate))] || 0) : 0.35 + 0.3 * Math.abs(Math.sin(t * 13)) * Math.abs(Math.sin(t * 5.3));
        onLevel(lvl); raf = requestAnimationFrame(tick);
      };
      player.onended = () => end(true); player.onerror = () => end(false);
      player.onloadedmetadata = () => { clearTimeout(guard); guard = setTimeout(() => end(true), ((isFinite(player.duration) && player.duration) || 30) * 1000 + 2000); };
      guard = setTimeout(() => end(false), 40000);
      playing = { stop: () => end(true) };
      player.muted = false; player.volume = 1; player.src = url;
      const p = player.play();
      if (p && p.then) p.then(() => { unlocked = true; tick(); }).catch(() => end(false)); else tick();
    });
  }
  function stopSpeaking() { if (playing) playing.stop(); }
  function stopListening() { if (cancelListen) cancelListen(); }
  function release() { stopListening(); stopSpeaking(); if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

  return { supported, listenOnce, speak, stopSpeaking, stopListening, release, unlock };
}
