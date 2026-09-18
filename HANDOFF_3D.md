# Handoff: "My Room in 3D" — re-bake + polish round (for the 3D/Blender Claude)

Repo: https://github.com/reflex000/my-room-3d (branch `main`)
Live: https://my-room-3d-seven.vercel.app (Vercel project `my-room-3d`, deploy = `cd site && npx vercel --prod --yes`)
Local clone on this machine: `C:\Users\sssid\Project\my-room-3d`. Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.

## What exists today (do not rebuild from scratch)

`site/` is the deployed static three.js page (no build step). Files:
- `index.html`, `three-d-stage.js` — viewer shell (unchanged from your v2 handoff).
- `room.glb` — your v2 bake (`room_shell` + `room_props`, baked lighting, night/neon look, curtains + city view).
- `room.js` — your v2 file plus these additions (keep them working):
  - hover/click product links (LG monitor, HP laptop, IKEA VITVAL loft bed) incl. hit-volumes for the merged baked mesh;
  - avatar wiring: `import { createAvatar } from './avatar.js'`, `createAvatar({ T, stage, seat })`, `avatar.setChair(pivot)`, `avatar.update()` in the tick, `'avatar'` in `keepFromPrimitive`;
  - **chair carve**: after the GLB loads, triangles of `room_props` whose centroid is within radius 0.42 of the chair centre (0.5, -0.28) and y < 1.35 are split into a separate mesh under a pivot group named `chair` so the avatar can swivel/roll it. This is a hack because the chair is merged into `room_props`.
- `avatar.js` — the avatar engine (see below). Public contract used by room.js: `createAvatar({T, stage, seat:{x,z,rotY}})` → `{ group, update(), command(text), setChair(pivot) }`.
- `me.glb` (3.8 MB) — the user's realistic Avaturn avatar (Mixamo-compatible skeleton, T-pose, ARKit blendshapes + visemes, textures 1024 webp). Height ≈1.86 m, scaled 0.94 at runtime.
- `me-anims.glb` + `me-anims.json` — mocap clips already retargeted onto that skeleton at build time (idle, walk, sitIdle, typing, sitToType, typeToSit, climb, climbStart, lieDown, drink, phone, stretch, neckStretch, sitLaugh, dance, wave). Regenerate with `cd avatar-src && node retarget.mjs` (inputs: `avatar-src/avaturn.glb`, `avatar-src/xbot.glb`, `avatar-src/mixamo.glb`; the last one is built from the Mixamo FBX files by `blender -b -P avatar-src/fbx2glb.py -- ./mixamo ./mixamo.glb`). Raw FBX/GLB inputs are git-ignored; they live only in the local folder.
- `vercel.json` — `room.glb` content-type + 1-year immutable cache (so rename or version any changed GLB, e.g. `room-v3.glb`, or browsers keep the old one).

Avatar behaviour (all in `avatar.js`, driven by a small state machine):
- default: chair swivelled to the desk and rolled 0.3 m forward, avatar sitting and **typing on the ThinkPad** (Mixamo Typing);
- on visitor commands it plays Type To Sit, swivels the chair to face the room (yaw = chair's original -0.35), gestures, later swivels back and types;
- walks to waypoints (`center`, `window`, `desk`, `door`, ladder foot), stands, sits;
- `go to bed`: walks to the ladder foot, climbs with the Mixamo Climbing Ladder loop (rig rises 0.5 m/s, faces -x), then plays Lying Down on the mattress (head to the back wall, eyes closed); `wake up` reverses it;
- gestures: drink (mug prop), phone, stretch, neck, laugh, dance (standing), wave/think/nod/no/shrug/thumbs (procedural), `say <text>` with lip-sync;
- UI: chip bar + text input (Hinglish/English keywords), speech bubble follows the head.

Room coordinate facts used by the avatar (from `room.js` primitives; the bake matches them):
- room half-width HW = 1.85, floor y = 0, rug top y ≈ 0.014; desk at x 0.72, z -1.24 (1.66 × 0.66, top y 0.76); ThinkPad at (0.56, -1.07).
- office chair pivot (0.5, 0, -0.28), rotation.y = -0.35 (backrest toward the desk, seat faces the room); seat top y ≈ 0.53.
- loft bed group at (-1.23, 0, -0.1): 0.95 wide (x) × 2.0 long (z), mattress top y ≈ 1.60, guard rails to y ≈ 1.95; ladder foot at (-0.395, 0, 0.25), leaning 0.17 rad toward -x, rails at z 0.05..0.45, 6 rungs 0.29 m apart.

## What the user wants from this round

1. **Re-bake the room with the chair as a separate object.** Right now the chair's shadow is baked into the floor texture, so when the chair swivels/rolls the painted shadow stays behind. Please:
   - keep the chair out of the `room_props` join and out of the floor bake (no baked chair shadow on the rug/floor), export it as its own mesh/object in the GLB named `chair` with its pivot at the chair centre on the floor (0.5, 0, -0.28), rotation.y = -0.35 as before, seat facing the room;
   - the chair can keep its own baked/unlit material; the avatar's real-time lights will add the rest;
   - then the carve hack in `room.js` can be deleted: `room.js` should just `avatar.setChair(baked.getObjectByName('chair'))`.
2. **Bed night-light.** The loft mattress is very dark at night. Bake a small warm light (e.g. a clip-on reading light on the head-end rail, or a soft glow from the wall) so the avatar is readable when he lies there. Keep the current neon/night mood.
3. **Keep the naming the avatar code relies on**: `room_shell`, `room_props`, `screen_main`, `screen_side`, `screen_laptop`, `laptop_hp_screen`, `window_blinds`, `window_glass`, and now `chair`. Same coordinate system/scale as v2 (the avatar waypoints are hard-coded in room coords).
4. **Style question for you to decide:** the avatar is realistic while the room is low-poly. If you can push the room's materials/bake slightly toward the avatar (a bit more shading detail, softer AO) without changing geometry, do it; if not, leave the style as is.
5. Optional nice-to-haves if cheap: a real keyboard/mouse mesh in front of the ThinkPad where the typing hands land (hands are at roughly x 0.5, z -1.0, y 0.78); a pillow at the head end of the bed (z ≈ -0.9) at mattress height.

Deliverable: an updated `blender/` (scripts) + new `site/room.glb` (or `room-v3.glb` with the reference in `room.js` updated), README notes on what changed, and a check that the page still loads with no console errors. I (the code Claude) will re-wire `room.js`/`avatar.js` if the chair object naming or pivots differ — just document them.

Please do not modify `avatar.js`, `me.glb`, `me-anims.*`, or `avatar-src/` — those are the code side and will be re-integrated after your bake.
