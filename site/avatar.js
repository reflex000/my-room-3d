/* Realistic rigged avatar (me.glb, Avaturn export) living in the study-corner room.
   - me-anims.glb: skeleton-only mocap clips (idle / walk / agree / headShake) retargeted by bone name
   - sitting + gestures are procedural poses authored in T-pose avatar axes and layered over the mixer
   - tiny state machine: sit <-> stand <-> walk between waypoints
   Usage (room.js): const avatar = createAvatar({ T, stage, seat }); room.add(avatar.group); avatar.update() each frame. */

export function createAvatar({ T, stage, seat }) {
  const root = new T.Group(); root.name = 'avatar';           // lives in room coordinates
  const rig = new T.Group(); rig.name = 'avatar_rig'; root.add(rig);
  const SCALE = 0.94;
  const api = { group: root, update() {}, command() {}, ready: false };

  const Q = (x = 0, y = 0, z = 0) => new T.Quaternion().setFromEuler(new T.Euler(x, y, z, 'XYZ'));
  const S = Math.sin, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), smooth = (k) => k * k * (3 - 2 * k);
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const nowS = () => performance.now() / 1000;

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

  /* ---------- waypoints (room coords) ---------- */
  const fwd = new T.Vector3(Math.sin(seat.rotY), 0, Math.cos(seat.rotY));
  const SEAT = new T.Vector3(seat.x, 0, seat.z);
  const STANDPT = SEAT.clone().addScaledVector(fwd, 0.52);
  /* loft bed: ladder leans on the room-facing side; he climbs it, steps over the rail and lies down head-to-wall */
  const LADDER_FOOT = new T.Vector3(-0.2, 0, 0.25), LADDER_TOP = new T.Vector3(-0.56, 2.0, 0.25), BED_LIE = new T.Vector3(-1.22, 1.64, 0.5);
  const Q_TOP = Q(0, -Math.PI / 2, 0), Q_LIE = Q(-Math.PI / 2, 0, 0);
  const SPOTS = {
    center: { p: [0.35, 1.1], face: 0.15 },
    window: { p: [1.12, 0.78], face: Math.PI / 2 },
    ladder: { p: [-0.13, 0.25], face: -Math.PI / 2 },
    desk:   { p: [1.08, -0.3], face: Math.PI - 0.25, via: [[0.95, 0.4]] },
    door:   { p: [-0.05, -0.05], face: Math.PI + 0.35, via: [[0.0, 0.55]] },
  };

  (async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const [gltf, animGltf] = await Promise.all([loader.loadAsync('./me.glb'), loader.loadAsync('./me-anims.glb')]);
    const model = gltf.scene; model.name = 'avatar_model';
    model.updateMatrixWorld(true);

    /* bones + rest data (captured in T-pose, avatar space) */
    const bones = {}, rest = {};
    model.traverse(o => { if (o.isBone) bones[o.name] = o; });
    for (const n in bones) { const b = bones[n]; rest[n] = { R: b.quaternion.clone(), W: b.getWorldQuaternion(new T.Quaternion()), p: b.position.clone() }; }
    /* local target for "rotate this bone by D, expressed in T-pose avatar axes" */
    const tmpQ = new T.Quaternion();
    const localFor = (n, D, out) => { const r = rest[n]; return out.copy(r.R).multiply(tmpQ.copy(r.W).invert()).multiply(D).multiply(r.W); };

    /* materials: same trick as the baked room — albedo as soft emissive so he reads in the dim neon light */
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

    /* ---------- mocap clips, retargeted by name ---------- */
    const mixer = new T.AnimationMixer(model);
    const srcHips = animGltf.scene.getObjectByName('mixamorigHips');
    const hipK = rest.Hips.p.y / (srcHips ? srcHips.position.y : 100);
    const actions = {}, q1 = new T.Quaternion(), q2 = new T.Quaternion();
    for (const clip of animGltf.animations) {
      const tracks = [];
      for (const tr of clip.tracks) {
        const [node, prop] = tr.name.split('.'); const bn = node.replace(/^mixamorig/, '');
        if (!bones[bn]) continue;
        if (prop === 'quaternion') {
          /* Xbot bones have identity rest rotations (world-aligned frames); Avaturn bones are bone-aligned.
             local' = Wp⁻¹ · q · Wp · R  (Wp = parent rest world rotation, R = rest local rotation) */
          const t2 = tr.clone(); t2.name = bn + '.quaternion';
          const par = bones[bn].parent, Wp = (par && rest[par.name]) ? rest[par.name].W : new T.Quaternion(), Wpi = Wp.clone().invert(), R = rest[bn].R, v = t2.values;
          for (let i = 0; i < v.length; i += 4) { q1.set(v[i], v[i + 1], v[i + 2], v[i + 3]); q2.copy(Wpi).multiply(q1).multiply(Wp).multiply(R); v[i] = q2.x; v[i + 1] = q2.y; v[i + 2] = q2.z; v[i + 3] = q2.w; }
          tracks.push(t2);
        }
        else if (prop === 'position' && bn === 'Hips') {
          const t2 = tr.clone(); t2.name = 'Hips.position';
          for (let i = 0; i < t2.values.length; i++) t2.values[i] *= hipK;
          if (clip.name === 'walk') for (let i = 0; i < t2.values.length; i += 3) { t2.values[i] = 0; t2.values[i + 2] = rest.Hips.p.z; }
          tracks.push(t2);
        }
      }
      const a = mixer.clipAction(new T.AnimationClip(clip.name, clip.duration, tracks)); a.play(); a.setEffectiveWeight(clip.name === 'idle' ? 1 : 0); actions[clip.name] = a;
    }
    let walkW = 0, climbW = 0, lieW = 0;

    /* ---------- procedural poses (Euler XYZ in T-pose avatar axes; arm chain uses "hanging arm" axes) ---------- */
    const DOWN = { L: Q(0, 0, -Math.PI / 2), R: Q(0, 0, Math.PI / 2) }, DOWNi = { L: DOWN.L.clone().invert(), R: DOWN.R.clone().invert() };
    const dq = new T.Quaternion(), eq = new T.Quaternion(), lq = new T.Quaternion(), eul = new T.Euler();
    function targetLocal(n, e, out) {
      eq.setFromEuler(eul.set(e[0], e[1], e[2], 'XYZ'));
      const side = n.startsWith('Left') ? 'L' : 'R';
      if (/Arm$/.test(n) && !/Fore/.test(n)) dq.copy(eq).multiply(DOWN[side]);                 // shoulder joint: hang, then swing
      else if (/ForeArm$|Hand$/.test(n)) dq.copy(DOWNi[side]).multiply(eq).multiply(DOWN[side]); // elbow / wrist in hanging-arm axes
      else dq.copy(eq);
      return localFor(n, dq, out);
    }
    const FINGERS = new Set(); for (const s of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) FINGERS.add(`${s}Hand${f}${k}`);
    const SIT = {
      Spine: [-0.1, 0, 0], Spine1: [0.02, 0, 0], Spine2: [0.03, 0, 0], Neck: [0.03, 0, 0], Head: [0.03, 0, 0],
      LeftUpLeg: [-1.5, 0.16, 0], RightUpLeg: [-1.5, -0.16, 0], LeftLeg: [1.45, 0, 0], RightLeg: [1.45, 0, 0], LeftFoot: [0.08, 0.1, 0], RightFoot: [0.08, -0.1, 0],
      LeftArm: [-0.12, 0, 0.2], RightArm: [-0.12, 0, -0.2], LeftForeArm: [-1.15, 0, -0.25], RightForeArm: [-1.15, 0, 0.25], LeftHand: [0, 0, 0], RightHand: [0, 0, 0],
    };
    const SIT_HIPS = new T.Vector3(0, 0.615 / SCALE, -0.035 / SCALE);
    const JOINT = { torso: 'Spine1', head: 'Head', shL: 'LeftArm', shR: 'RightArm', elL: 'LeftForeArm', elR: 'RightForeArm' };
    const GESTURES = {
      wave:    { look: 1, dur: 3.2, face: 'smile', pose: (t) => ({ shR: [0, 0, -2.45], elR: [0, 0, -0.55 + S(t * 9) * 0.45], head: [0, 0, -0.08], torso: [0, 0, 0.04] }) },
      thumbs:  { look: 1, dur: 2.6, face: 'smile', pose: (t) => ({ shL: [-1.1, 0, -0.1], elL: [-1.35, 0, 0], head: [0.04 + S(t * 6) * 0.04, 0, 0.06] }) },
      stretch: { dur: 4.4, face: 'closed', pose: (t) => ({ shL: [-0.2, 0, 2.7 + S(t * 1.6) * 0.08], shR: [-0.2, 0, -2.7 - S(t * 1.6) * 0.08], elL: [-0.2, 0, 0], elR: [-0.2, 0, 0], torso: [-0.2, 0, S(t * 1.6) * 0.05], head: [-0.3, 0, 0] }) },
      drink:   { dur: 4.6, prop: 'mug', pose: (t, k) => ({ shR: [-1.05, 0, 0.9], elR: [-1.9, 0, 0], head: [-0.2 * k, -0.12, 0], torso: [-0.06 * k, 0, 0] }) },
      phone:   { dur: 7.5, prop: 'phone', pose: (t) => ({ shR: [-0.55, 0, 0.3], elR: [-1.55, 0, 0], shL: [-0.5, 0, -0.32], elL: [-1.45, 0, 0], head: [0.4, S(t * 0.7) * 0.04, 0] }) },
      think:   { look: 1, dur: 4.5, face: 'brow', pose: (t) => ({ shR: [-0.8, 0, 0.95], elR: [-2.1, 0, 0], head: [0.12, -0.18, -0.1 + S(t * 1.2) * 0.03] }) },
      laugh:   { look: 1, dur: 2.8, face: 'laugh', pose: (t) => ({ torso: [-0.14 + S(t * 14) * 0.03, 0, 0], head: [-0.2 + S(t * 14) * 0.04, 0, 0] }) },
      nod:     { look: 1, dur: 1.8, face: 'smile', pose: (t) => ({ head: [0.1 + S(t * 9) * 0.18, 0, 0] }) },
      no:      { look: 1, dur: 1.9, pose: (t) => ({ head: [0.03, S(t * 9) * 0.36, 0] }) },
      shrug:   { look: 1, dur: 2.2, face: 'brow', pose: () => ({ shL: [-0.35, 0, 0.5], shR: [-0.35, 0, -0.5], elL: [-1.7, 0, 0.5], elR: [-1.7, 0, -0.5], head: [0, 0, 0.14] }) },
      dance:   { dur: 6.5, face: 'smile', pose: (t) => { const b = S(t * 7); return { torso: [0, S(t * 3.5) * 0.2, b * 0.08], head: [S(t * 7) * 0.08, S(t * 3.5) * -0.12, -b * 0.06], shL: [-0.9 - b * 0.35, 0, 0.35], elL: [-1.6, 0, 0], shR: [-0.9 + b * 0.35, 0, -0.35], elR: [-1.6, 0, 0] }; } },
      talk:    { look: 1, dur: 3, face: 'talk', pose: (t) => ({ head: [0.02 + S(t * 5) * 0.03, S(t * 1.7) * 0.06, 0], shL: [-0.4 + S(t * 3) * 0.08, 0, 0.2], elL: [-1.5 + S(t * 3) * 0.2, 0, 0] }) },
    };

    /* props on the right hand, placed in hanging-arm axes (x out, y up along the arm, z forward) */
    const propMat = (c, e = 0.25) => new T.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: e });
    bones.RightHand.updateWorldMatrix(true, false);
    const handW = new T.Matrix4().copy(bones.RightHand.matrixWorld).premultiply(new T.Matrix4().copy(model.matrixWorld).invert()); // hand rest matrix in avatar space
    function attach(obj, off) {
      const pos = new T.Vector3().setFromMatrixPosition(handW).add(new T.Vector3(...off).applyQuaternion(DOWNi.R));
      const M = new T.Matrix4().compose(pos, DOWNi.R, new T.Vector3(1, 1, 1));
      obj.matrix.copy(handW).invert().multiply(M); obj.matrix.decompose(obj.position, obj.quaternion, obj.scale); bones.RightHand.add(obj); obj.visible = false; return obj;
    }
    const mug = new T.Group(); mug.name = 'avatar_mug';
    mug.add(new T.Mesh(new T.CylinderGeometry(0.038, 0.034, 0.09, 20), propMat(0xf0ede6)));
    const mh = new T.Mesh(new T.TorusGeometry(0.025, 0.007, 8, 16), propMat(0xf0ede6)); mh.position.x = -0.042; mug.add(mh);
    attach(mug, [0, -0.1, 0.05]);
    const phone = new T.Group(); phone.name = 'avatar_phone';
    phone.add(new T.Mesh(new T.BoxGeometry(0.074, 0.15, 0.01), propMat(0x0e0f12, 0.05)));
    const ps = new T.Mesh(new T.PlaneGeometry(0.066, 0.14), new T.MeshBasicMaterial({ color: 0x9fd0ff, toneMapped: false })); ps.position.z = 0.0056; phone.add(ps);
    attach(phone, [0.02, -0.14, 0.045]);

    /* ---------- state ---------- */
    let state = 'sit', sitW = 1, transT = 0, path = [], faceAfter = 0, onArrive = null, gesture = null, gStart = 0, gW = 0, lastPose = null, last = nowS(), nextBlink = 2, nextAuto = nowS() + 14, where = 'seat';
    rig.position.copy(SEAT); rig.rotation.y = seat.rotY;
    const SPEED = 0.85, TRANS = 1.25;
    const v2 = (a) => new T.Vector3(a[0], 0, a[1]);
    const viaBack = () => (where === 'desk' || where === 'door') ? SPOTS[where].via.slice().reverse().map(v2) : [];

    function play(name, dur) {
      const g = GESTURES[name]; if (!g) return false;
      if (g.needSit && state !== 'sit') { goSit(() => play(name, dur)); return true; }
      gesture = { ...g, name, dur: dur || g.dur }; gStart = nowS();
      mug.visible = g.prop === 'mug'; phone.visible = g.prop === 'phone'; return true;
    }
    function standUp(then) {
      if (state === 'sit') { state = 'standing_up'; transT = 0; onArrive = then || null; }
      else if (state === 'standing_up') onArrive = then || null;
      else if (then) then();
    }
    let bedQueue = null;
    /* get on our feet from wherever we are (chair, bed, mid-transition), then run `then` */
    function ensureStanding(then) {
      if (state === 'sit' || state === 'standing_up') standUp(then);
      else if (state === 'sitting_down') onArrive = () => standUp(then);
      else if (state === 'inbed') { state = 'from_bed'; transT = 0; onArrive = then || null; }
      else if (state === 'climb_up' || state === 'to_bed') bedQueue = then || (() => {});
      else if (state === 'from_bed' || state === 'climb_down') onArrive = then || null;
      else if (then) then();
    }
    function walkTo(key, then) {
      const spot = SPOTS[key]; if (!spot) return;
      ensureStanding(() => { path = [...viaBack(), ...(spot.via || []).map(v2), v2(spot.p)]; faceAfter = spot.face; state = 'walk'; where = key; onArrive = then || null; });
    }
    function goSit(then) {
      if (state === 'sit') { if (then) then(); return; }
      ensureStanding(() => {
        path = [...viaBack(), STANDPT.clone()]; faceAfter = seat.rotY; state = 'walk'; where = 'seat';
        onArrive = () => { state = 'sitting_down'; transT = 0; onArrive = then || null; };
      });
    }
    function goBed() {
      if (state === 'inbed' || state === 'to_bed' || state === 'climb_up') return;
      ensureStanding(() => {
        path = [...viaBack(), LADDER_FOOT.clone()]; faceAfter = -Math.PI / 2; state = 'walk'; where = 'ladder';
        onArrive = () => { state = 'climb_up'; transT = 0; };
      });
    }
    function wander() {
      const keys = Object.keys(SPOTS).filter(k => k !== where); const k = pickOne(keys);
      walkTo(k, () => { setTimeout(() => { if (state === 'stand' && where === k) goSit(); }, 9000 + Math.random() * 6000); });
    }

    const headPos = new T.Vector3(), camLocal = new T.Vector3(), tq = new T.Quaternion(), tv = new T.Vector3();
    const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

    api.update = function update() {
      const now = nowS(), dt = Math.min(0.1, now - last); last = now;

      /* --- locomotion --- */
      if (state === 'standing_up' || state === 'sitting_down') {
        transT += dt / TRANS; const k = smooth(clamp(transT, 0, 1));
        sitW = state === 'standing_up' ? 1 - k : k;
        rig.position.lerpVectors(STANDPT, SEAT, sitW); rig.rotation.y = seat.rotY;
        if (transT >= 1) { state = state === 'standing_up' ? 'stand' : 'sit'; const f = onArrive; onArrive = null; if (f) f(); }
      } else if (state === 'climb_up' || state === 'climb_down') {
        const up = state === 'climb_up';
        transT += dt / 3.2; const k = clamp(transT, 0, 1);
        rig.position.lerpVectors(up ? LADDER_FOOT : LADDER_TOP, up ? LADDER_TOP : LADDER_FOOT, k); rig.quaternion.copy(Q_TOP);
        if (transT >= 1) {
          if (up) { state = 'to_bed'; transT = 0; }
          else { state = 'stand'; where = 'ladder'; const f = onArrive; onArrive = null; if (f) f(); }
        }
      } else if (state === 'to_bed' || state === 'from_bed') {
        transT += dt / 1.4; const k = smooth(clamp(transT, 0, 1)), a = state === 'to_bed' ? k : 1 - k;
        rig.position.lerpVectors(LADDER_TOP, BED_LIE, a); rig.quaternion.slerpQuaternions(Q_TOP, Q_LIE, a);
        if (transT >= 1) {
          if (state === 'to_bed') { state = 'inbed'; nextAuto = now + 45 + Math.random() * 30; say('Zzz\u2026 \ud83d\ude34', 4); if (bedQueue) { const f = bedQueue; bedQueue = null; ensureStanding(f); } }
          else { state = 'climb_down'; transT = 0; }
        }
      } else if (state === 'walk') {
        const tgt = path[0];
        if (!tgt) {
          const d = angDiff(faceAfter, rig.rotation.y);
          if (Math.abs(d) > 0.04) rig.rotation.y += clamp(d, -3.2 * dt, 3.2 * dt);
          else { rig.rotation.y = faceAfter; state = 'stand'; const f = onArrive; onArrive = null; if (f) f(); }
        } else {
          tv.subVectors(tgt, rig.position); tv.y = 0; const dist = tv.length();
          const d = angDiff(Math.atan2(tv.x, tv.z), rig.rotation.y);
          rig.rotation.y += clamp(d, -4.5 * dt, 4.5 * dt);
          const step = SPEED * dt * clamp(1.2 - Math.abs(d), 0.15, 1);
          if (dist <= step + 0.02) { rig.position.x = tgt.x; rig.position.z = tgt.z; path.shift(); } else rig.position.addScaledVector(tv.normalize(), step);
        }
      }
      const climbing = state === 'climb_up' || state === 'climb_down';
      const wantWalk = (state === 'walk' && path.length) || climbing ? 1 : 0; walkW += (wantWalk - walkW) * (1 - Math.exp(-dt * 8));
      actions.walk.setEffectiveWeight(walkW); actions.idle.setEffectiveWeight(1 - walkW); actions.walk.timeScale = climbing ? 0.55 : 0.8;
      climbW += ((climbing ? 1 : 0) - climbW) * (1 - Math.exp(-dt * 8));
      lieW += ((state === 'inbed' || state === 'to_bed' ? 1 : 0) - lieW) * (1 - Math.exp(-dt * 3));
      mixer.update(dt);

      /* --- sit pose over the mocap --- */
      if (sitW > 0.001) {
        const breathe = S(now * 1.5) * 0.012, lookY = S(now * 0.31) * 0.16 + S(now * 0.13) * 0.1, lookX = S(now * 0.23) * 0.04;
        for (const n in bones) {
          let e = SIT[n], tgt;
          if (e) {
            if (n === 'Spine2') e = [e[0] + breathe, e[1], e[2]]; else if (n === 'Head') e = [e[0] + lookX, e[1] + lookY * 0.6, e[2]]; else if (n === 'Neck') e = [e[0], e[1] + lookY * 0.4, e[2]];
            tgt = targetLocal(n, e, lq);
          } else if (FINGERS.has(n)) tgt = localFor(n, Q(0, 0, n.startsWith('Left') ? -0.32 : 0.32), lq);
          else tgt = lq.copy(rest[n].R);
          bones[n].quaternion.slerp(tgt, sitW);
        }
        bones.Hips.position.lerp(SIT_HIPS, sitW);
      }

      /* --- climbing: arms up on the rungs, slight forward lean --- */
      if (climbW > 0.005) {
        const c = { shL: [-2.55 + S(now * 4.2) * 0.3, 0, 0.3], shR: [-2.55 - S(now * 4.2) * 0.3, 0, -0.3], elL: [-0.8, 0, 0], elR: [-0.8, 0, 0], torso: [0.22, 0, 0], head: [-0.35, 0, 0] };
        for (const j in c) bones[JOINT[j]].quaternion.slerp(targetLocal(JOINT[j], c[j], tq), smooth(climbW));
      }

      /* --- lying in bed: hands on the belly, head rolled a little, slow breathing --- */
      if (lieW > 0.005) {
        const c = { shL: [0.12, -1.25, 0.3], shR: [0.12, 1.25, -0.3], elL: [-1.55 + S(now * 1.3) * 0.03, 0, 0], elR: [-1.55 + S(now * 1.3) * 0.03, 0, 0], head: [-0.12, 0.35, 0.08], torso: [S(now * 1.3) * 0.02, 0, 0] };
        for (const j in c) bones[JOINT[j]].quaternion.slerp(targetLocal(JOINT[j], c[j], tq), smooth(lieW));
      }

      /* --- gesture layer --- */
      let faceMode = state === 'inbed' || state === 'to_bed' ? 'closed' : 'neutral', look = 0;
      if (gesture) {
        const t = now - gStart;
        if (t > gesture.dur) gesture = null;
        else { const k = clamp(Math.min(t / 0.5, (gesture.dur - t) / 0.5), 0, 1); gW += (k - gW) * (1 - Math.exp(-dt * 10)); faceMode = gesture.face || 'neutral'; look = gesture.look ? k : 0; lastPose = gesture.pose(t, gW); }
      }
      if (!gesture) { gW += (0 - gW) * (1 - Math.exp(-dt * 8)); if (gW < 0.01) mug.visible = phone.visible = false; }
      if (lastPose && gW > 0.005) {
        const pose = { ...lastPose };
        if (look) {
          camLocal.copy(stage._camera.position); rig.worldToLocal(camLocal);
          const ang = clamp(Math.atan2(camLocal.x, camLocal.z), -1.6, 1.6) * look;
          pose.torso = [...(pose.torso || [0, 0, 0])]; pose.head = [...(pose.head || [0, 0, 0])]; pose.torso[1] += ang * 0.3; pose.head[1] += ang * 0.5;
        }
        const w = smooth(clamp(gW, 0, 1));
        for (const j in pose) { const n = JOINT[j]; if (!bones[n]) continue; bones[n].quaternion.slerp(targetLocal(n, pose[j], tq), w); }
      }

      /* --- face --- */
      if (now > nextBlink) nextBlink = now + 2.2 + Math.random() * 3.5;
      const blinking = nextBlink - now < 0.13 ? 1 : 0;
      const talking = faceMode === 'talk' || faceMode === 'laugh';
      const want = { blink: blinking, closed: faceMode === 'closed' || faceMode === 'laugh' ? 1 : 0, smile: faceMode === 'smile' ? 0.7 : faceMode === 'laugh' ? 1 : 0.08, brow: faceMode === 'brow' ? 0.8 : faceMode === 'smile' ? 0.3 : 0, jaw: talking ? 0.18 + S(now * 15) * 0.16 : 0, aa: talking ? 0.35 + S(now * 11) * 0.35 : 0, oo: talking ? 0.3 + S(now * 7 + 1) * 0.3 : 0 };
      for (const k in face) face[k] += (want[k] - face[k]) * (1 - Math.exp(-dt * (k === 'blink' ? 40 : 12)));
      const bl = Math.max(face.blink, face.closed);
      morph('eyeBlinkLeft', bl); morph('eyeBlinkRight', bl); morph('mouthSmile', face.smile); morph('browInnerUp', face.brow); morph('jawOpen', Math.max(0, face.jaw)); morph('viseme_aa', Math.max(0, face.aa)); morph('viseme_O', Math.max(0, face.oo)); morph('cheekSquintLeft', face.smile * 0.5); morph('cheekSquintRight', face.smile * 0.5);

      /* --- shadow, bubble, idle behaviour --- */
      blob.position.x = rig.position.x; blob.position.z = rig.position.z; blob.material.opacity = (1 - sitW * 0.75) * clamp(1 - rig.position.y / 0.4, 0, 1);
      if (now < bubbleUntil) {
        bones.Head.getWorldPosition(headPos); headPos.y += 0.3; headPos.project(stage._camera);
        const r = stage.getBoundingClientRect();
        bubble.style.left = (r.left + (headPos.x + 1) / 2 * r.width) + 'px'; bubble.style.top = (r.top + (1 - headPos.y) / 2 * r.height) + 'px';
        bubble.style.opacity = headPos.z < 1 ? '1' : '0';
      } else bubble.style.opacity = '0';
      if (now > nextAuto && !gesture && (state === 'sit' || state === 'stand' || state === 'inbed')) {
        nextAuto = now + 22 + Math.random() * 18;
        if (state === 'inbed') { say('Chalo, kaam pe wapas', 3); goSit(); }
        else if (state === 'sit') { const r = Math.random(); if (r < 0.45) wander(); else if (r < 0.55) goBed(); else play(pickOne(['stretch', 'drink', 'phone', 'think'])); }
      }
    };

    /* ---------- text commands ---------- */
    const GO = [
      [/\b(window|khidki|bahar|outside|view)\b/, 'window', ['Bahar ka view dekhta hoon', 'Nice view from here 🌆']],
      [/\b(desk|monitor|setup|work|kaam|computer|pc)\b/, 'desk', ['Yeh raha mera setup 🖥️', 'Back to work…']],
      [/\b(door|darwaza|gate)\b/, 'door', ['Koi aaya kya? 🚪']],
      [/\b(come here|idhar aa|aaja|aa ja|center|front|samne|saamne|closer|paas)\b/, 'center', ['Haan bol 👀', 'Aa gaya']],
    ];
    const RULES = [
      [/\b(dance|party|naach|nach|vibe|music|gaana)\b/, 'dance', ['Dance mode 🕺', 'DJ, volume badha!']],
      [/\b(stretch|tired|thak|thaka|break|angdai)\b/, 'stretch', ['Aaah… needed that', 'Long day bro']],
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
      const raw = String(text || '').trim(); if (!raw) return; nextAuto = nowS() + 30;
      const m = raw.match(/^(say|bol|bolo)\s+(.+)/i);
      if (m) { play('talk', Math.min(7, 2 + m[2].length * 0.06)); say(m[2]); return; }
      const low = raw.toLowerCase();
      if (/\b(bed|bistar|palang|sleep|nap|so ja|soja|sleepy|night|zzz|sone)\b/.test(low)) { say(state === 'inbed' ? 'So raha hoon yaar \ud83d\ude34' : pickOne(['Thak gaya, sone jaa raha hoon \ud83d\ude34', 'Good night \ud83c\udf19', 'Bed time \ud83d\udecf\ufe0f'])); goBed(); return; }
      if (/\b(wake|jaag|jag|utho|uth ja|get up)\b/.test(low)) { say('Uth gaya uth gaya \ud83d\ude29'); ensureStanding(); return; }
      if (/\b(sit|baith|beth|wapas|chair|kursi)\b/.test(low)) { say(state === 'sit' ? 'Baitha toh hoon 😄' : 'Theek hai, baith jaata hoon'); goSit(); return; }
      if (/\b(stand|uth|khada|get up)\b/.test(low)) { say('Uth gaya 💪'); standUp(); return; }
      if (/\b(walk|ghoom|ghum|tehel|roam|wander|chal|move)\b/.test(low)) { say('Thoda ghoom ke aata hoon 🚶'); wander(); return; }
      for (const [re, key, lines] of GO) if (re.test(low)) { say(pickOne(lines)); walkTo(key); return; }
      if (GESTURES[low]) { const r = RULES.find(x => x[1] === low); play(low); if (r) say(pickOne(r[2])); return; }
      for (const [re, act, lines] of RULES) if (re.test(low)) { play(act); say(pickOne(lines)); return; }
      play('shrug'); say('Try: walk, window, desk, bed, sit, wave, dance, chai… or "say <anything>"', 5.5);
    };
    api.play = play; api.say = say; api.bed = goBed; api.up = ensureStanding; api.bones = bones; api.rig = rig; api.walkTo = walkTo; api.sit = goSit; api.state = () => ({ state, sitW, where });
    api.ready = true;
    setTimeout(() => api.command('hi'), 1200);
  })().catch((e) => console.warn('avatar failed to load', e));

  /* ---------- control bar ---------- */
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:16px;bottom:52px;z-index:45;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:min(600px,calc(100vw - 32px));font:500 12px/1 system-ui,sans-serif';
  const chipCss = 'cursor:pointer;border:1px solid rgba(255,255,255,.14);background:rgba(12,14,20,.78);color:#e9ecf3;padding:7px 10px;border-radius:999px;font:inherit;backdrop-filter:blur(6px)';
  [['🚶', 'walk'], ['🪑', 'sit'], ['👋', 'wave'], ['🕺', 'dance'], ['☕', 'drink'], ['🙆', 'stretch'], ['📱', 'phone'], ['🤔', 'think'], ['😴', 'sleep']].forEach(([icon, act]) => {
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
