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
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;z-index:39;pointer-events:none;transform:translate(-50%,-100%);padding:7px 11px;border-radius:10px;background:rgba(12,14,20,.86);color:#e9ecf3;border:1px solid rgba(255,255,255,.14);font:500 12.5px/1.3 system-ui,sans-serif;opacity:0;transition:opacity .4s;white-space:nowrap';
  document.body.appendChild(note);
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

  const EXIT = new T.Vector3(0.1, 0, 2.12);                    // he leaves / returns over the open front edge of the room
  const BASKET = new T.Vector3(2.19, 0.26, -0.06), BASKET_R = 0.118;   // waste basket rim (room coords)
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
      drink:   { clip: 'drink', dur: 5.2, prop: 'bottle' },
      stretch: { clip: 'stretch', dur: 6, face: 'closed' },
      neck:    { clip: 'neckStretch', dur: 3.2, face: 'closed' },
      phone:   { clip: 'phone', dur: 8, prop: 'phone', from: 1.5 },
      laugh:   { clip: 'sitLaugh', dur: 4.5, look: 1, face: 'laugh' },
      thumbs:  { look: 1, dur: 2.6, face: 'smile', pose: (t) => ({ shL: [-1.1, 0, -0.1], elL: [-1.35, 0, 0], head: [0.04 + S(t * 6) * 0.04, 0, 0.06] }) },
      think:   { look: 1, dur: 4.5, face: 'brow', pose: (t) => ({ shR: [-0.8, 0, 0.95], elR: [-2.1, 0, 0], head: [0.12, -0.18, -0.1 + S(t * 1.2) * 0.03] }) },
      nod:     { look: 1, dur: 1.8, face: 'smile', pose: (t) => ({ head: [0.1 + S(t * 9) * 0.18, 0, 0] }) },
      no:      { look: 1, dur: 1.9, pose: (t) => ({ head: [0.03, S(t * 9) * 0.36, 0] }) },
      shrug:   { look: 1, dur: 2.2, face: 'brow', pose: () => ({ shL: [-0.35, 0, 0.5], shR: [-0.35, 0, -0.5], elL: [-1.7, 0, 0.5], elR: [-1.7, 0, -0.5], head: [0, 0, 0.14] }) },
      toss:    { dur: 2.3, face: 'neutral', pose: (t) => tossPose(t) },
      talk:    { look: 1, dur: 3, face: 'talk', pose: (t) => ({ head: [0.02 + S(t * 5) * 0.03, S(t * 1.7) * 0.06, 0] }) },
    };

    /* paper toss: crumple with both hands, wind up, overhand throw (key poses blended with smoothstep) */
    const TOSS_KEYS = [
      { t: 0.0,  shR: [-0.75, 0, 0.45], elR: [-1.5, 0, 0], shL: [-0.75, 0, -0.45, 1], elL: [-1.5, 0, 0, 1], head: [0.28, 0, 0], torso: [0.06, 0, 0] },
      { t: 0.95, shR: [-0.8, 0, 0.4],   elR: [-1.55, 0, 0], shL: [-0.75, 0, -0.45, 1], elL: [-1.5, 0, 0, 1], head: [0.25, 0, 0], torso: [0.06, 0, 0] },
      { t: 1.38, shR: [-2.75, 0, -0.12], elR: [-1.95, 0, 0], shL: [-0.3, 0, 0.1, 0.3], elL: [-1.0, 0, 0, 0.3], head: [-0.05, 0, 0], torso: [-0.12, 0.12, 0] },
      { t: 1.56, shR: [-1.45, 0, 0.05], elR: [-0.25, 0, 0], shL: [-0.2, 0, 0.1, 0], elL: [-1.0, 0, 0, 0], head: [0.0, 0, 0], torso: [0.16, -0.1, 0] },
      { t: 2.3,  shR: [-0.6, 0, 0.12],  elR: [-0.6, 0, 0],  shL: [-0.2, 0, 0.1, 0], elL: [-1.0, 0, 0, 0], head: [0.0, 0, 0], torso: [0.04, 0, 0] },
    ];
    function tossPose(t) {
      let a = TOSS_KEYS[0], b = TOSS_KEYS[TOSS_KEYS.length - 1];
      for (let i = 0; i < TOSS_KEYS.length - 1; i++) if (t >= TOSS_KEYS[i].t && t <= TOSS_KEYS[i + 1].t) { a = TOSS_KEYS[i]; b = TOSS_KEYS[i + 1]; break; }
      const k = smooth(clamp((t - a.t) / Math.max(0.001, b.t - a.t), 0, 1)), out = {};
      for (const j of ['shR', 'elR', 'shL', 'elL', 'head', 'torso']) { const A = a[j], B = b[j], n = Math.max(A.length, B.length), o = []; for (let i = 0; i < n; i++) { const av = A[i] === undefined ? 1 : A[i], bv = B[i] === undefined ? 1 : B[i]; o.push(av + (bv - av) * k); } out[j] = o; }
      if (t < 0.95) { const wig = S(t * 22) * 0.06; out.elR[0] += wig; out.elL[0] -= wig; }   // crumpling
      return out;
    }

    /* full-body takes: a seated and/or standing mocap clip played as a one-shot base, then back to the posture's loop.
       `win` = seconds (clip time) during which the hand prop is out. `needStand`: he gets up for it, like a person would. */
    const FULL = {
      drink:   { sit: 'sitDrink', stand: 'drink', from: { sitDrink: 0.8 }, win: { sitDrink: [2.0, 7.6], drink: [0.6, 7.8] } },
      laugh:   { sit: 'sitLaugh', stand: 'laugh', cut: 5.5 },
      stretch: { stand: 'stretch', cut: 7.5, needStand: true },
      phone:   { stand: 'phone', cut: 9, from: { phone: 1.5 } },
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
    const bottleMat = new T.MeshStandardMaterial({ color: 0x8fd0ff, roughness: 0.15, transparent: true, opacity: 0.78, emissive: 0x2a6fa8, emissiveIntensity: 0.35 });
    function makeBottle(name) {
      const g = new T.Group(); g.name = name;
      const body = new T.Mesh(new T.CylinderGeometry(0.031, 0.031, 0.15, 20), bottleMat); body.position.y = 0.075; g.add(body);
      const neck = new T.Mesh(new T.CylinderGeometry(0.014, 0.029, 0.035, 20), bottleMat); neck.position.y = 0.167; g.add(neck);
      const cap = new T.Mesh(new T.CylinderGeometry(0.016, 0.016, 0.022, 16), propMat(0xf2f4f8, 0.3)); cap.position.y = 0.195; g.add(cap);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }
    /* gripped in the fist: the bottle's axis runs along the thumb direction (hanging-arm +z), hand around its middle */
    const mug = new T.Group(); mug.name = 'avatar_bottle_hand';
    const inHand = makeBottle('avatar_bottle_mesh'); inHand.rotation.x = Math.PI / 2; inHand.position.set(0, 0, -0.09); mug.add(inHand);
    attach(mug, [0.03, -0.085, 0.0]);
    const deskBottle = makeBottle('desk_water_bottle'); deskBottle.position.set(0.93, 0.7775, -1.0); root.add(deskBottle);
    const paperGeo = new T.IcosahedronGeometry(0.034, 0), paperMat = new T.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.95, flatShading: true, emissive: 0xf3f1ea, emissiveIntensity: 0.18 });
    const handBall = new T.Mesh(paperGeo, paperMat); handBall.name = 'avatar_paper_hand'; handBall.castShadow = true;
    attach(handBall, [0.035, -0.08, 0.02]);
    const phone = new T.Group(); phone.name = 'avatar_phone';
    phone.add(new T.Mesh(new T.BoxGeometry(0.074, 0.15, 0.01), propMat(0x0e0f12, 0.05)));
    const ps = new T.Mesh(new T.PlaneGeometry(0.066, 0.14), new T.MeshBasicMaterial({ color: 0x9fd0ff, toneMapped: false })); ps.position.z = 0.0056; phone.add(ps);
    attach(phone, [0.02, -0.12, 0.04], Q(-0.6, 0, 0));

    /* ---------- state ---------- */
    /* states: type | sit | walk | stand | standing_up | sitting_down | swivel | climb_in | climb | climb_down | climb_end | to_bed | inbed | from_bed */
    let state = 'type', transT = 0, path = [], faceAfter = 0, onArrive = null, where = 'seat';
    let gesture = null, gStart = 0, gW = 0, last = nowS(), nextBlink = 2, nextAuto = nowS() + 20;
    let conversing = false, nextHuman = 0, standUntil = 0, holdUntil = 0, curMode = null, awayNote = '', fade = 1, fadeTarget = 1;
    let tossActive = false, tossQueue = 0, tossUntil = 0, tossReleased = false, tossWaiting = false; const balls = [], score = { made: 0, tried: 0 };
    let chairYaw = YAW_DESK, chairYawTarget = YAW_DESK, chairSlide = DESK_SLIDE, chairSlideTarget = DESK_SLIDE, swivelThen = null;
    const SPEED = 0.85, TRANS = 1.15;
    const v2 = (a) => new T.Vector3(a[0], 0, a[1]);
    const viaBack = () => (where === 'desk' || where === 'door') ? SPOTS[where].via.slice().reverse().map(v2) : where === 'exit' ? [v2([0.25, 1.3])] : [];
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
    /* swivel the chair (from typing or sitting) to face `yaw`; ends in state 'sit' */
    function faceYaw(yaw, then) {
      if (state === 'sit') {
        if (Math.abs(angDiff(yaw, chairYaw)) < 0.04) { if (then) then(); }
        else swivel(yaw, 0, () => { state = 'sit'; if (then) then(); });
      } else if (state === 'type') {
        setBase('typeToSit', { once: true, fade: 0.25 }); state = 'swivel'; swivelThen = null; chairYawTarget = chairYaw; chairSlideTarget = chairSlide;
        onBaseEnd = () => { setBase('sitIdle', { fade: 0.3 }); swivel(yaw, 0, () => { state = 'sit'; if (then) then(); }); };
      } else if (then) then();
    }
    const faceRoom = (then) => faceYaw(YAW_OUT, then);
    function standUp(then) {
      if (state === 'sit' && Math.abs(angDiff(YAW_OUT, chairYaw)) > 0.04) { faceYaw(YAW_OUT, () => standUp(then)); return; }
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
      else if (state === 'away') comeBack(then);
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
      walkTo(k, () => { setTimeout(() => { if (state === 'stand' && where === k && !conversing) goHome(); }, 9000 + Math.random() * 6000); });
    }

    /* ---------- daily routine on the owner's clock (Vancouver). `?time=08:50` previews any moment ---------- */
    const TZ = 'America/Vancouver';
    const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
    let clockOffset = 0;
    function ownerClock() {
      const parts = {}; for (const pt of clockFmt.formatToParts(new Date(Date.now() + clockOffset))) parts[pt.type] = pt.value;
      const dayQ = new URLSearchParams(location.search).get('day');   // ?day=weekday|weekend for previews
      return { mins: (Number(parts.hour) % 24) * 60 + Number(parts.minute), weekend: dayQ ? dayQ === 'weekend' : (parts.weekday === 'Sat' || parts.weekday === 'Sun') };
    }
    { const q = new URLSearchParams(location.search).get('time'); if (q && /^\d{1,2}:\d{2}$/.test(q)) { const [h, m] = q.split(':').map(Number); clockOffset = ((h * 60 + m) - ownerClock().mins) * 60000; } }
    const H = (h, m = 0) => h * 60 + m;
    const WEEKDAY = [[0, 'sleep', 'Asleep — up around 7:40'], [H(7, 40), 'wake'], [H(8), 'morning'], [H(8, 30), 'work'], [H(8, 55), 'away', 'School drop-off — back around 9:25'],
      [H(9, 25), 'work'], [H(12, 15), 'away', 'Out for lunch — back at 1:00'], [H(13), 'work'], [H(17, 15), 'evening'], [H(22, 45), 'sleep', 'Asleep — up around 7:40']];
    const WEEKEND = [[0, 'sleep', 'Asleep — it is the weekend'], [H(8, 30), 'wake'], [H(9), 'evening'], [H(23, 15), 'sleep', 'Asleep — it is the weekend']];
    function modeNow() { const c = ownerClock(), tbl = c.weekend ? WEEKEND : WEEKDAY; let cur = tbl[0]; for (const row of tbl) if (c.mins >= row[0]) cur = row; return { mode: cur[1], note: cur[2] || '' }; }
    const stable = () => ['sit', 'type', 'stand', 'inbed', 'away'].includes(state);
    function goHome() { if (curMode === 'work') goType(); else if (curMode === 'sleep') goBed(); else if (curMode === 'away') goAway(awayNote); else goSit(() => faceYaw(YAW_OUT)); }
    function enterMode(m) {
      awayNote = m.note;
      if (m.mode === 'sleep') goBed();
      else if (m.mode === 'away') goAway(m.note);
      else if (m.mode === 'work') goType();
      else if (m.mode === 'wake') ensureStanding(() => play('stretch'));
      else goSit(() => faceYaw(YAW_OUT));
    }
    const pickW = (list) => { let r = Math.random() * list.reduce((a, x) => a + x[1], 0); for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; } return list[0][0]; };
    function activity() {
      if (curMode === 'sleep' || curMode === 'away') { if (state !== 'inbed' && state !== 'away') goHome(); return; }
      if (curMode === 'work' && state !== 'type') { goType(); return; }
      if (state === 'stand') { if (Math.random() < 0.5) goHome(); else play(pickW([['drink', 3], ['phone', 3], ['laugh', 1], ['think', 2], ['neck', 1]])); return; }
      if (curMode !== 'work' && state === 'type') { faceRoom(); return; }
      const a = curMode === 'work'
        ? pickW([['drink', 24], ['think', 10], ['neck', 10], ['laugh', 9], ['phone', 13], ['stretch', 12], ['wander', 14], ['window', 8]])
        : pickW([['phone', 30], ['drink', 18], ['laugh', 10], ['think', 8], ['stretch', 10], ['wander', 16], ['window', 8]]);
      if (a === 'wander') wander(); else if (a === 'window') walkTo('window', () => setTimeout(() => { if (state === 'stand' && !conversing) goHome(); }, 8000 + Math.random() * 6000)); else play(a);
    }
    /* out of the room: walk off over the front edge, fade; come back the same way */
    function goAway(note) {
      awayNote = note || awayNote; if (state === 'away') return;
      ensureStanding(() => { path = [...viaBack(), v2([0.25, 1.3]), EXIT.clone()]; faceAfter = 0; state = 'walk'; where = 'exit'; setBase('walk', { fade: 0.3, timeScale: 0.85 }); onArrive = () => { state = 'away'; fadeTarget = 0; }; });
    }
    function comeBack(then) { rig.position.copy(EXIT); rig.rotation.set(0, Math.PI, 0); fadeTarget = 1; state = 'stand'; where = 'exit'; setBase('idle', { fade: 0.2 }); if (then) then(); }

    /* ---------- paper toss ---------- */
    const tossYaw = () => Math.atan2(BASKET.x - SEAT.x, BASKET.z - SEAT.z);
    function toss() {
      if (['away', 'inbed', 'to_bed', 'from_bed', 'climb', 'climb_in', 'climb_down', 'climb_end'].includes(state)) return { ok: false, reason: state === 'away' ? 'away' : 'asleep' };
      tossQueue = Math.min(3, tossQueue + 1); tossUntil = nowS() + 12;
      if (!tossActive) { tossActive = true; const go = () => faceYaw(tossYaw(), throwOne); if (state === 'sit' || state === 'type') go(); else goSit(go); }
      return { ok: true };
    }
    function throwOne() { if (state !== 'sit') { tossActive = false; tossQueue = 0; return; } tossQueue = Math.max(0, tossQueue - 1); tossReleased = false; tossWaiting = true; play('toss'); }
    function launchBall() {
      handBall.updateWorldMatrix(true, false); const p0 = new T.Vector3().setFromMatrixPosition(handBall.matrixWorld); root.worldToLocal(p0);
      const good = Math.random() < 0.62, ang = Math.random() * Math.PI * 2, rad = good ? Math.random() * BASKET_R * 0.75 : BASKET_R + 0.06 + Math.random() * 0.22;
      const target = new T.Vector3(BASKET.x + Math.cos(ang) * rad, BASKET.y, BASKET.z + Math.sin(ang) * rad), TT = 0.82, g = 9.8;
      const m = new T.Mesh(paperGeo, paperMat); m.name = 'paper_ball'; m.castShadow = true; m.position.copy(p0); m.raycast = () => {}; root.add(m);
      balls.push({ m, v: new T.Vector3((target.x - p0.x) / TT, (target.y - p0.y + 0.5 * g * TT * TT) / TT, (target.z - p0.z) / TT), spin: new T.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), decided: false, rest: false, inside: false, born: nowS() });
      if (balls.length > 9) { const old = balls.shift(); root.remove(old.m); }
    }
    function tossResult(made) {
      score.tried++; if (made) score.made++; tossWaiting = false;
      say(made ? pickOne(['Swish! 🗑️', 'Nothing but bin', 'Too easy', 'Got it!']) : pickOne(['So close…', 'Rim out!', 'Wind. Definitely the wind.', 'Warm-up shot']), 2.6);
      if (api.onToss) { try { api.onToss({ ...score, made_last: made }); } catch (e) {} }
      setTimeout(() => { if (tossQueue > 0 && state === 'sit') throwOne(); }, 900);
    }

    let fullClip = null, fullAfter = null;
    function playFull(name, clip, after) {
      const f = FULL[name], g = GESTURES[name] || {}, from = (f.from && f.from[clip]) || 0;
      gesture = { name, full: true, clip, from, dur: Math.min(f.cut || 1e9, clips[clip].duration - from - 0.05), face: g.face, prop: g.prop, win: f.win && f.win[clip], ret: state === 'type' ? 'typing' : state === 'sit' ? 'sitIdle' : 'idle' };
      gStart = nowS(); fullClip = clip; fullAfter = after || null;
      setBase(clip, { once: true, fade: 0.45, from });
    }
    function play(name, dur) {
      const g = GESTURES[name]; if (!g) return false;
      const f = FULL[name];
      if (f && actions[f.sit || f.stand]) {
        const sitting = state === 'sit' || state === 'type';
        if (f.needStand && sitting) { const back = state; standUp(() => playFull(name, f.stand, () => (back === 'type' && !conversing ? goType() : goSit()))); return true; }
        const clip = sitting ? f.sit : state === 'stand' ? f.stand : null;
        if (clip && actions[clip]) { playFull(name, clip); return true; }
      }
      gesture = { ...g, name, dur: dur || g.dur || (g.clip ? clips[g.clip].duration * (g.loops || 1) : 3), s: g.clip ? sampler(g.clip) : null }; gStart = nowS();
      mug.visible = g.prop === 'bottle'; deskBottle.visible = !mug.visible; phone.visible = g.prop === 'phone';
      if (state === 'type' && conversing) faceRoom();   // turn to the visitor only when someone is actually talking to him
      return true;
    }

    /* initial pose: typing at the desk */
    placeOnChair(); setBase('typing');
    { const m0 = modeNow(); curMode = m0.mode; awayNote = m0.note;
      if (m0.mode === 'sleep') { chairYaw = chairYawTarget = YAW_OUT; chairSlide = chairSlideTarget = 0; state = 'inbed'; where = 'ladder'; rig.position.copy(BED_LIE); rig.quaternion.copy(Q(0, BED_YAW, 0)); setBase('lieDown', { once: true, from: -0.05, fade: 0 }); }
      else if (m0.mode === 'away') { chairYaw = chairYawTarget = YAW_OUT; chairSlide = chairSlideTarget = 0; state = 'away'; where = 'exit'; rig.position.copy(EXIT); fade = 0.02; fadeTarget = 0; setBase('idle', { fade: 0 }); }   // the fade pass hides him on the first frame
      else if (m0.mode !== 'work') { chairYaw = chairYawTarget = YAW_OUT; chairSlide = chairSlideTarget = 0; state = 'sit'; placeOnChair(); setBase('sitIdle', { fade: 0 }); } }

    const headPos = new T.Vector3(), camLocal = new T.Vector3(), tq = new T.Quaternion(), tv = new T.Vector3(), lieQ = Q(-Math.PI / 2, 0, 0), topQ = new T.Quaternion(), tmpV = new T.Vector3();
    const LADDER_TOP = new T.Vector3(climbX(CLIMB_Y1), CLIMB_Y1, LADDER_FOOT.z);
    api.update = function update() {
      const now = nowS(), dt = Math.min(0.1, now - last); last = now;

      /* --- chair + locomotion --- */
      if (chair && !onChair()) { chair.rotation.y = chairYaw; chair.position.copy(chairHome).addScaledVector(yawFwd(chairYaw), chairSlide); }
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

      /* --- paper toss: ball grows in the hands, leaves at the release frame --- */
      if (gesture && gesture.name === 'toss') {
        const tt = now - gStart; handBall.visible = tt > 0.2 && !tossReleased; handBall.scale.setScalar(clamp((tt - 0.2) / 0.6, 0.25, 1));
        if (!tossReleased && tt >= 1.53) { tossReleased = true; handBall.visible = false; launchBall(); }
      } else handBall.visible = false;
      for (const b of balls) {
        if (b.rest) continue;
        const pm = b.m.position, prevY = pm.y; b.v.y -= 9.8 * dt; pm.addScaledVector(b.v, dt);
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt;
        const dx = pm.x - BASKET.x, dz = pm.z - BASKET.z, dist = Math.hypot(dx, dz);
        if (!b.decided && b.v.y < 0 && prevY >= BASKET.y && pm.y < BASKET.y) { b.decided = true; b.inside = dist < BASKET_R; tossResult(b.inside); }
        if (b.inside) { if (dist > BASKET_R - 0.04) { pm.x = BASKET.x + dx / dist * (BASKET_R - 0.04); pm.z = BASKET.z + dz / dist * (BASKET_R - 0.04); b.v.x *= -0.2; b.v.z *= -0.2; } if (pm.y < 0.07) { pm.y = 0.07; b.rest = true; } }
        else {
          if (pm.y < 0.05) { pm.y = 0.05; if (!b.decided) { b.decided = true; tossResult(false); } if (Math.abs(b.v.y) < 0.6) { b.rest = true; } else { b.v.y *= -0.42; b.v.x *= 0.55; b.v.z *= 0.55; b.spin.multiplyScalar(0.5); } }
          if (pm.x > 2.47) { pm.x = 2.47; b.v.x *= -0.4; } if (pm.z < -1.7) { pm.z = -1.7; b.v.z *= -0.4; }
        }
      }
      if (tossActive && !tossWaiting && !gesture && tossQueue === 0 && now > tossUntil) { tossActive = false; curMode = null; }

      /* --- fade in / out when he leaves or returns --- */
      if (fade !== fadeTarget) {
        fade += clamp(fadeTarget - fade, -dt / 0.6, dt / 0.6); if (Math.abs(fade - fadeTarget) < 0.01) fade = fadeTarget;
        model.traverse(o => { if (o.isMesh) { const mt = o.material; if (mt.userData.baseTransparent === undefined) { mt.userData.baseTransparent = mt.transparent; mt.userData.baseOpacity = mt.opacity; } mt.transparent = fade < 1 ? true : mt.userData.baseTransparent; mt.opacity = mt.userData.baseOpacity * fade; } });
        model.visible = fade > 0.01;
      }

      /* --- gesture layer --- */
      let faceMode = state === 'inbed' || state === 'to_bed' ? 'closed' : 'neutral', look = 0;
      if (gesture) {
        const t = now - gStart;
        if (gesture.full) {
          const ct = gesture.from + t, w = gesture.win;
          if (gesture.prop === 'bottle') { mug.visible = !w || (ct >= w[0] && ct <= w[1]); deskBottle.visible = !mug.visible; }
          if (gesture.prop === 'phone') phone.visible = true;
          faceMode = gesture.face || 'neutral';
          if (t > gesture.dur) {
            const g0 = gesture; gesture = null; mug.visible = phone.visible = false; deskBottle.visible = true;
            if (base === actions[g0.clip]) setBase(g0.ret, { fade: 0.5 });
            const f = fullAfter; fullAfter = null; if (f) f();
          }
        }
        else if (t > gesture.dur) gesture = null;
        else {
          const k = clamp(Math.min(t / 0.4, (gesture.dur - t) / 0.4), 0, 1); gW += (k - gW) * (1 - Math.exp(-dt * 10));
          faceMode = gesture.face || 'neutral'; look = gesture.look ? k : 0;
          const w = smooth(clamp(gW, 0, 1));
          if (gesture.s) gesture.s.apply(((gesture.from || 0) + t) % gesture.s.duration, w);
          else if (gesture.pose) { const p = gesture.pose(t); for (const j in p) { const n = JOINT[j]; if (bones[n]) bones[n].quaternion.slerp(targetLocal(n, p[j], tq), w * (p[j][3] === undefined ? 1 : p[j][3])); } }
        }
      } else { gW += (0 - gW) * (1 - Math.exp(-dt * 8)); if (gW < 0.01 && !gesture) { mug.visible = phone.visible = false; deskBottle.visible = true; } }
      /* head turns toward whoever is watching during social gestures / while sitting facing the room */
      const wantLook = (gesture && gesture.full) ? 0 : (look || (state === 'sit' || (conversing && state === 'stand') ? 0.6 : 0));
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
      blob.position.x = rig.position.x; blob.position.z = rig.position.z; blob.material.opacity = (onChair() ? 0.25 : 1) * clamp(1 - rig.position.y / 0.4, 0, 1) * fade;
      if (now < bubbleUntil) {
        bones.Head.getWorldPosition(headPos); headPos.y += 0.3; headPos.project(stage._camera);
        const r = stage.getBoundingClientRect();
        bubble.style.left = (r.left + (headPos.x + 1) / 2 * r.width) + 'px'; bubble.style.top = (r.top + (1 - headPos.y) / 2 * r.height) + 'px';
        bubble.style.opacity = headPos.z < 1 ? '1' : '0';
      } else bubble.style.opacity = '0';
      if (conversing) {
        if (now > nextHuman && !gesture && (state === 'sit' || state === 'stand')) {
          nextHuman = now + 16 + Math.random() * 18;
          const r = Math.random();
          if (state === 'stand') { if (now > standUntil) goSit(); else play(pickOne(['drink', 'neck', 'phone', 'think'])); }
          else if (r < 0.34) play('drink');
          else if (r < 0.48) play('neck');
          else if (r < 0.68) standUp(() => { standUntil = nowS() + 22 + Math.random() * 20; });   // stretch the legs, keep talking
          else if (r < 0.84) play('stretch');
          else play('think');
        }
      } else if (now > holdUntil && !gesture && !tossActive && stable()) {
        const m = modeNow();
        if (m.mode !== curMode) { curMode = m.mode; enterMode(m); nextAuto = now + 20; }
        else if (now > nextAuto) { nextAuto = now + 30 + Math.random() * 55; activity(); }
      }
      /* a note where he would be, so visitors know why the room is empty / quiet */
      const showNote = (state === 'away' || (state === 'inbed' && curMode === 'sleep')) && !conversing && awayNote;
      if (showNote) {
        note.textContent = (state === 'away' ? '🚪 ' : '💤 ') + awayNote;
        headPos.copy(state === 'away' ? SEAT : BED_LIE); headPos.y = state === 'away' ? 1.25 : 2.15; if (state !== 'away') headPos.z = -0.1; root.localToWorld(headPos); headPos.project(stage._camera);
        const r = stage.getBoundingClientRect(); note.style.left = (r.left + (headPos.x + 1) / 2 * r.width) + 'px'; note.style.top = (r.top + (1 - headPos.y) / 2 * r.height) + 'px';
      }
      note.style.opacity = showNote ? '1' : '0';
    };

    /* ---------- text commands ---------- */
    const GO = [
      [/\b(window|khidki|bahar|outside|view)\b/, 'window', ['Let me check the view', 'Nice view from here 🌆']],
      [/\b(desk|monitor|setup)\b/, 'desk', ['This is my setup 🖥️']],
      [/\b(door|darwaza|gate)\b/, 'door', ['Someone at the door? 🚪']],
      [/\b(come here|idhar aa|aaja|aa ja|center|front|samne|saamne|closer|paas)\b/, 'center', ['Yes? 👀', 'Here I am']],
    ];
    const RULES = [
      [/\b(dance|party|naach|nach|vibe|music|gaana)\b/, 'dance', ['Dance mode 🕺', 'Turn it up!']],
      [/\b(stretch|tired|thak|thaka|break|angdai)\b/, 'stretch', ['Aaah… needed that', 'Long day']],
      [/\b(neck|gardan)\b/, 'neck', ['Stiff neck…']],
      [/\b(drink|coffee|chai|tea|water|paani|pani|sip)\b/, 'drink', ['Water break 💧', 'Hydration first']],
      [/\b(phone|scroll|insta|instagram|text|call|reel|reels)\b/, 'phone', ['One sec, replying…', 'Just one message 📱']],
      [/\b(lol|lmao|haha+|funny|joke|laugh|hasa)\b/, 'laugh', ['Hahaha 😂', 'Good one']],
      [/\b(think|idea|soch|socho|hmm+|why|how|kyu|kyun|kaise)\b/, 'think', ['Hmm, let me think…', 'Give me a second 🤔']],
      [/\b(nice|cool|great|awesome|good|thumbs|like|love|badhiya|mast|sahi)\b/, 'thumbs', ['👍 Nice!', 'Appreciate it!']],
      [/\b(shrug|idk|dunno|pata nahi|whatever|kya pata)\b/, 'shrug', ['Not sure 🤷', 'No idea, honestly']],
      [/\b(yes|yeah|yep|haan|han|ok|okay|nod|agree|right|theek)\b/, 'nod', ['Yes', 'Yep 👍']],
      [/\b(no|nah|nahi|nope|never|mat)\b/, 'no', ['No', 'Nope']],
      [/\b(hi+|hello|hey+|namaste|yo|sup|wave|bye|hola|salaam|kaise ho|welcome)\b/, 'wave', ['Hey! 👋 Welcome to my room', 'Hi there 👋', 'Hey! Look around, click stuff']],
    ];
    api.command = function command(text) {
      const raw = String(text || '').trim(); if (!raw) return; nextAuto = nowS() + 35;
      const m = raw.match(/^(say|bol|bolo)\s+(.+)/i);
      if (m) { play('talk', Math.min(7, 2 + m[2].length * 0.06)); say(m[2]); return; }
      const low = raw.toLowerCase();
      if (/\b(bed|bistar|palang|sleep|nap|so ja|soja|sleepy|night|zzz|sone)\b/.test(low)) { say(state === 'inbed' ? 'Already sleeping 😴' : pickOne(['Tired — going to bed 😴', 'Good night 🌙', 'Bed time 🛏️'])); goBed(); return; }
      if (/\b(wake|jaag|jag|utho|uth ja|get up)\b/.test(low)) { say("I'm up, I'm up 😩"); ensureStanding(); return; }
      if (/\b(type|typing|work|kaam|code|computer|laptop|pc|back to work)\b/.test(low)) { say(pickOne(['Back to work 💻', 'On it', 'Deadline day'])); goType(); return; }
      if (/\b(sit|baith|beth|wapas|chair|kursi|turn|mudh|ghoom ke dekh)\b/.test(low)) { say(state === 'sit' ? 'Already sitting 😄' : 'Yes, tell me'); goSit(); return; }
      if (/\b(stand|uth|khada)\b/.test(low)) { say('Standing up 💪'); ensureStanding(); return; }
      if (/\b(walk|ghoom|ghum|tehel|roam|wander|chal|move)\b/.test(low)) { say('Going for a little walk 🚶'); wander(); return; }
      for (const [re, key, lines] of GO) if (re.test(low)) { say(pickOne(lines)); walkTo(key); return; }
      if (/\b(dance|party|naach|nach|vibe|music|gaana)\b/.test(low)) { say(pickOne(['Dance mode 🕺', 'Turn it up!'])); ensureStanding(() => { state = 'stand'; setBase('dance', { fade: 0.4 }); setTimeout(() => { if (base === actions.dance) { setBase('idle', { fade: 0.5 }); } }, 9000); }); return; }
      if (GESTURES[low]) { const r = RULES.find(x => x[1] === low); play(low); if (r) say(pickOne(r[2])); return; }
      for (const [re, act, lines] of RULES) if (re.test(low)) { play(act); say(pickOne(lines)); return; }
      play('shrug'); say('Try: walk, window, desk, bed, sit, work, wave, dance, water… or "say <anything>"', 5.5);
    };
    api.converse = (on) => { conversing = !!on; nextHuman = nowS() + 10 + Math.random() * 10; if (!on) { curMode = null; holdUntil = nowS() + 5; } };
    api.hold = (secs) => { holdUntil = nowS() + secs; };   // pause the routine (e.g. while a job is running)
    api.toss = toss; api.score = () => ({ ...score }); api.mode = () => ({ ...modeNow(), state });
    api.play = play; api.say = say; api.bones = bones; api.rig = rig; api.walkTo = walkTo; api.sit = goSit; api.type = goType; api.bed = goBed; api.up = ensureStanding;
    api.state = () => ({ state, where, base: base && base.getClip().name, chairYaw: +chairYaw.toFixed(2) });
    api._dbg = { clips, sampler, mixer, setBase, rest, actions };
    api.debugClip = (name, opts) => { state = 'stand'; rig.position.set(0.35, 0, 1.1); rig.rotation.set(0, 0.15, 0); setBase(name, opts || {}); };
    api.ready = true;
    setTimeout(() => { if (state === 'sit') { play('wave'); say('Hey! 👋 Welcome to my room', 4); } else if (state === 'type') say('Hey! 👋 Click me to talk', 5); }, 1500);
  })().catch((e) => console.warn('avatar failed to load', e));


  return api;
}
