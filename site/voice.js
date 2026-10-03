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

  /* Play encoded audio (ArrayBuffer). Calls onLevel(0..1) every frame; resolves when playback ends or is stopped. */
  async function speak(arrayBuffer) {
    stopSpeaking();
    const ac = audioCtx(), audio = await ac.decodeAudioData(arrayBuffer.slice(0));
    const src = ac.createBufferSource(); src.buffer = audio;
    const an = ac.createAnalyser(); an.fftSize = 512; src.connect(an); an.connect(ac.destination);
    const buf = new Float32Array(an.fftSize);
    return new Promise((resolve) => {
      let raf = 0, ended = false;
      const end = () => { if (ended) return; ended = true; cancelAnimationFrame(raf); onLevel(0); playing = null; resolve(); };
      const tick = () => { an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5.5)); raf = requestAnimationFrame(tick); };
      src.onended = end; playing = { stop: () => { try { src.stop(); } catch (e) {} end(); } };
      src.start(); tick();
    });
  }
  function stopSpeaking() { if (playing) playing.stop(); }
  function stopListening() { if (cancelListen) cancelListen(); }
  function release() { stopListening(); stopSpeaking(); if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

  return { supported, listenOnce, speak, stopSpeaking, stopListening, release, unlock: audioCtx };
}
