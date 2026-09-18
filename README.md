# my-room-3d — v3 (baked) — push + deploy

## For Claude Code: apply this drop
1. Copy `site/room.js`, `site/vercel.json`, `site/room-v3.glb` into the repo's `site/` (overwrite). Do NOT touch `me.glb`, `me-anims.*`, `three-d-stage.js`, `index.html`, `avatar.js` unless the copies here differ — they don't.
2. Replace repo `blender/` with this `blender/` (step2 / step3 one-group-at-a-time / step4 / run_headless / bake_hd_overnight.bat). Copy `CLAUDE.md` to repo root.
3. Commit: "v3: baked room (4 lightmaps, separate chair), bigger room, dusk window, product links, resumable bake scripts". Push main.
4. `cd site && npx vercel --prod --yes` (or wait for the GitHub auto-deploy). Verify live: no console errors, `/room-v3.glb` 200 `model/gltf-binary` (~few MB), avatar sits on the chair and the chair swivels with him, curtains open on click.
5. No Blender run needed in this drop — the glb is already baked (low-res GUI bake). The HD bake is the user's overnight job: `blender/bake_hd_overnight.bat`.

---
# Notes from the polish round (room.js + Blender scripts)

## For Claude Code: how to apply
1. Copy `site/room.js` and `site/vercel.json` over the repo's `site/` files. Do NOT touch `avatar.js`, `me.glb`, `me-anims.*`, `three-d-stage.js`, `index.html`.
2. Replace the repo's `blender/` folder with this `blender/` (step2 / step3 / step4 / run_headless).
3. Run the bake headless (no GUI). Blender 5.2 is at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
   Quick test first (~10 min):   `blender -b --python blender/run_headless.py -- --quick`
   Final (1–3 h, run in background, poll):   `blender -b --python blender/run_headless.py`
   Output: `blender/room-v3.glb` (+ four PNG lightmaps). Copy `room-v3.glb` into `site/`.
4. Commit "v3: bigger room, separate chair, HD desk items, dusk window view, bed light", push, `cd site && npx vercel --prod --yes`.
5. Verify live: no console errors, `/room-v3.glb` 200 with model/gltf-binary, avatar still sits on the chair and swivels it.

## What changed (room.js)
- **Room enlarged** on the two open sides: right (window) wall moved from x=1.85 to **RX=2.55**, front edge from z=1.85 to **FZ=2.25** → 4.4 × 4.1 m (~195 sq ft, was 137). Back wall, left wall, desk, chair, loft bed and all avatar waypoints are **unchanged**. Only things that moved: window (now centred at z=0.4 on the new wall), floor lamp (x=RX−0.42), waste basket, LEGO bin, main rug (now 0.55, 0.9, scaled 1.45×1.05). The avatar's `window` waypoint (1.12, 0.78) still works but stands ~1.4 m from the glass — move it to about (2.0, 0.6) in avatar.js if you want him at the sill.
- **Chair from the bake**: after GLB load, `baked.getObjectByName('chair')` → `avatar.setChair()`. Pivot is on the floor at the chair centre (0.5, 0, −0.28), `rotation.y = −0.35`, local geometry un-rotated, so `chair.rotation.y = yaw` works directly. The carve hack is still there as fallback for the old `room.glb` only.
- Loader tries `./room-v3.glb` first, falls back to `./room.glb` (cache-busting; vercel.json has the header for both).
- Side monitor squared up (yaw −0.3) and its arm now actually points from the pole to the VESA plate.
- Loft bed: pillow at the head end + clip-on **reading light** (mesh `bed_light_*`, emissive bulb material reused for the GLB mesh, real-time PointLight `bed_reading_light`).
- Window view is now **dusk**: dark sky with stars, lit tower windows, blinking aerials, lit SkyTrain, sodium yard floodlights, streetlights, car headlights/tail-lights — matches the neon room. Drop a real photo as `site/window-view.jpg` and it replaces the painting (static).
- HP-laptop hover hit-volume also checks the new `desk_items` mesh.

## What changed (Blender)
- **All yaw signs fixed.** The v2 script had every `rz` inverted vs the web scene (web `rotation.y` == Blender `rz`, same sign) — that's why the side monitor looked tilted the wrong way and the chair faced the wrong way in the bake. Monitors, laptops, duck, clock, headphones, notebooks, cards, chair (now −0.35), chair base arms, backpack all corrected.
- Room shell enlarged to match (RX/FZ), window frame + dark glass instead of blinds, curtain rod/finials baked (curtain panels stay live in the viewer).
- Night lighting: red desk LED strip, purple under-bed strip, blue screen light, warm 3-shade lamp, **bed reading light**, moonlit window.
- Ladder on the long side leaning on the bed; stray towel removed; pillow added.
- Bevel segments 3→4 (softer edges), main-screen emission ×2 so screen glow reads in the bake.
- **step3_bake.py**: four bake groups — `room_shell` 2048, `desk_items` 2048 (duck, clock, mouse, headphones, notebooks, laptops, monitors: ~4× texel density vs v2), `room_props` 4096, **`chair` 1024 as its own object**. Chair is hidden while the room bakes (no painted chair shadow), then baked with the room present. `--quick` halves sizes and uses 64 samples.
- Names preserved for the viewer: `room_shell`, `room_props`, `desk_items`, `chair`, `screen_main`, `screen_side`, `screen_laptop`, `laptop_hp_screen`, `window_glass`, `led_strip_desk`, `led_strip_bed`, `bed_light_bulb`.
- step4 exports `room-v3.glb`.

## Known limits
- The outside view can't be baked — it's an animated canvas (trains/cars move). A photo (`window-view.jpg`) is the "natural" option.
- Desk-item crispness is bounded by the shared 2048 lightmap; for a final push set `desk_items` to 4096 in step3 (adds ~20 min).
