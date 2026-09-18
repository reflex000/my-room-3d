// Build-time retarget: Mixamo / Xbot clips -> Avaturn skeleton (me.glb), written as ../site/me-anims.glb
// plus ../site/me-anims.json (per-clip metadata: duration, hips start/end, removed root drift).
//
// Both rigs share bone names + T-pose. For a bone b with parent p:
//   source: rest local Rs, rest world SWr;  animated local qs
//   target: rest local Rt, rest world Wt
//   target local' = Wt(p)⁻¹ · SWr(p) · qs · Rs⁻¹ · SWr(p)⁻¹ · Wt(p) · Rt
// (the source's delta-from-rest expressed in world axes, re-expressed in the target parent's frame)
import { NodeIO, Document, Accessor } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Quaternion, Vector3, Matrix4 } from 'three';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const norm = (n) => n.replace(/^mixamorig:?/, '');

/* --- skeleton snapshot: name -> { R, W, p (local pos), Pw (world pos), parent, node } --- */
function snapshot(doc) {
  const out = {};
  const walk = (node, parentM, parentName) => {
    const m = new Matrix4().compose(new Vector3(...node.getTranslation()), new Quaternion(...node.getRotation()), new Vector3(...node.getScale()));
    const world = parentM.clone().multiply(m);
    const R = new Quaternion(...node.getRotation());
    const W = new Quaternion(), Pw = new Vector3(), Sw = new Vector3(); world.decompose(Pw, W, Sw);
    const name = norm(node.getName());
    out[name] = { R, W, p: new Vector3(...node.getTranslation()), Pw, parent: parentName, node, worldM: world, parentM };
    for (const c of node.listChildren()) walk(c, world, name);
  };
  for (const scene of doc.getRoot().listScenes()) for (const n of scene.listChildren()) walk(n, new Matrix4(), null);
  return out;
}

/* --- sampled channel lookup --- */
function sampler(times, values, size) {
  return (t) => {
    if (t <= times[0]) return Array.from(values.subarray(0, size));
    if (t >= times[times.length - 1]) return Array.from(values.subarray((times.length - 1) * size, times.length * size));
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
    const k = (t - times[lo]) / (times[hi] - times[lo]);
    const a = values.subarray(lo * size, lo * size + size), b = values.subarray(hi * size, hi * size + size);
    if (size === 4) { const qa = new Quaternion(...a), qb = new Quaternion(...b); return qa.slerp(qb, k).toArray(); }
    return Array.from(a, (v, i) => v + (b[i] - v) * k);
  };
}

const target = await io.read('avaturn.glb');
const T = snapshot(target);
const BONES = Object.keys(T).filter(n => T[n].node.getName() !== 'Armature' && !T[n].node.getMesh());

const outDoc = new Document();
const buffer = outDoc.createBuffer();
const scene = outDoc.createScene('Scene');
const outNodes = {};
for (const n of BONES) { const nd = outDoc.createNode(n); nd.setTranslation(T[n].p.toArray()); nd.setRotation(T[n].R.toArray()); outNodes[n] = nd; }
for (const n of BONES) { const p = T[n].parent; if (p && outNodes[p]) outNodes[p].addChild(outNodes[n]); else scene.addChild(outNodes[n]); }

const meta = {};
const SOURCES = [
  { file: 'xbot.glb', clips: { idle: 'idle', walk: 'walk' } },
  { file: 'mixamo.glb', clips: {
    'Arm Stretching': 'stretch', 'Neck Stretching': 'neckStretch', 'Drinking': 'drink', 'Waving': 'wave', 'Texting While Standing': 'phone',
    'Wave Hip Hop Dance': 'dance', 'Sitting Idle': 'sitIdle', 'Sitting Laughing': 'sitLaugh', 'Sit To Type': 'sitToType', 'Type To Sit': 'typeToSit',
    'Typing': 'typing', 'Start Climbing Ladder': 'climbStart', 'Climbing Ladder': 'climb', 'Lying Down': 'lieDown' } },
];
const IN_PLACE_XZ = new Set(['walk', 'climbStart', 'climb', 'dance', 'idle']);
const IN_PLACE_Y = new Set(['climb']);

for (const src of SOURCES) {
  const doc = await io.read(src.file);
  const Sn = snapshot(doc);
  const hipK = T.Hips.Pw.y / Sn.Hips.Pw.y;              // proportion scale, source world -> target
  const armM = Sn.Hips.parentM;                          // source armature transform (scale/rotation) for hips positions
  for (const anim of doc.getRoot().listAnimations()) {
    const outName = src.clips[anim.getName()]; if (!outName) continue;
    const ch = {};
    for (const c of anim.listChannels()) {
      const n = norm(c.getTargetNode().getName()); const s = c.getSampler();
      const times = s.getInput().getArray(), vals = s.getOutput().getArray();
      (ch[n] ||= {})[c.getTargetPath()] = { times, fn: sampler(times, vals, c.getTargetPath() === 'rotation' ? 4 : 3) };
    }
    const ref = ch.Hips?.rotation || Object.values(ch)[0].rotation; const times = Array.from(ref.times);
    const dur = times[times.length - 1];
    const outAnim = outDoc.createAnimation(outName);
    const timeAcc = outDoc.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Float32Array(times)).setBuffer(buffer);
    const q = new Quaternion(), tmp = new Quaternion();
    for (const n of BONES) {
      const sc = ch[n]; if (!sc || !sc.rotation || !Sn[n]) continue;
      const p = T[n].parent, Wp = (p && T[p]) ? T[p].W : new Quaternion(), Wpi = Wp.clone().invert();
      const SWp = (Sn[n].parent && Sn[Sn[n].parent]) ? Sn[Sn[n].parent].W : new Quaternion(), SWpi = SWp.clone().invert();
      const Rsi = Sn[n].R.clone().invert(), Rt = T[n].R;
      const vals = new Float32Array(times.length * 4);
      times.forEach((t, i) => {
        q.fromArray(sc.rotation.fn(t));
        tmp.copy(Wpi).multiply(SWp).multiply(q).multiply(Rsi).multiply(SWpi).multiply(Wp).multiply(Rt);
        vals.set(tmp.toArray(), i * 4);
      });
      const acc = outDoc.createAccessor().setType(Accessor.Type.VEC4).setArray(vals).setBuffer(buffer);
      const s = outDoc.createAnimationSampler().setInput(timeAcc).setOutput(acc).setInterpolation('LINEAR');
      outAnim.addSampler(s).addChannel(outDoc.createAnimationChannel().setTargetNode(outNodes[n]).setTargetPath('rotation').setSampler(s));
    }
    /* hips translation: source armature space -> world -> proportion-scaled target local */
    let hipsStart = null, hipsEnd = null, drift = [0, 0, 0];
    if (ch.Hips?.translation) {
      const pos = times.map(t => new Vector3(...ch.Hips.translation.fn(t)).applyMatrix4(armM).multiplyScalar(hipK));
      const first = pos[0].clone(), last = pos[pos.length - 1].clone(); const d = last.clone().sub(first);
      const rm = new Vector3(IN_PLACE_XZ.has(outName) ? d.x : 0, IN_PLACE_Y.has(outName) ? d.y : 0, IN_PLACE_XZ.has(outName) ? d.z : 0);
      const vals = new Float32Array(times.length * 3);
      pos.forEach((v, i) => { const k = times[i] / dur; const w = v.clone().sub(rm.clone().multiplyScalar(k)); if (IN_PLACE_XZ.has(outName)) { w.x -= first.x; w.z -= first.z; w.z += T.Hips.p.z; } vals.set(w.toArray(), i * 3); });
      hipsStart = Array.from(vals.subarray(0, 3)).map(v => +v.toFixed(3)); hipsEnd = Array.from(vals.subarray(vals.length - 3)).map(v => +v.toFixed(3)); drift = rm.toArray().map(v => +v.toFixed(3));
      const acc = outDoc.createAccessor().setType(Accessor.Type.VEC3).setArray(vals).setBuffer(buffer);
      const s = outDoc.createAnimationSampler().setInput(timeAcc).setOutput(acc).setInterpolation('LINEAR');
      outAnim.addSampler(s).addChannel(outDoc.createAnimationChannel().setTargetNode(outNodes.Hips).setTargetPath('translation').setSampler(s));
    }
    meta[outName] = { duration: +dur.toFixed(3), frames: times.length, hipsStart, hipsEnd, drift };
    console.log(outName.padEnd(12), 'dur', dur.toFixed(2), 'hips', hipsStart, '->', hipsEnd, 'drift', drift);
  }
}
await io.write('../site/me-anims.glb', outDoc);
fs.writeFileSync('../site/me-anims.json', JSON.stringify(meta, null, 1));
console.log('wrote ../site/me-anims.glb', fs.statSync('../site/me-anims.glb').size, 'bytes');
