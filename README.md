# Handoff: Deploy "My Room in 3D" to GitHub Pages

## Task for Claude Code
Publish the static site in `site/` to a public URL via **GitHub Pages**. Nothing needs to be rebuilt or rewritten — these files are the finished product (a static three.js page), not a design reference to recreate.

Steps:
1. Create a new public GitHub repo (suggested name: `my-room-3d`) with `gh repo create my-room-3d --public --source=site --push` or equivalent — the **contents of `site/` must be at the repo root** (index.html at top level).
2. Enable GitHub Pages: Settings → Pages → Source: Deploy from branch → `main` / `/ (root)`. Via CLI: `gh api -X POST repos/{owner}/my-room-3d/pages -f source[branch]=main -f source[path]=/`.
3. Confirm the site loads at `https://<user>.github.io/my-room-3d/` and report the URL back.
4. Optionally add `blender/` to the repo in a `blender/` folder (source scripts, not served).

## Overview
Interactive, auto-rotating low-poly 3D model of the user's real bedroom/office (standing desk, white main monitor + side monitor on arm, ThinkPad + HP laptops, mesh chair, loft bed with grey fabric guards, 3-shade floor lamp, desk clutter). Lighting is **baked in Blender** into textures inside `room.glb`; the monitors show live canvas-drawn animated UIs. Built in the style of "my room in 3D" portfolio scenes — original model, no third-party assets.

## Files (site/ — serve as-is, all four required)
- `index.html` — page shell; import map pins three.js 0.184.0 from unpkg with SRI hashes. Contains `<three-d-stage>`.
- `three-d-stage.js` — viewer web component: renderer, orbit controls, studio lighting, auto-framing camera, OBJ/GLB download toolbar.
- `room.js` — ES module. Builds a primitive fallback room, then loads `./room.glb` (GLTFLoader); on success swaps to it with unlit `MeshBasicMaterial` (bake shows as-is), hides scene lights, rotates `y = 0.55`. Meshes named `screen_main`, `screen_side`, `screen_laptop` get live animated canvas textures; `window_blinds` becomes 45% translucent.
- `room.glb` — baked model from Blender (two textures: room_shell 1024, room_props 2048).

## Constraints
- Must be served over **http(s)** (module scripts + fetch of .glb fail on `file://`). GitHub Pages, Netlify, Vercel all fine. No build step.
- Keep relative paths intact; `room.glb` must sit next to `index.html`.
- Optional user swaps: dropping `screen-main.png`, `screen-side.png`, `screen-laptop.png` next to index.html replaces the generated screens with those images automatically.

## Blender source (blender/)
- `step2_build_room.py` — rebuilds the whole scene from primitives with bevel modifiers, materials, lights, camera (run in Blender's Scripting tab).
- `step3_bake.py` — joins meshes into `room_shell` / `room_props`, smart-UV-unwraps, bakes Combined lighting to PNGs, swaps to unlit materials. For a higher-quality final: set SAMPLES=256, sizes 2048/4096, denoise on (long run).
- Export used: `bpy.ops.export_scene.gltf(filepath='room.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True)`.

## Fidelity
Final product (not a mock). Do not restyle.
