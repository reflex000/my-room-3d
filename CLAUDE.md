# Project notes — my-room-3d

## User
- Hindi/Hinglish, casual. Wants ONE step at a time for Blender work. Not using Claude Code inside this chat; deploys via Claude Code/Vercel separately from a handoff zip.
- Repo: reflex000/my-room-3d (site/ + blender/). Live on Vercel.

## Baking strategy (CPU is slow: ~50 min per 1024² group, 5+ h for a 2048 props bake in GUI)
- NEVER bake all groups in one GUI run. Bake ONE group per run, resume-able, save .blend after each.
- Order: room_shell → desk_items → room_props → chair. Each run: open myroom.blend, run step3 with GROUP='<name>', Ctrl+S.
- step3 must be idempotent: if `<group>_bake.png` exists next to the .blend and its object already has the baked material, skip it.
- GUI sizes: shell 1024, desk_items 1024, props 2048, chair 512. HD (2048/2048/4096/1024, 256 samples, denoise) ONLY headless overnight: `blender -b myroom.blend --python step3_bake.py -- --group room_props --hd`.
- Bounces low (max 4, diffuse 2, glossy 1), adaptive sampling OFF (it was slower here), denoise OFF in GUI.
- Never re-run step2 after baking starts — it wipes the scene. Step 2 only when geometry changes.
- Check progress by PNG timestamps in the .blend folder; Blender UI is frozen/white during bake — normal.
- Laptop: sleep = Never, plugged in, Windows Update paused.

## Pipeline
step2_build_room.py (geometry, lights, rz signs = web rotation.y) → step3_bake.py (per-group) → step4_export.py (room-v3.glb) → drop glb in chat → site/room-v3.glb.
Viewer loads room-v3.glb, falls back to room.glb. Avatar (me.glb) is real-time lit, never baked. Window view is a live canvas (photo option: site/window-view.jpg).
