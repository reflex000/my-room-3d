// Builds site/me.glb (optimized Avaturn avatar) and site/me-anims.glb (skeleton-only mocap clips from three.js Xbot).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup, resample } from '@gltf-transform/functions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const av = await io.read('avaturn.glb');
const KEEP = new Set(['eyeBlinkLeft','eyeBlinkRight','eyesClosed','mouthSmile','mouthSmileLeft','mouthSmileRight','mouthOpen','jawOpen','mouthFunnel','mouthPucker','viseme_aa','viseme_O','viseme_E','viseme_I','viseme_U','viseme_PP','viseme_FF','browInnerUp','browDownLeft','browDownRight','browOuterUpLeft','browOuterUpRight','eyeSquintLeft','eyeSquintRight','eyeWideLeft','eyeWideRight','cheekSquintLeft','cheekSquintRight']);
for (const mesh of av.getRoot().listMeshes()) {
  const names = (mesh.getExtras() || {}).targetNames; if (!names) continue;
  const keepIdx = names.map((n, i) => KEEP.has(n) ? i : -1).filter(i => i >= 0);
  for (const prim of mesh.listPrimitives()) {
    const targets = prim.listTargets();
    targets.forEach((t, i) => { if (!keepIdx.includes(i)) prim.removeTarget(t); else t.setAttribute('NORMAL', null); });
  }
  mesh.setExtras({ ...mesh.getExtras(), targetNames: keepIdx.map(i => names[i]) });
  mesh.setWeights(keepIdx.map(() => 0));
}
await av.transform(dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), prune());
await io.write('../site/me.glb', av);

const xb = await io.read('xbot.glb');
const keep = new Set(['idle', 'walk', 'agree', 'headShake']);
for (const a of xb.getRoot().listAnimations()) if (!keep.has(a.getName())) a.dispose();
for (const n of xb.getRoot().listNodes()) { if (n.getMesh()) n.setMesh(null); if (n.getSkin()) n.setSkin(null); }
for (const s of xb.getRoot().listSkins()) s.dispose();
for (const m of xb.getRoot().listMeshes()) m.dispose();
await xb.transform(resample(), prune({ keepLeaves: true }));
await io.write('../site/me-anims.glb', xb);
