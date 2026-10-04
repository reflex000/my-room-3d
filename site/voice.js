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

  /* Playback: Web Audio first (this is what worked on Sid's desktop), an <audio> element only as a fallback when the
     AudioContext cannot run (e.g. iPhone silent switch). unlock() must run inside a click/tap and never touches a clip
     that is already playing. */
  const player = new Audio(); player.preload = 'auto'; player.playsInline = true; player.setAttribute('playsinline', '');
  /* iPhone/iPad: Web Audio is silenced by the ring/silent switch, an <audio> element is not -> use the element there.
     ?audio=element forces it anywhere (testing). */
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const USE_ELEMENT = IOS || /[?&]audio=element/.test(location.search);
  const SILENT = 'data:audio/wav;base64,UklGRsEIAABXQVZFZm10IBAAAAABAAEAIlYAACJWAAABAAgAZGF0YZ0IAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';
  let primed = false;
  /* Must run inside a click/tap. Wakes the AudioContext; on the element path, plays a short silent clip once so later
     play() calls are allowed. Never touches the player while Sid is speaking. */
  function unlock() {
    const ac = audioCtx();
    try { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) {}
    if (USE_ELEMENT && !primed && !playing) {
      try {
        player.src = SILENT; const p = player.play();
        if (p && p.then) p.then(() => { primed = true; if (!playing) player.pause(); }).catch(() => {});
      } catch (e) {}
    }
    return ac.state;
  }

  async function playWebAudio(arrayBuffer, ac) {
    const audio = await ac.decodeAudioData(arrayBuffer.slice(0));
    const src = ac.createBufferSource(); src.buffer = audio;
    const gain = ac.createGain(); gain.gain.value = 1;
    const an = ac.createAnalyser(); an.fftSize = 512; src.connect(an); an.connect(gain); gain.connect(ac.destination);
    const buf = new Float32Array(an.fftSize);
    return new Promise((resolve) => {
      let raf = 0, ended = false, guard = 0;
      const end = (ok) => { if (ended) return; ended = true; cancelAnimationFrame(raf); clearTimeout(guard); onLevel(0); playing = null; try { src.disconnect(); } catch (e) {} resolve(ok); };
      const tick = () => { an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5.5)); raf = requestAnimationFrame(tick); };
      src.onended = () => end(true); playing = { stop: () => { try { src.stop(); } catch (e) {} end(true); } };
      guard = setTimeout(() => end(true), audio.duration * 1000 + 1500);
      src.start(); tick();
    });
  }

  function playElement(arrayBuffer) {
    const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mpeg' }));
    return new Promise((resolve) => {
      let raf = 0, ended = false, guard = 0;
      const end = (ok) => { if (ended) return; ended = true; cancelAnimationFrame(raf); clearTimeout(guard); onLevel(0); playing = null; try { player.pause(); } catch (e) {} player.onended = player.onerror = null; setTimeout(() => URL.revokeObjectURL(url), 1000); resolve(ok); };
      const tick = () => { const t = player.currentTime; onLevel(player.paused ? 0 : 0.35 + 0.3 * Math.abs(Math.sin(t * 13)) * Math.abs(Math.sin(t * 5.3))); raf = requestAnimationFrame(tick); };
      player.onended = () => end(true); player.onerror = () => end(false);
      guard = setTimeout(() => end(false), 40000);
      playing = { stop: () => end(true) };
      player.muted = false; player.volume = 1; player.src = url;
      const p = player.play();
      if (p && p.then) p.then(tick).catch(() => end(false)); else tick();
    });
  }

  /* Resolves true when the clip played (or was stopped), false if the browser refused to play it. */
  async function speak(arrayBuffer) {
    stopSpeaking();
    if (USE_ELEMENT) return playElement(arrayBuffer);
    const ac = audioCtx();
    if (ac.state !== 'running') { try { await Promise.race([ac.resume(), new Promise(r => setTimeout(r, 400))]); } catch (e) {} }
    if (ac.state === 'running') { try { return await playWebAudio(arrayBuffer, ac); } catch (e) { /* fall back */ } }
    return playElement(arrayBuffer);
  }
  function stopSpeaking() { if (playing) playing.stop(); }
  function stopListening() { if (cancelListen) cancelListen(); }
  function release() { stopListening(); stopSpeaking(); if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }

  return { mode: USE_ELEMENT ? 'element' : 'webaudio', supported, listenOnce, speak, stopSpeaking, stopListening, release, unlock };
}
