/* Seated low-poly avatar for the study-corner room.
   Built from primitives (no external model), posed with a tiny joint-pose animator.
   Usage (room.js): const avatar = createAvatar({ T, stage, rbox, cyl, add }); room.add(avatar.group); avatar.update() each frame. */

export function createAvatar({ T, stage, rbox, cyl, add }) {
  const mat = (name, color, e = 0.2, extra = {}) => new T.MeshStandardMaterial({ name: 'avatar_' + name, color, roughness: 0.85, metalness: 0, emissive: color, emissiveIntensity: e, ...extra });
  const A = {
    skin:   mat('skin', 0xa9714b, 0.26),
    shirt:  mat('shirt', 0x3a2f2b, 0.3),
    pants:  mat('pants', 0x2b3040, 0.3),
    shoe:   mat('shoe', 0xd9d9de, 0.2),
    cap:    mat('cap', 0x16161a, 0.35),
    brimUnder: mat('cap_brim_under', 0x7a1526, 0.3),
    patch:  mat('cap_patch', 0xf2f2f2, 0.3),
    hair:   mat('hair', 0x232326, 0.3),
    grey:   mat('hair_grey', 0x8d8d90, 0.25),
    beard:  mat('beard', 0x5a5856, 0.25),
    dark:   mat('face_dark', 0x1c1210, 0.1),
    mouth:  mat('mouth', 0x3a1f1c, 0.1),
    gold:   mat('chain', 0xd4a73a, 0.45, { metalness: 0.6, roughness: 0.35 }),
    mug:    mat('mug', 0xf0ede6, 0.25),
    phone:  mat('phone', 0x0e0f12, 0.1),
    phoneScreen: new T.MeshBasicMaterial({ name: 'avatar_phone_screen', color: 0x9fd0ff, toneMapped: false }),
  };
  const grp = (name, x, y, z, parent) => { const g = new T.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };
  const sph = (name, r, m, x, y, z, parent, args = []) => add(name, new T.Mesh(new T.SphereGeometry(r, 22, 16, ...args), m), x, y, z, parent);

  const root = new T.Group(); root.name = 'avatar';

  /* ---------- body ---------- */
  const hips = grp('avatar_hips', 0, 0.61, -0.03, root);
  rbox('avatar_pelvis', 0.34, 0.17, 0.25, 0.05, A.pants, 0, 0, 0, hips);
  const torso = grp('avatar_torso', 0, 0.05, 0, hips);
  rbox('avatar_chest', 0.39, 0.47, 0.22, 0.07, A.shirt, 0, 0.26, 0, torso);
  cyl('avatar_neck', 0.05, 0.055, 0.1, A.skin, 0, 0.53, 0, torso, 16);
  const chain = add('avatar_chain', new T.Mesh(new T.TorusGeometry(0.07, 0.0035, 8, 28), A.gold), 0, 0.485, 0.035, torso);
  chain.rotation.x = Math.PI / 2 + 0.5; chain.castShadow = false;

  /* ---------- head ---------- */
  const head = grp('avatar_head', 0, 0.57, 0, torso);
  const R = 0.118;
  const skull = grp('avatar_skull', 0, 0.125, 0, head); skull.scale.set(1, 1.1, 1.03);
  sph('avatar_face', R, A.skin, 0, 0, 0, skull);
  /* stubble: lower-front shell */
  sph('avatar_beard', R * 1.03, A.beard, 0, 0, 0, skull, [Math.PI / 2 - 1.3, 2.6, Math.PI * 0.63, Math.PI * 0.37]);
  /* hair visible under the cap: back + sides, grey at the temples */
  sph('avatar_hair', R * 1.035, A.hair, 0, 0, 0, skull, [Math.PI * 1.5 - 1.95, 3.9, Math.PI * 0.3, Math.PI * 0.4]);
  [-1, 1].forEach((s, i) => {
    sph(`avatar_temple_${i + 1}`, 0.03, A.grey, s * 0.103, 0.025, 0.035, skull).scale.set(0.35, 1.1, 0.9);
    sph(`avatar_ear_${i + 1}`, 0.028, A.skin, s * 0.118, -0.005, -0.005, skull).scale.set(0.5, 1, 0.75);
  });
  /* face */
  const eyes = [-1, 1].map((s, i) => sph(`avatar_eye_${i + 1}`, 0.0125, A.dark, s * 0.042, 0.145, 0.109, head));
  const brows = [-1, 1].map((s, i) => { const b = rbox(`avatar_brow_${i + 1}`, 0.046, 0.01, 0.012, 0.004, A.hair, s * 0.042, 0.172, 0.112, head); b.rotation.z = s * 0.1; return b; });
  rbox('avatar_nose', 0.03, 0.05, 0.04, 0.012, A.skin, 0, 0.113, 0.123, head);
  rbox('avatar_moustache', 0.06, 0.012, 0.012, 0.004, A.beard, 0, 0.083, 0.121, head);
  const mouth = rbox('avatar_mouth', 0.044, 0.008, 0.01, 0.003, A.mouth, 0, 0.066, 0.122, head);
  /* backwards cap */
  const cap = grp('avatar_cap', 0, 0.135, -0.004, head); cap.rotation.x = -0.2;
  sph('avatar_cap_crown', R * 1.13, A.cap, 0, 0, 0, cap, [0, Math.PI * 2, 0, Math.PI * 0.47]).scale.set(1, 1.08, 1.06);
  const brim = grp('avatar_cap_brim', 0, 0.012, -0.175, cap); brim.rotation.x = 0.42; brim.scale.set(1, 1, 1.25);
  cyl('avatar_cap_brim_top', 0.088, 0.088, 0.008, A.cap, 0, 0.004, 0, brim, 24);
  cyl('avatar_cap_brim_under', 0.086, 0.086, 0.006, A.brimUnder, 0, -0.003, 0, brim, 24);
  const patch = rbox('avatar_cap_patch', 0.04, 0.02, 0.006, 0.003, A.patch, 0, 0.04, 0.133, cap); patch.rotation.x = -0.3;

  /* ---------- arms ---------- */
  function arm(s, tag) {
    const sh = grp(`avatar_shoulder_${tag}`, s * 0.238, 0.45, 0, torso);
    rbox(`avatar_sleeve_${tag}`, 0.108, 0.16, 0.108, 0.04, A.shirt, 0, -0.05, 0, sh);
    rbox(`avatar_upperarm_${tag}`, 0.08, 0.3, 0.08, 0.03, A.skin, 0, -0.17, 0, sh);
    const el = grp(`avatar_elbow_${tag}`, 0, -0.31, 0, sh);
    rbox(`avatar_forearm_${tag}`, 0.072, 0.27, 0.072, 0.028, A.skin, 0, -0.125, 0, el);
    const hand = grp(`avatar_hand_${tag}`, 0, -0.285, 0, el);
    sph(`avatar_palm_${tag}`, 0.046, A.skin, 0, 0, 0, hand).scale.set(0.85, 1.1, 1);
    rbox(`avatar_thumb_${tag}`, 0.022, 0.05, 0.022, 0.008, A.skin, -s * 0.03, 0.01, 0.03, hand).rotation.z = -s * 0.5;
    return { sh, el, hand };
  }
  const armL = arm(1, 'l'), armR = arm(-1, 'r');

  /* props (right hand) */
  const mug = grp('avatar_mug', 0, -0.03, 0.045, armR.hand); mug.visible = false;
  cyl('avatar_mug_body', 0.036, 0.032, 0.085, A.mug, 0, 0, 0, mug, 18);
  add('avatar_mug_handle', new T.Mesh(new T.TorusGeometry(0.024, 0.007, 8, 16), A.mug), 0.04, 0, 0, mug);
  const phone = grp('avatar_phone', 0.03, -0.06, 0.04, armR.hand); phone.visible = false;
  rbox('avatar_phone_body', 0.072, 0.145, 0.01, 0.004, A.phone, 0, 0, 0, phone);
  const scr = add('avatar_phone_screen', new T.Mesh(new T.PlaneGeometry(0.064, 0.135), A.phoneScreen), 0, 0, 0.0056, phone); scr.castShadow = false;

  /* ---------- legs ---------- */
  function leg(s, tag) {
    const hip = grp(`avatar_hip_${tag}`, s * 0.095, -0.005, 0.05, hips);
    rbox(`avatar_thigh_${tag}`, 0.15, 0.145, 0.47, 0.05, A.pants, 0, 0, 0.2, hip);
    const knee = grp(`avatar_knee_${tag}`, 0, 0, 0.42, hip);
    rbox(`avatar_shin_${tag}`, 0.118, 0.52, 0.118, 0.04, A.pants, 0, -0.25, 0, knee);
    rbox(`avatar_shoe_${tag}`, 0.115, 0.08, 0.26, 0.03, A.shoe, 0, -0.55, 0.055, knee);
    return { hip, knee };
  }
  const legL = leg(1, 'l'), legR = leg(-1, 'r');

  /* ---------- pose animator ---------- */
  const J = { torso, head, shL: armL.sh, shR: armR.sh, elL: armL.el, elR: armR.el, hipL: legL.hip, hipR: legR.hip, kneeL: legL.knee, kneeR: legR.knee };
  const REST = {
    torso: [-0.07, 0, 0], head: [0.04, 0, 0],
    shL: [0.02, 0, 0.13], shR: [0.02, 0, -0.13], elL: [-1.1, 0, -0.12], elR: [-1.1, 0, 0.12],
    hipL: [0, 0.14, 0], hipR: [0, -0.14, 0], kneeL: [0.12, 0, 0], kneeR: [0.12, 0, 0],
  };
  const S = Math.sin;
  /* each action: dur (s), optional prop, pose(t, k) -> absolute joint rotations; k ramps 0..1..0 over the action */
  const ACTIONS = {
    wave:    { look: true, dur: 3.2, face: 'smile', pose: (t) => ({ shR: [0, 0, -2.45], elR: [0, 0, -0.55 + S(t * 9) * 0.45], head: [0, 0, -0.1], torso: [-0.05, 0, 0.04] }) },
    thumbs:  { look: true, dur: 2.6, face: 'smile', pose: (t) => ({ shL: [-1.15, 0, -0.1], elL: [-1.35, 0, 0], head: [0.05 + S(t * 6) * 0.05, 0, 0.08] }) },
    stretch: { dur: 4.2, face: 'closed', pose: (t) => ({ shL: [-0.2, 0, 2.75 + S(t * 1.6) * 0.08], shR: [-0.2, 0, -2.75 - S(t * 1.6) * 0.08], elL: [-0.15, 0, 0], elR: [-0.15, 0, 0], torso: [-0.26, 0, S(t * 1.6) * 0.06], head: [-0.32, 0, 0] }) },
    drink:   { dur: 4.4, prop: 'mug', pose: (t, k) => ({ shR: [-1.05, 0, 0.9], elR: [-1.9, 0, 0], head: [-0.22 * k, -0.15, 0], torso: [-0.1 * k - 0.05, 0, 0] }) },
    phone:   { dur: 7.0, prop: 'phone', pose: (t) => ({ shR: [-0.55, 0, 0.3], elR: [-1.55, 0, 0], shL: [-0.5, 0, -0.32], elL: [-1.45, 0, 0], head: [0.42, S(t * 0.7) * 0.04, 0], torso: [0.02, 0, 0] }) },
    think:   { look: true, dur: 4.5, face: 'brow', pose: (t) => ({ shR: [-0.8, 0, 0.95], elR: [-2.1, 0, 0], head: [0.14, -0.2, -0.12 + S(t * 1.2) * 0.03], torso: [-0.02, 0.05, 0] }) },
    laugh:   { look: true, dur: 2.8, face: 'laugh', pose: (t) => ({ torso: [-0.2 + S(t * 14) * 0.035, 0, 0], head: [-0.25 + S(t * 14) * 0.05, 0, 0], shL: [-0.25, 0, 0.3], shR: [-0.25, 0, -0.3] }) },
    nod:     { look: true, dur: 1.8, face: 'smile', pose: (t) => ({ head: [0.12 + S(t * 9) * 0.2, 0, 0] }) },
    no:      { look: true, dur: 1.9, pose: (t) => ({ head: [0.04, S(t * 9) * 0.38, 0] }) },
    shrug:   { look: true, dur: 2.2, face: 'brow', pose: () => ({ shL: [-0.35, 0, 0.55], shR: [-0.35, 0, -0.55], elL: [-1.7, 0, 0.5], elR: [-1.7, 0, -0.5], head: [0, 0, 0.16], torso: [-0.04, 0, 0] }) },
    dance:   { dur: 6.0, face: 'smile', pose: (t) => { const b = S(t * 7); return { torso: [-0.05, S(t * 3.5) * 0.18, b * 0.09], head: [S(t * 7) * 0.1, S(t * 3.5) * -0.12, -b * 0.08], shL: [-0.9 - b * 0.35, 0, 0.35], elL: [-1.6, 0, 0], shR: [-0.9 + b * 0.35, 0, -0.35], elR: [-1.6, 0, 0], kneeL: [0.12 + Math.max(0, b) * 0.18, 0, 0], kneeR: [0.12 + Math.max(0, -b) * 0.18, 0, 0] }; } },
    sleep:   { dur: 7.0, face: 'closed', pose: (t) => ({ head: [0.5 + S(t * 1.1) * 0.03, 0, 0.12], torso: [0.06 + S(t * 1.1) * 0.015, 0, 0.03], shL: [-0.1, 0, 0.12], shR: [-0.1, 0, -0.12], elL: [-1.35, 0, -0.35], elR: [-1.35, 0, 0.35] }) },
    talk:    { look: true, dur: 3.0, face: 'talk', pose: (t) => ({ head: [0.03 + S(t * 5) * 0.04, S(t * 1.7) * 0.08, 0], shL: [-0.45 + S(t * 3) * 0.08, 0, 0.18], elL: [-1.55 + S(t * 3) * 0.2, 0, 0] }) },
  };

  let current = null, startedAt = 0, last = performance.now() / 1000, nextBlink = 2, face = 'neutral';
  const cur = {}; for (const k in REST) cur[k] = REST[k].slice();

  function play(name, dur) {
    const a = ACTIONS[name]; if (!a) return false;
    current = { ...a, name, dur: dur || a.dur }; startedAt = performance.now() / 1000;
    mug.visible = a.prop === 'mug'; phone.visible = a.prop === 'phone';
    return true;
  }

  /* ---------- speech bubble ---------- */
  const bubble = document.createElement('div');
  bubble.style.cssText = 'position:fixed;z-index:40;pointer-events:none;transform:translate(-50%,-100%);max-width:240px;padding:8px 12px;border-radius:14px;background:#f4f5f8;color:#14161c;font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45);opacity:0;transition:opacity .2s;text-align:center';
  document.body.appendChild(bubble);
  let bubbleUntil = 0;
  function say(text, secs) { bubble.textContent = text; bubbleUntil = performance.now() / 1000 + (secs || Math.min(7, 2.2 + text.length * 0.06)); }
  const headPos = new T.Vector3(), camLocal = new T.Vector3();

  function update() {
    const now = performance.now() / 1000, dt = Math.min(1, now - last); last = now;
    /* idle: breathing + slow look-around */
    const target = {}; for (const k in REST) target[k] = REST[k].slice();
    target.torso[0] += S(now * 1.5) * 0.012;
    target.head[1] += S(now * 0.31) * 0.16 + S(now * 0.13) * 0.1;
    target.head[0] += S(now * 0.23) * 0.04;
    face = 'neutral';
    if (current) {
      const t = now - startedAt;
      if (t > current.dur) { current = null; mug.visible = phone.visible = false; }
      else {
        const k = Math.min(1, t / 0.6, (current.dur - t) / 0.6);
        const p = current.pose(t, Math.max(0, k));
        for (const j in p) target[j] = p[j];
        face = current.face || 'neutral';
        if (current.look) { /* turn toward whoever is watching */
          camLocal.copy(stage._camera.position); root.worldToLocal(camLocal);
          const ang = Math.max(-1.7, Math.min(1.7, Math.atan2(camLocal.x, camLocal.z))) * k;
          target.torso = target.torso.slice(); target.head = target.head.slice();
          target.torso[1] += ang * 0.3; target.head[1] += ang * 0.5;
        }
      }
    }
    const a = 1 - Math.exp(-dt * 7);
    for (const j in J) { const c = cur[j], g = target[j]; for (let i = 0; i < 3; i++) c[i] += (g[i] - c[i]) * a; J[j].rotation.set(c[0], c[1], c[2]); }

    /* face */
    if (now > nextBlink) nextBlink = now + 2.5 + Math.random() * 3;
    const blinking = nextBlink - now > 0 && nextBlink - now < 0.12;
    const closed = face === 'closed' || face === 'laugh' || blinking;
    eyes.forEach(e => e.scale.set(1, closed ? 0.15 : 1, 1));
    const talking = face === 'talk' || (face === 'laugh');
    mouth.scale.set(face === 'smile' || face === 'laugh' ? 1.25 : 1, talking ? 2.2 + S(now * 16) * 1.6 : (face === 'smile' ? 1.8 : 1), 1);
    brows.forEach((b, i) => { b.position.y = 0.172 + (face === 'brow' || face === 'smile' ? 0.008 : 0); });

    /* bubble follows the head */
    if (now < bubbleUntil) {
      head.getWorldPosition(headPos); headPos.y += 0.36;
      headPos.project(stage._camera);
      const r = stage.getBoundingClientRect();
      bubble.style.left = (r.left + (headPos.x + 1) / 2 * r.width) + 'px';
      bubble.style.top = (r.top + (1 - headPos.y) / 2 * r.height) + 'px';
      bubble.style.opacity = headPos.z < 1 ? '1' : '0';
    } else bubble.style.opacity = '0';
  }

  /* ---------- text commands ---------- */
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const RULES = [
    [/\b(dance|party|naach|nach|vibe|music|gaana)\b/, 'dance', ['Chair dance mode 🕺', 'DJ, volume badha!']],
    [/\b(stretch|tired|thak|thaka|break|angdai)\b/, 'stretch', ['Aaah… needed that', 'Long day bro']],
    [/\b(drink|coffee|chai|tea|water|paani|pani|sip)\b/, 'drink', ['Chai break ☕', 'Hydration first']],
    [/\b(phone|scroll|insta|instagram|text|call|reel|reels)\b/, 'phone', ['Ek min, reply kar raha hoon…', 'Just one reel 📱']],
    [/\b(sleep|nap|so ja|soja|sleepy|night|zzz)\b/, 'sleep', ['Zzz… 5 min bas', '😴']],
    [/\b(lol|lmao|haha+|funny|joke|laugh|has|hasa)\b/, 'laugh', ['Hahaha 😂', 'Sahi tha yeh']],
    [/\b(think|idea|soch|socho|hmm+|why|how|kyu|kyun|kaise)\b/, 'think', ['Hmm, let me think…', 'Sochne de 🤔']],
    [/\b(nice|cool|great|awesome|good|thumbs|like|love|badhiya|mast|sahi)\b/, 'thumbs', ['👍 Badhiya!', 'Appreciate it!']],
    [/\b(shrug|idk|dunno|pata nahi|whatever|kya pata)\b/, 'shrug', ['Pata nahi yaar 🤷', 'No idea honestly']],
    [/\b(yes|yeah|yep|haan|han|ok|okay|nod|agree|right|theek)\b/, 'nod', ['Haan haan', 'Yep 👍']],
    [/\b(no|nah|nahi|nope|never|mat)\b/, 'no', ['Nahi bhai', 'Nope']],
    [/\b(hi+|hello|hey+|namaste|yo|sup|wave|bye|hola|salaam|kaise ho|welcome)\b/, 'wave', ['Hey! 👋 Welcome to my room', 'Namaste 🙏', 'Yo! Look around, click stuff']],
  ];
  function command(text) {
    const raw = String(text || '').trim(); if (!raw) return;
    const m = raw.match(/^(say|bol|bolo)\s+(.+)/i);
    if (m) { play('talk', Math.min(7, 2 + m[2].length * 0.06)); say(m[2]); return; }
    const low = raw.toLowerCase();
    if (ACTIONS[low]) { const r = RULES.find(x => x[1] === low); play(low); if (r) say(pickOne(r[2])); return; }
    for (const [re, act, lines] of RULES) if (re.test(low)) { play(act); say(pickOne(lines)); return; }
    play('shrug'); say('Try: wave, dance, chai, stretch, phone, think, sleep… or "say <anything>"', 5);
  }

  /* ---------- control bar ---------- */
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:16px;bottom:52px;z-index:45;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:min(560px,calc(100vw - 32px));font:500 12px/1 system-ui,sans-serif';
  const chipCss = 'cursor:pointer;border:1px solid rgba(255,255,255,.14);background:rgba(12,14,20,.78);color:#e9ecf3;padding:7px 10px;border-radius:999px;font:inherit;backdrop-filter:blur(6px)';
  [['👋', 'wave'], ['🕺', 'dance'], ['☕', 'drink'], ['🙆', 'stretch'], ['📱', 'phone'], ['🤔', 'think'], ['😂', 'laugh'], ['😴', 'sleep']].forEach(([icon, act]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = icon; b.title = act; b.setAttribute('aria-label', act); b.style.cssText = chipCss;
    b.addEventListener('click', () => command(act)); bar.appendChild(b);
  });
  const input = document.createElement('input');
  input.type = 'text'; input.placeholder = 'Tell me what to do…  (e.g. "say hi", "chai", "dance")'; input.maxLength = 120; input.setAttribute('aria-label', 'Tell the avatar what to do');
  input.style.cssText = chipCss + ';cursor:text;flex:1 1 220px;min-width:0;outline:none;border-radius:12px;padding:9px 12px;font-size:13px';
  ['keydown', 'keyup', 'keypress'].forEach(ev => input.addEventListener(ev, e => e.stopPropagation()));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { command(input.value); input.value = ''; } });
  bar.appendChild(input);
  document.body.appendChild(bar);

  setTimeout(() => command('hi'), 2500);

  return { group: root, update, play, say, command, joints: J, actions: Object.keys(ACTIONS) };
}
