# Step 2c — 1.3 m front extension + DJ corner (Pioneer DDJ-FLX4 + DM-40D-BT pair + sub on a standing DJ table).
# Adds ONLY new objects; room_shell / desk / bed / ladder / closet / board are not touched or re-baked.
#
#   A) BUILD (GUI, ~1 min): open myroom.blend > Scripting > Text > Open > this file > Alt+P. Builds, unwraps, saves.
#   B) BAKE (overnight, headless): double-click blender\bake_dj_corner.bat
#      Bakes DJ items (2048 px) + extension shell (1024 px) at 256 samples + denoise, exports dj-corner-v1.glb.
#
# Web coords (room space): x = Blender x, z = -Blender y, y = Blender z.  Room front edge was FZ = 2.25 -> now 3.55.
# DJ table pushed against the window-side wall in the front-right corner: centre web (2.16, 2.95), top 1.02 m, long side along z.
# DJ stands on the room side at web (1.61, 2.95) facing +x (rotation.y = +pi/2), toward the wall.
import bpy, bmesh, os, sys
from math import radians, pi, cos, sin
from mathutils import Vector, Matrix

STAGE = 'build'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--bake' in args: STAGE = 'bake'
SAMPLES, DJ_SIZE, EXT_SIZE = 256, 2048, 1024
HW, TH, RH, RX, FZ, FZ2 = 1.85, 0.09, 2.5, 2.55, 2.25, 3.55
TOP = 1.02
TX, TY = RX - TH - 0.30, -2.95            # table centre (Blender): back edge touches the wall (inner face x = 2.46)
CTRL_X, CTRL_RZ = TX - 0.08, radians(-90) # controller: local -y (front) faces the DJ (-x)
SPK = (('l', TX + 0.1, TY - 0.43, radians(-110)), ('r', TX + 0.1, TY + 0.43, radians(-70)))   # back by the wall, toed in toward the DJ
sc = bpy.context.scene
if not bpy.data.filepath: raise Exception('Open myroom.blend first.')
out_dir = os.path.dirname(bpy.data.filepath)
if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
def deselect(): bpy.ops.object.select_all(action='DESELECT')

def srgb(h):
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    return tuple(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in (r, g, b))
MATS = {}
def mat(name, hexcol, rough=0.5, metal=0.0, emit=None, strength=1.0, coat=0.0, bump=None, prefix='dj_m_'):
    name = prefix + name
    if name in MATS: return MATS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    def put(keys, v):
        for k in keys:
            if k in b.inputs: b.inputs[k].default_value = v; return
    put(['Base Color'], (*srgb(hexcol), 1)); put(['Roughness'], rough); put(['Metallic'], metal)
    if coat: put(['Coat Weight', 'Clearcoat'], coat)
    if emit:
        put(['Emission Color', 'Emission'], (*srgb(emit), 1)); put(['Emission Strength'], strength)
    if bump:
        tc = nt.nodes.new('ShaderNodeTexCoord'); n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = bump[0]; n.inputs['Detail'].default_value = 6
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump[1]
        nt.links.new(tc.outputs['Object'], n.inputs['Vector']); nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    MATS[name] = m; return m

# ------------------------------------------------------------------ primitives (local coords inside the current group: -y = front, z = up)
NEW, CUR = [], {'tag': None, 'parent': None}
def act(): return bpy.context.active_object
def fin(o, n, m, bevel=0.0, seg=3, smooth=True):
    o.name = 'djtmp_' + n; o.data.name = o.name
    o.data.materials.clear(); o.data.materials.append(m)
    if bevel:
        md = o.modifiers.new('Bevel', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'
    if smooth:
        for f in o.data.polygons: f.use_smooth = True
    o.parent = CUR['parent']; o['dj_part'] = CUR['tag']; NEW.append(o); return o
def cube(n, w, d, h, m, loc, rot=(0, 0, 0), bevel=0.0, seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = act(); o.scale = (w, d, h)
    return fin(o, n, m, bevel, seg, smooth=bool(bevel))
def cyl(n, r, h, m, loc, rot=(0, 0, 0), r2=None, v=32, bevel=0.0):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=v, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=v, location=loc, rotation=rot)
    return fin(act(), n, m, bevel, 2)
def sph(n, r, m, loc, s=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc); o = act(); o.scale = s
    return fin(o, n, m)
def tor(n, R, r, m, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=10, location=loc, rotation=rot)
    return fin(act(), n, m)
def grp(n, loc, rz=0.0, rx=0.0, parent=None):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc); g = act()
    g.name = 'djgrp_' + n; g.rotation_euler = (rx, 0, rz); g.parent = parent
    bpy.context.view_layer.update(); return g
def part(tag, parent): CUR['tag'], CUR['parent'] = tag, parent

# ------------------------------------------------------------------ materials
GRAPH = mat('graphite', '2a2b2e', 0.48, bump=(1800, 0.04)); DECK = mat('deck', '1f2023', 0.32, coat=0.2)
JOG = mat('jog', '141518', 0.25, coat=0.5); SILV = mat('silver', 'a3a7ad', 0.22, metal=0.9)
CAP = mat('cap', '1c1d20', 0.4); GREY = mat('grey', '55585e', 0.45); WHITE = mat('white_line', 'eeeeee', 0.4)
ORANGE = mat('pad_orange', 'e8731c', 0.45, emit='ff7a1a', strength=0.8); ORANGE_D = mat('orange_dim', 'b85a18', 0.45)
SLOT = mat('slot', '070708', 0.6); RUBBER = mat('rubber', '18191b', 0.85, bump=(2500, 0.1))
SPKB = mat('speaker_body', '131416', 0.55, bump=(2000, 0.03)); BAFFLE = mat('baffle', '0e0f11', 0.38, coat=0.3)
CONE = mat('cone', '2b2c30', 0.62, bump=(900, 0.12)); DOME = mat('dome', '35373b', 0.25, coat=0.6)
BLUE = mat('bt_led', '2a6cff', 0.3, emit='3a7dff', strength=6.0); FOAM = mat('iso_pad', '3a3c40', 0.95, bump=(600, 0.3))
WOOD = mat('table_walnut', '4e3322', 0.5, coat=0.15, bump=(300, 0.05)); STEEL = mat('table_steel', '1a1b1d', 0.4, metal=0.6)
LED_O = mat('led_orange', 'ff6a1a', 0.4, emit='ff6a1a', strength=10.0); LED_P = mat('led_purple', '8a4dff', 0.4, emit='8a4dff', strength=9.0)
XFLOOR = mat('floor', '9c9791', 0.6, prefix='djx_m_'); XWALL = mat('wall', 'e6e3de', 1.0, prefix='djx_m_'); XTRIM = mat('trim', 'fdfdfc', 0.6, prefix='djx_m_')

# ------------------------------------------------------------------ extension shell
def build_ext():
    part('dj_ext_shell', None)
    L, cy, lx, cx = FZ2 - FZ, -(FZ + FZ2) / 2, HW + RX, (RX - HW) / 2
    cube('ext_floor', lx, L, 0.05, XFLOOR, (cx, cy, -0.025))
    cube('ext_wall_left', TH, L, RH, XWALL, (-HW + TH / 2, cy, RH / 2))
    cube('ext_wall_right_low', TH, L, 0.56, XWALL, (RX - TH / 2, cy, 0.28))
    cube('ext_baseboard_left', 0.022, L, 0.12, XTRIM, (-HW + TH + 0.011, cy, 0.06))
    cube('ext_baseboard_right', 0.022, L, 0.12, XTRIM, (RX - TH - 0.011, cy, 0.06))

# ------------------------------------------------------------------ table + sub + LED
def build_table():
    g = grp('table', (TX, TY, 0))
    part('dj_table', g)
    cube('top', 0.6, 1.2, 0.03, WOOD, (0, 0, TOP - 0.015), bevel=0.004)
    for i, (sx, sy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))):
        cube(f'leg_{i}', 0.04, 0.04, TOP - 0.03, STEEL, (sx * 0.25, sy * 0.55, (TOP - 0.03) / 2), bevel=0.004)
        cube(f'foot_{i}', 0.05, 0.05, 0.012, RUBBER, (sx * 0.25, sy * 0.55, 0.006), bevel=0.002)
    for sx in (-1, 1): cube(f'rail_{sx}', 0.03, 1.06, 0.04, STEEL, (sx * 0.25, 0, TOP - 0.06), bevel=0.003)
    for sy in (-1, 1): cube(f'rail_end_{sy}', 0.46, 0.03, 0.04, STEEL, (0, sy * 0.55, TOP - 0.06), bevel=0.003)
    cube('stretcher', 0.03, 1.06, 0.03, STEEL, (0.25, 0, 0.16), bevel=0.003)
    cube('led_under', 0.012, 1.1, 0.008, LED_O, (-0.27, 0, TOP - 0.035))
    s = grp('sub', (TX - 0.08, TY + 0.28, 0), rz=radians(-90))      # woofer faces the room (-x)
    part('dj_sub', s)
    cube('body', 0.33, 0.38, 0.36, SPKB, (0, 0, 0.19), bevel=0.012)
    cube('front', 0.31, 0.004, 0.34, BAFFLE, (0, -0.191, 0.19))
    tor('surround', 0.105, 0.012, RUBBER, (0, -0.192, 0.19), rot=(radians(90), 0, 0))
    cyl('woofer', 0.1, 0.03, CONE, (0, -0.18, 0.19), rot=(radians(90), 0, 0), r2=0.04)
    sph('cap', 0.035, DOME, (0, -0.19, 0.19), s=(1, 0.4, 1))
    for i, sx in enumerate((-1, 1)): cyl(f'foot_{i}', 0.02, 0.01, RUBBER, (sx * 0.13, 0, 0.005), v=16)

# ------------------------------------------------------------------ Pioneer DJ DDJ-FLX4 (482.6 x 272.3 x 58.5 mm)
def knob(n, x, y, r=0.0075, h=0.012, top=GREY):
    cyl(n, r, h, CAP, (x, y, 0.034 + h / 2), v=24, bevel=0.0015)
    cyl(n + '_top', r * 0.8, 0.002, top, (x, y, 0.034 + h + 0.001), v=24)
    cube(n + '_ind', 0.0012, r * 0.8, 0.0008, WHITE, (x, y + r * 0.45, 0.034 + h + 0.0022))
def build_flx4():
    W, D = 0.4826, 0.2723
    c = grp('flx4', (CTRL_X, TY, TOP), rz=CTRL_RZ)
    part('dj_flx4', c)
    cube('body', W, D, 0.03, GRAPH, (0, 0, 0.017), bevel=0.012, seg=4)
    cube('deck', W - 0.022, D - 0.022, 0.004, DECK, (0, 0, 0.032), bevel=0.002)
    for i, (sx, sy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))): cyl(f'foot_{i}', 0.012, 0.004, RUBBER, (sx * 0.2, sy * 0.1, 0.002), v=16)
    for side, cx in (('l', -0.135), ('r', 0.135)):
        tor('jog_well_' + side, 0.069, 0.0025, SLOT, (cx, 0.018, 0.034))
        for i, px in enumerate((-0.039, -0.013, 0.013, 0.039)):
            for j, py in enumerate((-0.088, -0.113)):
                cube(f'pad_{side}_{i}_{j}', 0.021, 0.021, 0.005, ORANGE, (cx + px, py, 0.036), bevel=0.002)
        ox = -0.213 if side == 'l' else 0.213
        for j, py in enumerate((-0.088, -0.113)):
            cyl(f'transport_{side}_{j}', 0.009, 0.004, CAP, (ox, py, 0.036), v=24)
            tor(f'transport_ring_{side}_{j}', 0.0085, 0.0012, ORANGE, (ox, py, 0.038))
        for k, bx in enumerate((-0.03, 0.0, 0.03)): cube(f'func_{side}_{k}', 0.018, 0.008, 0.003, GREY, (cx + bx, -0.064, 0.035), bevel=0.001)
        tx = -0.224 if side == 'l' else 0.224
        cube('tempo_slot_' + side, 0.004, 0.1, 0.001, SLOT, (tx, 0.03, 0.0345))
        cube('tempo_cap_' + side, 0.012, 0.008, 0.008, GREY, (tx, 0.035, 0.038), bevel=0.0015)
        sx = -1 if side == 'l' else 1
        cube('fader_slot_' + side, 0.004, 0.064, 0.001, SLOT, (sx * 0.03, -0.045, 0.0345))
        for k, ky in enumerate((0.105, 0.082, 0.06, 0.038, 0.016)): knob(f'knob_{side}_{k}', sx * 0.03, ky)
        cube('cue_' + side, 0.01, 0.007, 0.003, ORANGE_D, (sx * 0.012, -0.004, 0.035), bevel=0.001)
        cube('load_' + side, 0.012, 0.006, 0.003, GREY, (sx * 0.012, 0.046, 0.035), bevel=0.001)
        for m in range(6): cube(f'meter_{side}_{m}', 0.003, 0.003, 0.0008, ORANGE_D if m > 3 else GREY, (sx * 0.0125, 0.06 + m * 0.005, 0.0346))
    knob('master', 0, 0.112); knob('browse', 0, 0.082, r=0.009, h=0.01)
    cube('xfader_slot', 0.062, 0.004, 0.001, SLOT, (0, -0.112, 0.0345))
    # movable parts: own pivots, axes = controller axes
    for side, cx in (('l', -0.135), ('r', 0.135)):
        p = grp('jog_' + side, (cx, 0.018, 0.04), parent=c); part('dj_jog_' + side, p)
        cyl('platter', 0.064, 0.012, JOG, (0, 0, 0), v=64, bevel=0.002)
        tor('ring', 0.059, 0.0028, SILV, (0, 0, 0.0055))
        cyl('center', 0.03, 0.003, GREY, (0, 0, 0.0065), v=48)
        cube('mark', 0.004, 0.02, 0.001, ORANGE, (0, 0.042, 0.0065))
    for i, sx in ((1, -1), (2, 1)):
        p = grp(f'fader_{i}', (sx * 0.03, -0.045, 0.04), parent=c); part(f'dj_fader_{i}', p)
        cube('cap', 0.014, 0.009, 0.011, CAP, (0, 0, 0), bevel=0.0015)
        cube('line', 0.012, 0.0012, 0.0006, WHITE, (0, 0, 0.0058))
    p = grp('xfader', (0, -0.112, 0.04), parent=c); part('dj_xfader', p)
    cube('cap', 0.009, 0.014, 0.011, CAP, (0, 0, 0), bevel=0.0015)
    cube('line', 0.0012, 0.012, 0.0006, WHITE, (0, 0, 0.0058))

# ------------------------------------------------------------------ Pioneer DJ DM-40D-BT (146 x 227 x 224 mm each)
def build_dm40():
    W, H, D = 0.146, 0.227, 0.224
    for side, x, y, rz in SPK:
        g = grp('dm40_' + side, (x, y, TOP), rz=rz)
        part('dj_dm40_' + side, g)
        cube('iso_pad', 0.13, 0.2, 0.02, FOAM, (0, 0, 0.01), bevel=0.003)
        z0 = 0.02
        cube('body', W, D, H, SPKB, (0, 0, z0 + H / 2), bevel=0.014, seg=4)
        cube('baffle', W - 0.01, 0.004, H - 0.01, BAFFLE, (0, -D / 2 - 0.001, z0 + H / 2), bevel=0.006)
        tor('woofer_frame', 0.058, 0.004, mat('frame', '26272a', 0.4), (0, -D / 2 - 0.003, z0 + 0.092), rot=(radians(90), 0, 0))
        tor('woofer_surround', 0.049, 0.0065, RUBBER, (0, -D / 2 - 0.002, z0 + 0.092), rot=(radians(90), 0, 0))
        tor('tweeter_guide', 0.026, 0.006, BAFFLE, (0, -D / 2 - 0.002, z0 + 0.182), rot=(radians(90), 0, 0))
        sph('tweeter_dome', 0.012, DOME, (0, -D / 2 - 0.003, z0 + 0.182), s=(1, 0.55, 1))
        for i, sx in enumerate((-1, 1)): cube(f'port_{i}', 0.032, 0.01, 0.012, SLOT, (sx * 0.037, -D / 2 - 0.001, z0 + 0.026), bevel=0.004)
        if side == 'l':
            cyl('bt_led', 0.004, 0.003, BLUE, (-0.05, -D / 2 - 0.003, z0 + 0.15), rot=(radians(90), 0, 0), v=16)
            cyl('volume', 0.01, 0.012, CAP, (0.05, -D / 2 - 0.008, z0 + 0.15), rot=(radians(90), 0, 0), v=24, bevel=0.0015)
        p = grp('cone_' + side, (0, -D / 2 - 0.002, z0 + 0.092), rx=radians(90), parent=g)   # local +z = outward
        part(f'dj_spk_{side}_cone', p)
        cyl('cone', 0.016, 0.02, CONE, (0, 0, -0.008), r2=0.045, v=48)
        sph('dust_cap', 0.017, DOME, (0, 0, 0.002), s=(1, 1, 0.45))

# ------------------------------------------------------------------ assemble
STATIC = ['dj_ext_shell', 'dj_table', 'dj_sub', 'dj_flx4', 'dj_dm40_l', 'dj_dm40_r']
MOVABLE = ['dj_jog_l', 'dj_jog_r', 'dj_fader_1', 'dj_fader_2', 'dj_xfader', 'dj_spk_l_cone', 'dj_spk_r_cone']
BYTAG = {}
def join_part(tag, pivot=None):
    objs = BYTAG[tag]   # collected before any join (joined objects get deleted, touching them later crashes)
    deselect()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    o = act(); o.name = tag; o.data.name = tag
    if pivot is not None:
        o.data.transform(pivot.inverted()); o.matrix_world = pivot
    return o

def build():
    for o in [o for o in bpy.data.objects if o.name.startswith(('dj_', 'djtmp_', 'djgrp_'))]: bpy.data.objects.remove(o, do_unlink=True)
    build_ext(); build_table(); build_flx4(); build_dm40()
    bpy.context.view_layer.update()
    BYTAG.clear()
    for o in NEW: BYTAG.setdefault(o['dj_part'], []).append(o)
    pivots = {}
    names = {'dj_jog_l': 'djgrp_jog_l', 'dj_jog_r': 'djgrp_jog_r', 'dj_fader_1': 'djgrp_fader_1', 'dj_fader_2': 'djgrp_fader_2',
             'dj_xfader': 'djgrp_xfader', 'dj_spk_l_cone': 'djgrp_cone_l', 'dj_spk_r_cone': 'djgrp_cone_r'}
    for t, e in names.items(): pivots[t] = bpy.data.objects[e].matrix_world.copy()
    made = [join_part(t) for t in STATIC] + [join_part(t, pivots[t]) for t in MOVABLE]
    for o in [o for o in bpy.data.objects if o.name.startswith('djgrp_')]: bpy.data.objects.remove(o, do_unlink=True)
    # lights for the corner (kept in the .blend; hidden for normal renders like the other room lights)
    for n, loc, energy, col in (('dj_light_orange', (TX - 0.3, TY, 0.55), 25, 'ff7a2a'), ('dj_light_purple', (TX + 0.15, TY, 2.2), 18, '8a4dff')):
        old = bpy.data.objects.get(n)
        if old: bpy.data.objects.remove(old, do_unlink=True)
        ld = bpy.data.lights.new(n, 'POINT'); ld.energy = energy; ld.color = srgb(col); ld.shadow_soft_size = 0.25
        lo = bpy.data.objects.new(n, ld); lo.location = loc; sc.collection.objects.link(lo)
    # UVs: DJ items share one atlas, extension shell its own
    for group in ([o for o in made if o.name != 'dj_ext_shell'], [bpy.data.objects['dj_ext_shell']]):
        deselect()
        for o in group: o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.003, scale_to_bounds=False)
        try: bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
        except Exception: pass
        bpy.ops.object.mode_set(mode='OBJECT')
    deselect()
    bpy.ops.wm.save_mainfile()
    print('BUILD DONE:', ', '.join(f'{o.name} ({len(o.data.polygons)} faces)' for o in made))
    print('Now close Blender and run bake_dj_corner.bat (overnight).')

def baked_material(name, img):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.inputs['Base Color'].default_value = (0, 0, 0, 1); b.inputs['Roughness'].default_value = 1
    for k in ('Emission Color', 'Emission'):
        if k in b.inputs: nt.links.new(tex.outputs['Color'], b.inputs[k]); break
    b.inputs['Emission Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m

def bake_set(objs, img_name, size):
    img = bpy.data.images.get(img_name) or bpy.data.images.new(img_name, size, size)
    if img.size[0] != size: img.scale(size, size)
    for o in objs:
        for s in o.material_slots:
            nt = s.material.node_tree
            n = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'BAKE_TARGET'; n.image = img; nt.nodes.active = n
    deselect()
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    print('Baking', img_name, size, 'px', SAMPLES, 'samples ... (hours on CPU — leave it)')
    bpy.ops.object.bake(type='COMBINED')
    img.filepath_raw = os.path.join(out_dir, img_name + '.png'); img.file_format = 'PNG'; img.save()
    bm = baked_material(img_name + 'd', img)
    for o in objs: o.data.materials.clear(); o.data.materials.append(bm)

def bake_and_export():
    names = STATIC + MOVABLE
    objs = [bpy.data.objects.get(n) for n in names]
    if not all(objs): raise Exception('DJ objects missing — run this script in the GUI first (build stage).')
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES; sc.cycles.use_adaptive_sampling = False
    for k, v in (('use_denoising', True), ('use_denoising_bake', True)):
        try: setattr(sc.cycles, k, v)
        except Exception: pass
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 2
    b = sc.render.bake; b.use_pass_direct = b.use_pass_indirect = b.use_pass_color = True; b.margin = 8; b.use_clear = True
    lights = [o for o in sc.objects if o.type == 'LIGHT']
    for o in lights: o.hide_render = False
    kd = bpy.data.lights.new('dj_bake_key', 'AREA'); kd.energy = 60; kd.size = 1.3; kd.color = srgb('fff3e6')
    key = bpy.data.objects.new('dj_bake_key', kd); key.location = (TX + 0.1, TY, 2.3); sc.collection.objects.link(key)
    bake_set([o for o in objs if o.name != 'dj_ext_shell'], 'dj_bake', DJ_SIZE)
    bake_set([bpy.data.objects['dj_ext_shell']], 'dj_ext_bake', EXT_SIZE)
    for o in lights: o.hide_render = True
    bpy.data.objects.remove(key, do_unlink=True); bpy.data.lights.remove(kd)
    bpy.ops.wm.save_mainfile()
    out = os.path.join(out_dir, 'dj-corner-v1.glb')
    deselect()
    for o in objs: o.select_set(True)
    base = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
    for fmt in ('WEBP', 'JPEG', None):
        try:
            if fmt: bpy.ops.export_scene.gltf(**base, export_image_format=fmt)
            else: bpy.ops.export_scene.gltf(**base)
            break
        except (TypeError, RuntimeError): continue
    print('BAKE + EXPORT DONE:', out, round(os.path.getsize(out) / 1e6, 1), 'MB')

if STAGE == 'bake': bake_and_export()
else: build()
