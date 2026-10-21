# DJ corner — contract for the code side (avatar.js / animation)

The room now extends 1.3 m further at the front: the front edge moved from z = 2.25 to z = 3.55.
Nothing else moved — desk, bed, ladder, closet, board and all existing avatar waypoints keep their coordinates.
The extension and the DJ corner come in a separate baked file, `site/dj-corner-v1.glb`, which room.js loads on top of room-v3.

All coordinates below are room-local (the same space as the other waypoints, inside `room_baked`).

## Avatar DJ spot
- The table is in the front-right corner, its back edge touching the window-side wall (inner face x = 2.46).
- Stand at **x = 1.61, z = 2.95**, facing **+x** (`rotation.y = +Math.PI / 2`), toward the wall. The closet is behind him.
- Table centre (2.16, 2.95), long side along z (1.2 m × 0.6 m). Approach path: `center` → (1.61, 2.3) → (1.61, 2.95).
- The controller deck is at y ≈ 1.06. Hands rest around (2.08, 1.07, 2.95 ± 0.14).

## Movable objects (`window.__dj`)
Each one has its origin at its pivot. `userData.restPos` / `userData.restQuat` hold the start pose.

- `jogL` (`dj_jog_l`), `jogR` (`dj_jog_r`): spin around local **Y** (`jog.rotateY(angle)`).
- `fader1` (`dj_fader_1`), `fader2` (`dj_fader_2`): slide along local **Z**; −Z = fader up, away from the DJ. Travel ±0.028 m.
- `xfader` (`dj_xfader`): slides along local **X**; +X = toward the DJ's right deck (room +z). Travel ±0.026 m.
- `coneL` (`dj_spk_l_cone`), `coneR` (`dj_spk_r_cone`): pump along local **Y**; +Y = outward. Use about 0.0015–0.003 m on the beat.
- `light` (`dj_glow`): an orange PointLight under the table (intensity 1.4). It can pulse on the beat.
- `stand`: `{ x, z, rotY }` — the DJ spot above.

Example, moving along local axes from rest: `o.position.copy(o.userData.restPos).add(new T.Vector3(0, amt, 0).applyQuaternion(o.quaternion))`.

## Hover links (already in room.js)
- `dj_flx4`, `dj_jog*`, `dj_fader*`, `dj_xfader` → Pioneer DJ DDJ-FLX4
- `dj_dm40*`, `dj_spk*` → Pioneer DJ DM-40D-BT

## Baked static objects
`dj_ext_shell` (floor and walls of the extension), `dj_table`, `dj_sub`, `dj_flx4`, `dj_dm40_l`, `dj_dm40_r`.
