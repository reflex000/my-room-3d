/* Realistic rigged avatar (me.glb, Avaturn export) living in the study-corner room.
   me-anims.glb: mocap clips already retargeted onto this skeleton at build time (avatar-src/retarget.mjs).
   Full-body "base" clips drive the state machine (typing at the desk, sitting, walking, climbing the loft ladder,
   lying in bed); upper-body gesture clips are layered on top by sampling their tracks. Head look-at + a few small
   gestures stay procedural.
   Usage (room.js): const avatar = createAvatar({ T, stage, seat }); room.add(avatar.group); avatar.setChair(pivot); avatar.update() each frame. */

export function createAvatar({ T, stage, seat }) {
  const root = new T.Group(); root.name = 'avatar';           // room coordinates
  const rig = new T.Group(); rig.name = 'avatar_rig'; root.add(rig);
  const SCALE = 0.94;
  const api = { group: root, update() {}, command() {}, setChair() {}, ready: false };

  const Q = (x = 0, y = 0, z = 0) => new T.Quaternion().setFromEuler(new T.Euler(x, y, z, 'XYZ'));
  const S = Math.sin, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), smooth = (k) => k * k * (3 - 2 * k);
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const nowS = () => performance.now() / 1000;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  /* ---------- soft contact shadow ---------- */
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'), grad = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
  const blob = new T.Mesh(new T.CircleGeometry(0.42, 32), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
  blob.name = 'avatar_shadow'; blob.rotation.x = -Math.PI / 2; blob.position.y = 0.021; blob.renderOrder = 2; blob.raycast = () => {}; root.add(blob);

  /* ---------- speech bubble ---------- */
  const bubble = document.createElement('div');
  bubble.style.cssText = 'position:fixed;z-index:40;pointer-events:none;transform:translate(-50%,-100%);max-width:240px;padding:8px 12px;border-radius:14px;background:#f4f5f8;color:#14161c;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);opacity:0;transition:opacity .2s;text-align:center';
  document.body.appendChild(bubble);
  let bubbleUntil = 0;
  function say(text, secs) { bubble.textContent = text; bubbleUntil = nowS() + (secs || Math.min(7, 2.2 + text.length * 0.06)); }

  /* ---------- places (room coords) ---------- */
  const SEAT = new T.Vector3(seat.x, 0, seat.z);
  const yawFwd = (yaw) => new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const YAW_OUT = seat.rotY, YAW_DESK = seat.rotY + Math.PI;
  const STANDPT = SEAT.clone().addScaledVector(yawFwd(YAW_OUT), 0.55);
  const DESK_SLIDE = 0.3;                                                   // chair rolls this much toward the desk for typing
  /* loft bed: ladder leans on the room-facing side (foot x≈-0.4, rails z 0.05..0.45) */
  /* the climb clip faces -z and keeps its hips ~0.7 above its origin, so the rig starts below the floor and rises */
  const LADDER_FOOT = new T.Vector3(-0.1, 0, 0.25), LADDER_YAW = Math.PI / 2, CLIMB_Y0 = -0.66, CLIMB_Y1 = 0.55, CLIMB_SPEED = 0.5, CLIMB_LEAN = 0.17;
  const climbX = (y) => LADDER_FOOT.x - CLIMB_LEAN * Math.max(0, y - CLIMB_Y0);
  const BED_LIE = new T.Vector3(-1.23, 1.0, 0.19), BED_YAW = 0;   // lieDown clip lies ~0.7 above its origin with the head toward -z -> back wall
  const SPOTS = {
    center: { p: [0.35, 1.1], face: 0.15 },
    window: { p: [1.12, 0.78], face: Math.PI / 2 },
    ladder: { p: [LADDER_FOOT.x, LADDER_FOOT.z], face: LADDER_YAW },
    desk:   { p: [1.08, -0.3], face: Math.PI - 0.25, via: [[0.95, 0.4]] },
    door:   { p: [-0.05, -0.05], face: Math.PI + 0.35, via: [[0.0, 0.55]] },
  };

  let chair = null, chairHome = null;   // swivel-chair pivot (room coords), set by room.js
  api.setChair = (pivot) => { chair = pivot; chairHome = pivot.position.clone(); };

  (async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const [gltf, animGltf, meta] = await Promise.all([loader.loadAsync('./me.glb'), loader.loadAsync('./me-anims.glb'), fetch('./me-anims.json').then(r => r.json())]);
    const model = gltf.scene; model.name = 'avatar_model';
    model.updateMatrixWorld(true);

    const bones = {}, rest = {};
    model.traverse(o => { if (o.isBone) bones[o.name] = o; });
    for (const n in bones) { const b = bones[n]; rest[n] = { R: b.quaternion.clone(), W: b.getWorldQuaternion(new T.Quaternion()), p: b.position.clone() }; }
    const tmpQ = new T.Quaternion();
    const localFor = (n, D, out) => { const r = rest[n]; return out.copy(r.R).multiply(tmpQ.copy(r.W).invert()).multiply(D).multiply(r.W); };

    const morphMeshes = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      o.name = 'avatar_' + o.name; o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false;
      if (o.morphTargetDictionary) morphMeshes.push(o);
      const m = o.material; m.metalness = 0; m.envMapIntensity = 0;
      if (m.map) { m.emissive = new T.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.2; }
    });
    const morph = (name, v) => { for (const m of morphMeshes) { const i = m.morphTargetDictionary[name]; if (i !== undefined) m.morphTargetInfluences[i] = v; } };
    const face = { blink: 0, smile: 0, jaw: 0, aa: 0, oo: 0, brow: 0, closed: 0 };
    model.scale.setScalar(SCALE); rig.add(model);

    /* ---------- clips ---------- */
    const mixer = new T.AnimationMixer(model);
    const clips = {}; for (const c of animGltf.animations) clips[c.name] = c;
    const actions = {}; for (const n in clips) { const a = mixer.clipAction(clips[n]); a.enabled = false; actions[n] = a; }
    let base = null, onBaseEnd = null;
    function setBase(name, { once = false, fade = 0.35, timeScale = 1, from = 0 } = {}) {
      const a = actions[name]; if (!a) return;
      if (base === a && !once && a.timeScale === timeScale) return;
      a.reset(); a.enabled = true; a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = true; a.timeScale = timeScale;
      a.time = from < 0 ? clips[name].duration + from : from;
      a.setEffectiveWeight(1); a.play();
      if (base && base !== a) { base.crossFadeTo(a, fade, false); } else if (base === a) a.setEffectiveWeight(1);
      base = a;
    }
    mixer.addEventListener('finished', (e) => { if (e.action === base && onBaseEnd) { const f = onBaseEnd; onBaseEnd = null; f(); } });

    /* upper-body layer: sample a clip's tracks and slerp them onto the bones */
    const UPPER = (n) => /^(Spine|Spine1|Spine2|Neck|Head|Left(Shoulder|Arm|ForeArm|Hand)|Right(Shoulder|Arm|ForeArm|Hand))$/.test(n) || /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(n);
    const samplers = {};
    function sampler(name, filter = UPPER) {
      const key = name + (filter === UPPER ? '' : '*'); if (samplers[key]) return samplers[key];
      const s = [];
      for (const tr of clips[name].tracks) { const [bn, prop] = tr.name.split('.'); if (prop !== 'quaternion' || !bones[bn] || !filter(bn)) continue; s.push({ bone: bones[bn], interp: tr.createInterpolant(), q: new T.Quaternion() }); }
      return (samplers[key] = { duration: clips[name].duration, apply(t, w) { for (const e of s) { const v = e.interp.evaluate(t); e.q.set(v[0], v[1], v[2], v[3]); e.bone.quaternion.slerp(e.q, w); } } });
    }

    /* ---------- procedural bits (head look-at, small gestures) — Euler XYZ in T-pose axes, arms in hanging-arm axes ---------- */
    const DOWN = { L: Q(0, 0, -Math.PI / 2), R: Q(0, 0, Math.PI / 2) }, DOWNi = { L: DOWN.L.clone().invert(), R: DOWN.R.clone().invert() };
    const dq = new T.Quaternion(), eq = new T.Quaternion(), eul = new T.Euler();
    function targetLocal(n, e, out) {
      eq.setFromEuler(eul.set(e[0], e[1], e[2], 'XYZ'));
      const side = n.startsWith('Left') ? 'L' : 'R';
      if (/Arm$/.test(n) && !/Fore/.test(n)) dq.copy(eq).multiply(DOWN[side]);
      else if (/ForeArm$|Hand$/.test(n)) dq.copy(DOWNi[side]).multiply(eq).multiply(DOWN[side]);
      else dq.copy(eq);
      return localFor(n, dq, out);
    }
    const JOINT = { torso: 'Spine1', head: 'Head', neck: 'Neck', shL: 'LeftArm', shR: 'RightArm', elL: 'LeftForeArm', elR: 'RightForeArm' };
    /* gestures: either a mocap clip sampled on the upper body, or a procedural pose */
    const GESTURES = {
      wave:    { look: 1, dur: 3.0, face: 'smile', pose: (t) => ({ shR: [0, 0, -2.45], elR: [0, 0, -0.55 + S(t * 9) * 0.45], head: [0, 0, -0.08] }) },
      drink:   { clip: 'drink', dur: 5.2, prop: 'mug' },
      stretch: { clip: 'stretch', dur: 6, face: 'closed' },
      neck:    { clip: 'neckStretch', dur: 3.2, face: 'closed' },
      phone:   { clip: 'phone', dur: 8, prop: 'phone', from: 1.5 },
      laugh:   { clip: 'sitLaugh', dur: 4.5, look: 1, face: 'laugh' },
      thumbs:  { look: 1, dur: 2.6, face: 'smile', pose: (t) => ({ shL: [-1.1, 0, -0.1], elL: [-1.35, 0, 0], head: [0.04 + S(t * 6) * 0.04, 0, 0.06] }) },
      think:   { look: 1, dur: 4.5, face: 'brow', pose: (t) => ({ shR: [-0.8, 0, 0.95], elR: [-2.1, 0, 0], head: [0.12, -0.18, -0.1 + S(t * 1.2) * 0.03] }) },
      nod:     { look: 1, dur: 1.8, face: 'smile', pose: (t) => ({ head: [0.1 + S(t * 9) * 0.18, 0, 0] }) },
      no:      { look: 1, dur: 1.9, pose: (t) => ({ head: [0.03, S(t * 9) * 0.36, 0] }) },
      shrug:   { look: 1, dur: 2.2, face: 'brow', pose: () => ({ shL: [-0.35, 0, 0.5], shR: [-0.35, 0, -0.5], elL: [-1.7, 0, 0.5], elR: [-1.7, 0, -0.5], head: [0, 0, 0.14] }) },
      talk:    { look: 1, dur: 3, face: 'talk', pose: (t) => ({ head: [0.02 + S(t * 5) * 0.03, S(t * 1.7) * 0.06, 0] }) },
    };

    /* props on the right hand (hanging-arm axes: x out, y up the arm, z forward) */
    const propMat = (c, e = 0.25) => new T.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: e });
    bones.RightHand.updateWorldMatrix(true, false);
    const handW = new T.Matrix4().copy(bones.RightHand.matrixWorld).premultiply(new T.Matrix4().copy(model.matrixWorld).invert());
    function attach(obj, off, rot) {
      const pos = new T.Vector3().setFromMatrixPosition(handW).add(new T.Vector3(...off).applyQuaternion(DOWNi.R));
      const M = new T.Matrix4().compose(pos, DOWNi.R.clone().multiply(rot || new T.Quaternion()), new T.Vector3(1, 1, 1));
      obj.matrix.copy(handW).invert().multiply(M); obj.matrix.decompose(obj.position, obj.quaternion, obj.scale); bones.RightHand.add(obj); obj.visible = false; return obj;
    }
    const mug = new T.Group(); mug.name = 'avatar_mug';
    mug.add(new T.Mesh(new T.CylinderGeometry(0.038, 0.034, 0.09, 20), propMat(0xf0ede6)));
    const mh = new T.Mesh(new T.TorusGeometry(0.025, 0.007, 8, 16), propMat(0xf0ede6)); mh.position.x = -0.042; mug.add(mh);
    attach(mug, [0, -0.09, 0.04]);
    const phone = new T.Group(); phone.name = 'avatar_phone';
    phone.add(new T.Mesh(new T.BoxGeometry(0.074, 0.15, 0.01), propMat(0x0e0f12, 0.05)));
    const ps = new T.Mesh(new T.PlaneGeometry(0.066, 0.14), new T.MeshBasicMaterial({ color: 0x9fd0ff, toneMapped: false })); ps.position.z = 0.0056; phone.add(ps);
    attach(phone, [0.02, -0.12, 0.04], Q(-0.6, 0, 0));

    /* ---------- state ---------- */
    /* states: type | sit | walk | stand | standing_up | sitting_down | swivel | climb_in | climb | climb_down | climb_end | to_bed | inbed | from_bed */
    let state = 'type', transT = 0, path = [], faceAfter = 0, onArrive = null, where = 'seat';
    let gesture = null, gStart = 0, gW = 0, last = nowS(), nextBlink = 2, nextAuto = nowS() + 20;
    let chairYaw = YAW_DESK, chairYawTarget = YAW_DESK, chairSlide = DESK_SLIDE, chairSlideTarget = DESK_SLIDE, swivelThen = null;
    const SPEED = 0.85, TRANS = 1.15;
    const v2 = (a) => new T.Vector3(a[0], 0, a[1]);
    const viaBack = () => (where === 'desk' || where === 'door') ? SPOTS[where].via.slice().reverse().map(v2) : [];
    const seated = () => state === 'type' || state === 'sit' || state === 'swivel';
    const onChair = () => seated() || state === 'sitting_down' || state === 'standing_up';

    function placeOnChair() {
      if (!chair) return;
      chair.rotation.y = chairYaw;
      chair.position.copy(chairHome).addScaledVector(yawFwd(chairYaw), chairSlide);
      rig.position.copy(chair.position); rig.position.y = 0.03; rig.rotation.set(0, chairYaw, 0);
    }
    /* swivel the chair (with him on it) to `yaw`, then continue */
    function swivel(yaw, slide, then) { chairYawTarget = yaw; chairSlideTarget = slide; swivelThen = then || null; state = 'swivel'; }

    function startTyping() { if (state === 'type') return; setBase('sitToType', { once: true, fade: 0.3 }); onBaseEnd = () => { setBase('typing', { fade: 0.25 }); state = 'type'; }; state = 'swivel'; swivelThen = null; chairYawTarget = chairYaw; chairSlideTarget = chairSlide; }
    function goType() {
      if (state === 'type') return;
      const doit = () => { swivel(YAW_DESK, DESK_SLIDE, () => startTyping()); };
      if (state === 'sit') doit(); else goSit(doit);
    }
    /* turn away from the desk to face the room (typing -> sitting) */
    function faceRoom(then) {
      if (state === 'sit') { if (then) then(); return; }
      if (state === 'type') {
        setBase('typeToSit', { once: true, fade: 0.25 }); state = 'swivel'; swivelThen = null; chairYawTarget = chairYaw; chairSlideTarget = chairSlide;
        onBaseEnd = () => { setBase('sitIdle', { fade: 0.3 }); swivel(YAW_OUT, 0, () => { state = 'sit'; if (then) then(); }); };
      } else if (then) then();
    }
    function standUp(then) {
      if (state === 'sit') { state = 'standing_up'; transT = 0; setBase('idle', { fade: TRANS }); onArrive = then || null; }
      else if (state === 'type' || state === 'swivel') faceRoom(() => standUp(then));
      else if (state === 'standing_up') onArrive = then || null;
      else if (then) then();
    }
    let bedQueue = null;
    function ensureStanding(then) {
      if (seated()) standUp(then);
      else if (state === 'sitting_down') onArrive = () => standUp(then);
      else if (state === 'standing_up') onArrive = then || null;
      else if (state === 'inbed') { leaveBed(then); }
      else if (state === 'climb_in' || state === 'climb' || state === 'to_bed') bedQueue = then || (() => {});
      else if (state === 'from_bed' || state === 'climb_down' || state === 'climb_end') onArrive = then || null;
      else if (then) then();
    }
    function walkTo(key, then) {
      const spot = SPOTS[key]; if (!spot) return;
      ensureStanding(() => { path = [...viaBack(), ...(spot.via || []).map(v2), v2(spot.p)]; faceAfter = spot.face; state = 'walk'; where = key; onArrive = then || null; setBase('walk', { fade: 0.3, timeScale: 0.85 }); });
    }
    function goSit(then) {
      if (state === 'sit') { if (then) then(); return; }
      if (state === 'type' || state === 'swivel') { faceRoom(then); return; }
      ensureStanding(() => {
        path = [...viaBack(), STANDPT.clone()]; faceAfter = YAW_OUT; state = 'walk'; where = 'seat'; setBase('walk', { fade: 0.3, timeScale: 0.85 });
        onArrive = () => { state = 'sitting_down'; transT = 0; setBase('sitIdle', { fade: TRANS }); onArrive = then || null; };
      });
    }
    function goBed() {
      if (['inbed', 'to_bed', 'climb', 'climb_in'].includes(state)) return;
      ensureStanding(() => {
        path = [...viaBack(), LADDER_FOOT.clone()]; faceAfter = LADDER_YAW; state = 'walk'; where = 'ladder'; setBase('walk', { fade: 0.3, timeScale: 0.85 });
        onArrive = () => { state = 'climb_in'; transT = 0; setBase('climb', { fade: 0.5 }); };
      });
    }
    function leaveBed(then) {
      state = 'from_bed'; transT = 0; onArrive = then || null;
      setBase('climb', { fade: 1.0 });
    }
    function wander() {
      const keys = Object.keys(SPOTS).filter(k => k !== where && k !== 'ladder'); const k = pickOne(keys);
      walkTo(k, () => { setTimeout(() => { if (state === 'stand' && where === k) goType(); }, 9000 + Math.random() * 6000); });
    }

    function play(name, dur) {
      const g = GESTURES[name]; if (!g) return false;
      gesture = { ...g, name, dur: dur || g.dur || (g.clip ? clips[g.clip].duration * (g.loops || 1) : 3), s: g.clip ? sampler(g.clip) : null }; gStart = nowS();
      mug.visible = g.prop === 'mug'; phone.visible = g.prop === 'phone';
      if (state === 'type') faceRoom();          // look at the visitor for gestures
      return true;
    }

    /* initial pose: typing at the desk */
    placeOnChair(); setBase('typing');

    const headPos = new T.Vector3(), camLocal = new T.Vector3(), tq = new T.Quaternion(), tv = new T.Vector3(), lieQ = Q(-Math.PI / 2, 0, 0), topQ = new T.Quaternion(), tmpV = new T.Vector3();
    const LADDER_TOP = new T.Vector3(climbX(CLIMB_Y1), CLIMB_Y1, LADDER_FOOT.z);
    api.update = function update() {
      const now = nowS(), dt = Math.min(0.1, now - last); last = now;

      /* --- chair + locomotion --- */
      if (state === 'swivel') {
        const a = 1 - Math.exp(-dt * 3.5);
        chairYaw += angDiff(chairYawTarget, chairYaw) * a; chairSlide += (chairSlideTarget - chairSlide) * a;
        placeOnChair();
        if (Math.abs(angDiff(chairYawTarget, chairYaw)) < 0.02 && Math.abs(chairSlideTarget - chairSlide) < 0.01 && swivelThen) { chairYaw = chairYawTarget; chairSlide = chairSlideTarget; placeOnChair(); const f = swivelThen; swivelThen = null; f(); }
      } else if (state === 'type' || state === 'sit') {
        placeOnChair();
      } else if (state === 'standing_up' || state === 'sitting_down') {
        transT += dt / TRANS; const k = smooth(clamp(transT, 0, 1)), sitW = state === 'standing_up' ? 1 - k : k;
        rig.position.lerpVectors(STANDPT, SEAT, sitW); rig.position.y = 0.03 * sitW; rig.rotation.set(0, YAW_OUT, 0);
        if (transT >= 1) { state = state === 'standing_up' ? 'stand' : 'sit'; const f = onArrive; onArrive = null; if (f) f(); }
      } else if (state === 'climb_in' || state === 'climb_end') {
        /* sink / raise the rig in sync with the idle<->climb crossfade so the hips stay level */
        transT += dt / 0.5; const k = clamp(transT, 0, 1);
        rig.position.y = CLIMB_Y0 * (state === 'climb_in' ? k : 1 - k); rig.position.x = climbX(rig.position.y); rig.position.z = LADDER_FOOT.z; rig.rotation.set(0, LADDER_YAW, 0);
        if (transT >= 1) { if (state === 'climb_in') state = 'climb'; else { state = 'stand'; where = 'ladder'; const f = onArrive; onArrive = null; if (f) f(); } }
      } else if (state === 'climb') {
        rig.position.y += CLIMB_SPEED * dt; rig.position.x = climbX(rig.position.y); rig.rotation.set(0, LADDER_YAW, 0);
        if (rig.position.y >= CLIMB_Y1) { rig.position.copy(LADDER_TOP); state = 'to_bed'; transT = 0; setBase('lieDown', { once: true, fade: 0.8 }); }
      } else if (state === 'to_bed' || state === 'from_bed') {
        transT += dt / 1.6; const k = smooth(clamp(transT, 0, 1)), a = state === 'to_bed' ? k : 1 - k;
        rig.position.lerpVectors(LADDER_TOP, BED_LIE, a); rig.quaternion.slerpQuaternions(Q(0, LADDER_YAW, 0), Q(0, BED_YAW, 0), a);
        if (transT >= 1) {
          if (state === 'to_bed') { state = 'inbed'; nextAuto = now + 45 + Math.random() * 30; say('Zzz… 😴', 4); if (bedQueue) { const f = bedQueue; bedQueue = null; ensureStanding(f); } }
          else { state = 'climb_down'; setBase('climb', { timeScale: -1, fade: 0.2 }); }
        }
      } else if (state === 'climb_down') {
        rig.position.y -= CLIMB_SPEED * dt; rig.position.x = climbX(rig.position.y); rig.rotation.set(0, LADDER_YAW, 0);
        if (rig.position.y <= CLIMB_Y0) { rig.position.y = CLIMB_Y0; state = 'climb_end'; transT = 0; setBase('idle', { fade: 0.5 }); }
      } else if (state === 'walk') {
        const tgt = path[0];
        if (!tgt) {
          const d = angDiff(faceAfter, rig.rotation.y);
          if (Math.abs(d) > 0.04) rig.rotation.y += clamp(d, -3.2 * dt, 3.2 * dt);
          else { rig.rotation.y = faceAfter; state = 'stand'; setBase('idle', { fade: 0.35 }); const f = onArrive; onArrive = null; if (f) f(); }
        } else {
          tv.subVectors(tgt, rig.position); tv.y = 0; const dist = tv.length();
          const d = angDiff(Math.atan2(tv.x, tv.z), rig.rotation.y);
          rig.rotation.y += clamp(d, -4.5 * dt, 4.5 * dt);
          const step = SPEED * dt * clamp(1.2 - Math.abs(d), 0.15, 1);
          if (dist <= step + 0.02) { rig.position.x = tgt.x; rig.position.z = tgt.z; path.shift(); if (!path.length) setBase('idle', { fade: 0.4 }); } else rig.position.addScaledVector(tv.normalize(), step);
        }
      }
      mixer.update(dt);

      /* --- gesture layer --- */
      let faceMode = state === 'inbed' || state === 'to_bed' ? 'closed' : 'neutral', look = 0;
      if (gesture) {
        const t = now - gStart;
        if (t > gesture.dur) gesture = null;
        else {
          const k = clamp(Math.min(t / 0.4, (gesture.dur - t) / 0.4), 0, 1); gW += (k - gW) * (1 - Math.exp(-dt * 10));
          faceMode = gesture.face || 'neutral'; look = gesture.look ? k : 0;
          const w = smooth(clamp(gW, 0, 1));
          if (gesture.s) gesture.s.apply(((gesture.from || 0) + t) % gesture.s.duration, w);
          else if (gesture.pose) { const p = gesture.pose(t); for (const j in p) { const n = JOINT[j]; if (bones[n]) bones[n].quaternion.slerp(targetLocal(n, p[j], tq), w); } }
        }
      } else { gW += (0 - gW) * (1 - Math.exp(-dt * 8)); if (gW < 0.01) mug.visible = phone.visible = false; }
      /* head turns toward whoever is watching during social gestures / while sitting facing the room */
      const wantLook = look || (state === 'sit' ? 0.6 : 0);
      if (wantLook > 0.01) {
        camLocal.copy(stage._camera.position); rig.worldToLocal(camLocal);
        const ang = clamp(Math.atan2(camLocal.x, camLocal.z), -1.3, 1.3), pitch = clamp(-Math.atan2(camLocal.y - 1.5, Math.hypot(camLocal.x, camLocal.z)), -0.4, 0.3);
        bones.Head.quaternion.slerp(tq.copy(bones.Head.quaternion).multiply(localFor('Head', Q(pitch * 0.6, ang * 0.55, 0), new T.Quaternion()).multiply(rest.Head.R.clone().invert())), wantLook * 0.9);
        bones.Neck.quaternion.slerp(tq.copy(bones.Neck.quaternion).multiply(localFor('Neck', Q(pitch * 0.3, ang * 0.35, 0), new T.Quaternion()).multiply(rest.Neck.R.clone().invert())), wantLook * 0.9);
      }

      /* --- face --- */
      if (now > nextBlink) nextBlink = now + 2.2 + Math.random() * 3.5;
      const blinking = nextBlink - now < 0.13 ? 1 : 0;
      const talking = faceMode === 'talk' || faceMode === 'laugh';
      const want = { blink: blinking, closed: faceMode === 'closed' || faceMode === 'laugh' ? 1 : 0, smile: faceMode === 'smile' ? 0.7 : faceMode === 'laugh' ? 1 : (state === 'type' ? 0.05 : 0.12), brow: faceMode === 'brow' ? 0.8 : faceMode === 'smile' ? 0.3 : 0, jaw: talking ? 0.18 + S(now * 15) * 0.16 : 0, aa: talking ? 0.35 + S(now * 11) * 0.35 : 0, oo: talking ? 0.3 + S(now * 7 + 1) * 0.3 : 0 };
      for (const k in face) face[k] += (want[k] - face[k]) * (1 - Math.exp(-dt * (k === 'blink' ? 40 : 12)));
      const bl = Math.max(face.blink, face.closed);
      morph('eyeBlinkLeft', bl); morph('eyeBlinkRight', bl); morph('mouthSmile', face.smile); morph('browInnerUp', face.brow); morph('jawOpen', Math.max(0, face.jaw)); morph('viseme_aa', Math.max(0, face.aa)); morph('viseme_O', Math.max(0, face.oo)); morph('cheekSquintLeft', face.smile * 0.5); morph('cheekSquintRight', face.smile * 0.5);

      /* --- shadow, bubble, idle behaviour --- */
      blob.position.x = rig.position.x; blob.position.z = rig.position.z; blob.material.opacity = (onChair() ? 0.25 : 1) * clamp(1 - rig.position.y / 0.4, 0, 1);
      if (now < bubbleUntil) {
        bones.Head.getWorldPosition(headPos); headPos.y += 0.3; headPos.project(stage._camera);
        const r = stage.getBoundingClientRect();
        bubble.style.left = (r.left + (headPos.x + 1) / 2 * r.width) + 'px'; bubble.style.top = (r.top + (1 - headPos.y) / 2 * r.height) + 'px';
        bubble.style.opacity = headPos.z < 1 ? '1' : '0';
      } else bubble.style.opacity = '0';
      if (now > nextAuto && !gesture && (state === 'sit' || state === 'type' || state === 'stand' || state === 'inbed')) {
        nextAuto = now + 25 + Math.random() * 20;
        if (state === 'inbed') { say('Chalo, kaam pe wapas', 3); goType(); }
        else if (state === 'sit') goType();
        else if (state === 'stand') goType();
        else { const r = Math.random(); if (r < 0.3) wander(); else if (r < 0.4) goBed(); else if (r < 0.7) play(pickOne(['stretch', 'neck', 'drink', 'phone'])); }
      }
    };

    /* ---------- text commands ---------- */
    const GO = [
      [/\b(window|khidki|bahar|outside|view)\b/, 'window', ['Bahar ka view dekhta hoon', 'Nice view from here 🌆']],
      [/\b(desk|monitor|setup)\b/, 'desk', ['Yeh raha mera setup 🖥️']],
      [/\b(door|darwaza|gate)\b/, 'door', ['Koi aaya kya? 🚪']],
      [/\b(come here|idhar aa|aaja|aa ja|center|front|samne|saamne|closer|paas)\b/, 'center', ['Haan bol 👀', 'Aa gaya']],
    ];
    const RULES = [
      [/\b(dance|party|naach|nach|vibe|music|gaana)\b/, 'dance', ['Dance mode 🕺', 'DJ, volume badha!']],
      [/\b(stretch|tired|thak|thaka|break|angdai)\b/, 'stretch', ['Aaah… needed that', 'Long day bro']],
      [/\b(neck|gardan)\b/, 'neck', ['Gardan akad gayi thi']],
      [/\b(drink|coffee|chai|tea|water|paani|pani|sip)\b/, 'drink', ['Chai break ☕', 'Hydration first']],
      [/\b(phone|scroll|insta|instagram|text|call|reel|reels)\b/, 'phone', ['Ek min, reply kar raha hoon…', 'Just one reel 📱']],
      [/\b(lol|lmao|haha+|funny|joke|laugh|hasa)\b/, 'laugh', ['Hahaha 😂', 'Sahi tha yeh']],
      [/\b(think|idea|soch|socho|hmm+|why|how|kyu|kyun|kaise)\b/, 'think', ['Hmm, let me think…', 'Sochne de 🤔']],
      [/\b(nice|cool|great|awesome|good|thumbs|like|love|badhiya|mast|sahi)\b/, 'thumbs', ['👍 Badhiya!', 'Appreciate it!']],
      [/\b(shrug|idk|dunno|pata nahi|whatever|kya pata)\b/, 'shrug', ['Pata nahi yaar 🤷', 'No idea honestly']],
      [/\b(yes|yeah|yep|haan|han|ok|okay|nod|agree|right|theek)\b/, 'nod', ['Haan haan', 'Yep 👍']],
      [/\b(no|nah|nahi|nope|never|mat)\b/, 'no', ['Nahi bhai', 'Nope']],
      [/\b(hi+|hello|hey+|namaste|yo|sup|wave|bye|hola|salaam|kaise ho|welcome)\b/, 'wave', ['Hey! 👋 Welcome to my room', 'Namaste 🙏', 'Yo! Look around, click stuff']],
    ];
    api.command = function command(text) {
      const raw = String(text || '').trim(); if (!raw) return; nextAuto = nowS() + 35;
      const m = raw.match(/^(say|bol|bolo)\s+(.+)/i);
      if (m) { play('talk', Math.min(7, 2 + m[2].length * 0.06)); say(m[2]); return; }
      const low = raw.toLowerCase();
      if (/\b(bed|bistar|palang|sleep|nap|so ja|soja|sleepy|night|zzz|sone)\b/.test(low)) { say(state === 'inbed' ? 'So raha hoon yaar 😴' : pickOne(['Thak gaya, sone jaa raha hoon 😴', 'Good night 🌙', 'Bed time 🛏️'])); goBed(); return; }
      if (/\b(wake|jaag|jag|utho|uth ja|get up)\b/.test(low)) { say('Uth gaya uth gaya 😩'); ensureStanding(); return; }
      if (/\b(type|typing|work|kaam|code|computer|laptop|pc|back to work)\b/.test(low)) { say(pickOne(['Back to work 💻', 'Kaam pe lagta hoon', 'Deadline hai bhai'])); goType(); return; }
      if (/\b(sit|baith|beth|wapas|chair|kursi|turn|mudh|ghoom ke dekh)\b/.test(low)) { say(state === 'sit' ? 'Baitha toh hoon 😄' : 'Haan, bol'); goSit(); return; }
      if (/\b(stand|uth|khada)\b/.test(low)) { say('Uth gaya 💪'); ensureStanding(); return; }
      if (/\b(walk|ghoom|ghum|tehel|roam|wander|chal|move)\b/.test(low)) { say('Thoda ghoom ke aata hoon 🚶'); wander(); return; }
      for (const [re, key, lines] of GO) if (re.test(low)) { say(pickOne(lines)); walkTo(key); return; }
      if (/\b(dance|party|naach|nach|vibe|music|gaana)\b/.test(low)) { say(pickOne(['Dance mode 🕺', 'DJ, volume badha!'])); ensureStanding(() => { state = 'stand'; setBase('dance', { fade: 0.4 }); setTimeout(() => { if (base === actions.dance) { setBase('idle', { fade: 0.5 }); } }, 9000); }); return; }
      if (GESTURES[low]) { const r = RULES.find(x => x[1] === low); play(low); if (r) say(pickOne(r[2])); return; }
      for (const [re, act, lines] of RULES) if (re.test(low)) { play(act); say(pickOne(lines)); return; }
      play('shrug'); say('Try: walk, window, desk, bed, sit, work, wave, dance, chai… or "say <anything>"', 5.5);
    };
    api.play = play; api.say = say; api.bones = bones; api.rig = rig; api.walkTo = walkTo; api.sit = goSit; api.type = goType; api.bed = goBed; api.up = ensureStanding;
    api.state = () => ({ state, where, base: base && base.getClip().name, chairYaw: +chairYaw.toFixed(2) });
    api._dbg = { clips, sampler, mixer, setBase, rest, actions };
    api.debugClip = (name, opts) => { state = 'stand'; rig.position.set(0.35, 0, 1.1); rig.rotation.set(0, 0.15, 0); setBase(name, opts || {}); };
    api.ready = true;
    setTimeout(() => api.command('hi'), 1500);
  })().catch((e) => console.warn('avatar failed to load', e));

  /* ---------- control bar ---------- */
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:16px;bottom:52px;z-index:45;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:min(640px,calc(100vw - 32px));font:500 12px/1 system-ui,sans-serif';
  const chipCss = 'cursor:pointer;border:1px solid rgba(255,255,255,.14);background:rgba(12,14,20,.78);color:#e9ecf3;padding:7px 10px;border-radius:999px;font:inherit;backdrop-filter:blur(6px)';
  [['💻', 'work'], ['🚶', 'walk'], ['🪑', 'sit'], ['👋', 'wave'], ['🕺', 'dance'], ['☕', 'drink'], ['🙆', 'stretch'], ['📱', 'phone'], ['😂', 'laugh'], ['😴', 'sleep']].forEach(([icon, act]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = icon; b.title = act; b.setAttribute('aria-label', act); b.style.cssText = chipCss;
    b.addEventListener('click', () => api.command(act)); bar.appendChild(b);
  });
  const input = document.createElement('input');
  input.type = 'text'; input.placeholder = 'Tell me what to do…  ("go to window", "chai", "say hi")'; input.maxLength = 120; input.setAttribute('aria-label', 'Tell the avatar what to do');
  input.style.cssText = chipCss + ';cursor:text;flex:1 1 220px;min-width:0;outline:none;border-radius:12px;padding:9px 12px;font-size:13px';
  ['keydown', 'keyup', 'keypress'].forEach(ev => input.addEventListener(ev, e => e.stopPropagation()));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { api.command(input.value); input.value = ''; } });
  bar.appendChild(input);
  document.body.appendChild(bar);

  return api;
}
