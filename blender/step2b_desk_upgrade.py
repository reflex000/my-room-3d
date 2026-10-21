# Step 2b — HD desk items: Donald, Homer plush, headphones, twin-bell clock, vertical mouse, puppy notebook.
# Rebuilds ONLY these six. room_shell / room_props / chair / the rest of desk_items are not touched or re-baked.
#
#   A) BUILD (GUI, ~1-2 min): open myroom.blend > Scripting > New > paste > Run Script.
#      Removes the old low-poly copies from desk_items, builds the detailed 'desk_hd' object, unwraps it, saves.
#   B) BAKE (overnight, headless): double-click blender\bake_desk_hd.bat
#      (= blender -b myroom.blend --python step2b_desk_upgrade.py -- --bake)
#      Bakes desk_hd at 2048 px / 256 samples + denoise, saves desk_hd_bake.png + .blend, exports desk-hd-v3.glb.
import bpy, bmesh, os, sys
from math import radians, pi, cos, sin
from mathutils import Vector

STAGE = 'build'                       # GUI run builds; the .bat passes --bake
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--bake' in args: STAGE = 'bake'
SIZE, SAMPLES = 2048, 256
DX, DY, DZ = 0.72, 1.24, 0.76
TOP = DZ + 0.0175
sc = bpy.context.scene
if not bpy.data.filepath: raise Exception('Open myroom.blend first.')
out_dir = os.path.dirname(bpy.data.filepath)
if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
def deselect(): bpy.ops.object.select_all(action='DESELECT')

# old low-poly copies inside desk_items (Blender coords, min / max). Same boxes are used in room.js on room-v3.glb.
OLD = {
    'duck':       ((0.985, 1.325, 0.765), (1.135, 1.475, 0.98)),
    'clock':      ((1.35, 1.37, 0.765), (1.49, 1.51, 0.93)),
    'headphones': ((1.132, 1.232, 0.765), (1.348, 1.448, 0.84)),
    'mouse':      ((0.965, 1.015, 0.765), (1.095, 1.145, 0.87)),
    'homer':      ((1.27, 1.01, 0.765), (1.53, 1.27, 1.30)),   # was z<=1.10: the old head survived and enclosed the HD head (black)
    'notebook':   ((0.75, 0.90, 0.765), (0.95, 1.10, 0.83)),
}

# ------------------------------------------------------------------ materials
def srgb(h):
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    return tuple(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in (r, g, b))
MATS = {}
def mat(name, hexcol, rough=0.6, metal=0.0, sss=0.0, sheen=0.0, coat=0.0, bump=None):
    name = 'hd_' + name
    if name in MATS: return MATS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    def put(keys, v):
        for k in keys:
            if k in b.inputs: b.inputs[k].default_value = v; return
    put(['Base Color'], (*srgb(hexcol), 1)); put(['Roughness'], rough); put(['Metallic'], metal)
    if sss: put(['Subsurface Weight', 'Subsurface'], sss); put(['Subsurface Radius'], (0.004, 0.002, 0.001))
    if sheen: put(['Sheen Weight', 'Sheen'], sheen)
    if coat: put(['Coat Weight', 'Clearcoat'], coat)
    if bump:   # fine noise bump in metres (plush fuzz, fabric, rubber) — gets baked into the shading
        tc = nt.nodes.new('ShaderNodeTexCoord'); n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = bump[0]; n.inputs['Detail'].default_value = 8
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump[1]
        nt.links.new(tc.outputs['Object'], n.inputs['Vector']); nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    MATS[name] = m; return m

# ------------------------------------------------------------------ primitives (local coords inside a group: -y = front, z = up)
NEW = []
def fin(o, n, m, p, sub=0, bevel=0.0, smooth=True):
    o.name = 'hd_' + n; o.data.name = o.name
    o.data.materials.clear(); o.data.materials.append(m)
    if bevel:
        md = o.modifiers.new('Bevel', 'BEVEL'); md.width = bevel; md.segments = 3; md.limit_method = 'ANGLE'
    if sub:
        md = o.modifiers.new('Sub', 'SUBSURF'); md.levels = sub; md.render_levels = sub
    if smooth:
        for f in o.data.polygons: f.use_smooth = True
    o.parent = p; NEW.append(o); return o
def act(): return bpy.context.active_object
def sph(n, r, m, p, loc, s=(1, 1, 1), rot=(0, 0, 0), seg=32, sub=0):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc, rotation=rot)
    o = act(); o.scale = s; return fin(o, n, m, p, sub)
def cyl(n, r, h, m, p, loc, rot=(0, 0, 0), r2=None, v=32, bevel=0.0, s=(1, 1, 1), smooth=True):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=v, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=v, location=loc, rotation=rot)
    o = act(); o.scale = s; return fin(o, n, m, p, 0, bevel, smooth)
def cube(n, w, d, h, m, p, loc, rot=(0, 0, 0), bevel=0.0, sub=0, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = act(); o.scale = (w, d, h); return fin(o, n, m, p, sub, bevel, smooth or bool(sub))
def tor(n, R, r, m, p, loc, rot=(0, 0, 0), s=(1, 1, 1), keep=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=12, location=loc, rotation=rot)
    o = act(); o.scale = s
    if keep:   # keep only verts where keep(local_co) is True (open arcs)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context='VERTS'); bm.to_mesh(o.data); bm.free()
    return fin(o, n, m, p)
def limb(n, a, b, r1, r2, m, p, caps=True):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=d.length, vertices=24, location=(a + b) / 2)
    o = act(); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    fin(o, n, m, p)
    if caps: sph(n + '_j1', r1, m, p, a, seg=20); sph(n + '_j2', r2, m, p, b, seg=20)
    return o
def grp(n, x, y, z, rz=0.0):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(x, y, z)); g = act()
    g.name = 'hd_grp_' + n; g.rotation_euler = (0, 0, rz); bpy.context.view_layer.update(); return g

# ------------------------------------------------------------------ models
def build_duck():
    g = grp('duck', DX + 0.34, DY + 0.16, TOP, -0.4)
    BLUE = mat('duck_blue', '2f7fd0', 0.32, coat=0.4); WH = mat('duck_white', 'f6f4ee', 0.3, coat=0.4)
    OR = mat('duck_orange', 'f5a623', 0.3, coat=0.4); YEL = mat('duck_yellow', 'f2d03b', 0.35)
    RD = mat('duck_red', 'd2262c', 0.3, coat=0.4); BK = mat('duck_black', '111214', 0.25, coat=0.5)
    LID = mat('duck_lid', 'a9d4ef', 0.35)
    for i, sg in enumerate((-1, 1)):
        sph(f'duck_foot_{i}', 0.022, OR, g, (sg * 0.02, -0.014, 0.007), (1.0, 1.55, 0.32), (0, 0, sg * 0.25), sub=1)
        limb(f'duck_leg_{i}', (sg * 0.016, 0.0, 0.012), (sg * 0.014, 0.002, 0.045), 0.009, 0.011, OR, g)
    sph('duck_belly', 0.04, WH, g, (0, 0.002, 0.058), (1.0, 0.95, 0.8))
    sph('duck_jacket', 0.041, BLUE, g, (0, 0.003, 0.088), (1.0, 0.95, 1.02))
    tor('duck_jacket_hem', 0.036, 0.004, BLUE, g, (0, 0.003, 0.064), s=(1, 0.95, 1))
    # sailor collar with yellow stripes + red bow
    tor('duck_collar', 0.026, 0.006, BLUE, g, (0, 0.002, 0.123), s=(1, 0.95, 0.6))
    tor('duck_collar_stripe_l', 0.032, 0.0018, YEL, g, (-0.014, -0.02, 0.112), rot=(radians(70), 0, radians(30)), keep=lambda c: c.y < 0)
    tor('duck_collar_stripe_r', 0.032, 0.0018, YEL, g, (0.014, -0.02, 0.112), rot=(radians(70), 0, radians(-30)), keep=lambda c: c.y < 0)
    sph('duck_bow_l', 0.014, RD, g, (-0.014, -0.036, 0.116), (1.1, 0.45, 0.85), (0, radians(-20), 0), sub=1)
    sph('duck_bow_r', 0.014, RD, g, (0.014, -0.036, 0.116), (1.1, 0.45, 0.85), (0, radians(20), 0), sub=1)
    sph('duck_bow_knot', 0.006, RD, g, (0, -0.04, 0.116))
    # arms: right one waving up, left one out to the side
    limb('duck_arm_r', (0.034, 0.0, 0.105), (0.05, -0.012, 0.15), 0.011, 0.01, BLUE, g)
    tor('duck_cuff_r', 0.011, 0.003, YEL, g, (0.052, -0.013, 0.154), rot=(radians(15), radians(-20), 0))
    sph('duck_hand_r', 0.013, WH, g, (0.055, -0.016, 0.172), (0.9, 0.45, 1.25), (0, radians(-15), 0), sub=1)
    limb('duck_arm_l', (-0.034, 0.0, 0.1), (-0.072, -0.01, 0.085), 0.011, 0.01, BLUE, g)
    tor('duck_cuff_l', 0.011, 0.003, YEL, g, (-0.075, -0.01, 0.084), rot=(0, radians(80), 0))
    sph('duck_hand_l', 0.013, WH, g, (-0.092, -0.014, 0.08), (1.35, 0.9, 0.45), sub=1)
    # head
    sph('duck_head', 0.035, WH, g, (0, -0.004, 0.163), (1.0, 0.98, 1.05))
    sph('duck_cheek_l', 0.018, WH, g, (-0.018, -0.024, 0.15), (1, 0.8, 0.8))
    sph('duck_cheek_r', 0.018, WH, g, (0.018, -0.024, 0.15), (1, 0.8, 0.8))
    for i, sg in enumerate((-1, 1)):
        sph(f'duck_eye_{i}', 0.012, WH, g, (sg * 0.012, -0.03, 0.172), (0.85, 0.5, 1.25))
        sph(f'duck_lid_{i}', 0.0122, LID, g, (sg * 0.012, -0.0305, 0.178), (0.86, 0.5, 0.7))
        sph(f'duck_pupil_{i}', 0.0055, BK, g, (sg * 0.011, -0.0365, 0.168), (0.8, 0.35, 1.35))
    sph('duck_bill_top', 0.02, OR, g, (0, -0.045, 0.152), (1.15, 1.35, 0.42), (radians(-8), 0, 0), sub=1)
    sph('duck_bill_low', 0.016, OR, g, (0, -0.04, 0.141), (1.05, 1.2, 0.4), (radians(10), 0, 0), sub=1)
    sph('duck_tongue', 0.008, mat('duck_tongue', 'e8707e', 0.4), g, (0, -0.042, 0.146), (1, 1.3, 0.4))
    sph('duck_hair', 0.012, BK, g, (-0.004, 0.03, 0.17), (0.6, 0.8, 1.2), (radians(-30), 0, radians(20)), sub=1)
    # sailor cap
    cyl('duck_cap_band', 0.03, 0.012, BK, g, (0, 0.0, 0.19), rot=(radians(-12), 0, 0), v=40, bevel=0.002)
    cyl('duck_cap', 0.031, 0.02, BLUE, g, (0, 0.002, 0.202), rot=(radians(-12), 0, 0), r2=0.036, v=40, bevel=0.003)
    sph('duck_cap_top', 0.036, BLUE, g, (0, 0.004, 0.214), (1.08, 1.0, 0.32), (radians(-12), 0, 0))

def build_homer():
    g = grp('homer', DX + 0.68, DY - 0.1, TOP + 0.022, -0.3)   # stands on the closed work laptop lid
    FZ = (900, 0.18)
    SK = mat('homer_skin', 'f6cf1d', 0.85, sheen=0.6, bump=FZ); JE = mat('homer_jeans', '5aa6e0', 0.8, sheen=0.3, bump=(700, 0.12))
    SH = mat('homer_shirt', 'f6f6f3', 0.85, sheen=0.4, bump=(700, 0.1)); SO = mat('homer_shoe', '7d8187', 0.9, sheen=0.4, bump=FZ)
    MZ = mat('homer_muzzle', 'c9a46a', 0.9, sheen=0.5, bump=FZ); EW = mat('homer_eyewhite', 'fbfbfa', 0.7, sheen=0.3)
    BK = mat('homer_black', '141414', 0.6)
    for i, sg in enumerate((-1, 1)):
        sph(f'homer_shoe_{i}', 0.03, SO, g, (sg * 0.036, -0.016, 0.017), (1.0, 1.5, 0.62), sub=1)
        cyl(f'homer_leg_{i}', 0.03, 0.1, JE, g, (sg * 0.036, 0, 0.085), v=32, bevel=0.004)
        tor(f'homer_cuff_{i}', 0.031, 0.008, JE, g, (sg * 0.036, 0, 0.045))
    sph('homer_hips', 0.058, JE, g, (0, 0.002, 0.14), (1.05, 0.82, 0.55))
    sph('homer_belly', 0.064, SH, g, (0, -0.004, 0.19), (1.0, 0.86, 0.85), sub=0)
    sph('homer_chest', 0.055, SH, g, (0, 0.004, 0.232), (1.05, 0.82, 0.62))
    tor('homer_shirt_hem', 0.058, 0.006, SH, g, (0, -0.002, 0.152), s=(1.05, 0.86, 1))
    for i, sg in enumerate((-1, 1)):
        sph(f'homer_collar_{i}', 0.026, SH, g, (sg * 0.02, -0.024, 0.262), (0.9, 0.35, 0.6), (radians(-35), radians(sg * 25), 0), sub=1)
        cyl(f'homer_sleeve_{i}', 0.026, 0.05, SH, g, (sg * 0.066, 0, 0.226), rot=(0, radians(sg * 60), 0), v=32, bevel=0.004)
        limb(f'homer_arm_{i}', (sg * 0.078, -0.002, 0.212), (sg * 0.085, -0.01, 0.15), 0.018, 0.016, SK, g)
        sph(f'homer_hand_{i}', 0.019, SK, g, (sg * 0.088, -0.014, 0.128), (0.8, 0.6, 1.2), sub=1)
        sph(f'homer_thumb_{i}', 0.007, SK, g, (sg * 0.079, -0.026, 0.138), (1, 1, 1.4))
    cyl('homer_neck', 0.028, 0.03, SK, g, (0, 0.004, 0.272), v=32)
    sph('homer_head', 0.047, SK, g, (0, 0.006, 0.33), (1, 0.95, 1.4), seg=48)   # one closed capsule: no hidden caps / black inner faces
    sph('homer_muzzle', 0.04, MZ, g, (0, -0.03, 0.29), (1.05, 0.75, 0.62), sub=1)
    tor('homer_mouth', 0.026, 0.0015, mat('homer_mouthline', '9a7a46', 0.9), g, (0, -0.058, 0.288), rot=(radians(90), 0, 0), s=(1.2, 0.5, 1), keep=lambda c: c.y < -0.008)
    for i, sg in enumerate((-1, 1)):
        sph(f'homer_eye_{i}', 0.021, EW, g, (sg * 0.02, -0.036, 0.342), (1.0, 0.6, 1.08))
        sph(f'homer_pupil_{i}', 0.005, BK, g, (sg * 0.022, -0.049, 0.342), (1, 0.4, 1))
        sph(f'homer_ear_{i}', 0.011, SK, g, (sg * 0.047, 0.012, 0.318), (0.45, 0.8, 1))
    sph('homer_nose', 0.012, SK, g, (0, -0.052, 0.318), (1, 1.25, 1))
    for i, x in enumerate((-0.007, 0.007)):   # the two hairs on top
        tor(f'homer_hair_{i}', 0.014, 0.0014, BK, g, (x, 0.006, 0.39), rot=(0, radians(90), 0), keep=lambda c: c.y > 0)
    for i, sg in enumerate((-1, 1)):          # side zig-zag
        tor(f'homer_side_hair_{i}', 0.008, 0.0014, BK, g, (sg * 0.044, 0.02, 0.34), rot=(0, radians(sg * 80), 0), keep=lambda c: c.x > 0)

def build_headphones():
    g = grp('headphones', DX + 0.52, DY + 0.1, TOP, 0.5)
    NV = mat('hp_navy', '1f3f7a', 0.35, coat=0.3); PAD = mat('hp_pad', '6aa8e6', 0.8, sheen=0.6, bump=(900, 0.15))
    MT = mat('hp_metal', 'aeb4bb', 0.25, metal=0.9); BK = mat('hp_black', '1a1c20', 0.5, bump=(1200, 0.08))
    for i, sg in enumerate((-1, 1)):
        x = sg * 0.075
        cyl(f'hp_cup_{i}', 0.04, 0.026, NV, g, (x, 0, 0.04), rot=(0, radians(90), 0), v=48, bevel=0.006, s=(1, 1, 1))
        sph(f'hp_cup_back_{i}', 0.034, NV, g, (x + sg * 0.012, 0, 0.04), (0.35, 1, 1))
        tor(f'hp_pad_{i}', 0.026, 0.012, PAD, g, (x - sg * 0.018, 0, 0.04), rot=(0, radians(90), 0))
        cyl(f'hp_pad_cloth_{i}', 0.015, 0.003, BK, g, (x - sg * 0.014, 0, 0.04), rot=(0, radians(90), 0), v=40)
        tor(f'hp_yoke_{i}', 0.044, 0.0035, MT, g, (x, 0, 0.04), rot=(0, radians(90), 0), keep=lambda c: c.y > 0.01)
    tor('hp_band', 0.08, 0.0075, NV, g, (0, 0.022, 0.07), s=(1, 1, 0.55), keep=lambda c: c.y > 0)
    tor('hp_band_pad', 0.074, 0.007, PAD, g, (0, 0.022, 0.066), s=(1, 1, 0.5), keep=lambda c: c.y > 0.035)
    for i, sg in enumerate((-1, 1)):
        limb(f'hp_slider_{i}', (sg * 0.08, 0.022, 0.07), (sg * 0.075, 0.03, 0.04), 0.003, 0.003, MT, g, caps=False)

def build_clock():
    g = grp('clock', DX + 0.7, DY + 0.2, TOP, -0.3)
    BK = mat('clock_black', '18191c', 0.3, metal=0.4, coat=0.6); CH = mat('clock_chrome', 'dfe2e5', 0.12, metal=1.0)
    FC = mat('clock_face', 'f4ead6', 0.6); IN = mat('clock_ink', '1a1a1a', 0.5); RD = mat('clock_red', 'c3272b', 0.4)
    cyl('clock_body', 0.046, 0.034, BK, g, (0, 0, 0.058), rot=(radians(90), 0, 0), v=64, bevel=0.006)
    tor('clock_bezel', 0.042, 0.0035, CH, g, (0, -0.0175, 0.058), rot=(radians(90), 0, 0))
    cyl('clock_face', 0.039, 0.002, FC, g, (0, -0.016, 0.058), rot=(radians(90), 0, 0), v=64)
    cyl('clock_glass', 0.04, 0.003, mat('clock_glass', 'ffffff', 0.02, coat=1.0), g, (0, -0.0185, 0.058), rot=(radians(90), 0, 0), v=64)
    for k in range(12):
        a = k * pi / 6; L = 0.006 if k % 3 == 0 else 0.0035
        cube(f'clock_tick_{k}', 0.0016, 0.001, L, IN, g, (sin(a) * 0.033, -0.0175, 0.058 + cos(a) * 0.033), rot=(0, a, 0))
    cube('clock_hand_h', 0.0026, 0.001, 0.02, IN, g, (sin(-1.0) * 0.009, -0.0182, 0.058 + cos(-1.0) * 0.009), rot=(0, -1.0, 0))
    cube('clock_hand_m', 0.0018, 0.001, 0.03, IN, g, (sin(2.2) * 0.014, -0.0186, 0.058 + cos(2.2) * 0.014), rot=(0, 2.2, 0))
    cube('clock_hand_s', 0.0008, 0.001, 0.032, RD, g, (sin(4.0) * 0.012, -0.019, 0.058 + cos(4.0) * 0.012), rot=(0, 4.0, 0))
    cyl('clock_pin', 0.0025, 0.004, CH, g, (0, -0.019, 0.058), rot=(radians(90), 0, 0), v=16)
    for i, sg in enumerate((-1, 1)):
        bell = sph(f'clock_bell_{i}', 0.022, BK, g, (sg * 0.03, 0.002, 0.103), (1, 1, 0.75), (0, radians(sg * 28), 0), seg=48)
        sph(f'clock_bell_nub_{i}', 0.004, CH, g, (sg * 0.04, 0.002, 0.121))
        limb(f'clock_leg_{i}', (sg * 0.026, 0.004, 0.022), (sg * 0.036, 0.008, 0.004), 0.0035, 0.003, CH, g)
        sph(f'clock_foot_{i}', 0.006, CH, g, (sg * 0.037, 0.008, 0.004))
    cyl('clock_hammer_post', 0.0018, 0.03, CH, g, (0, 0.004, 0.115), v=12)
    sph('clock_hammer', 0.004, CH, g, (0, 0.004, 0.13), (2.2, 1, 1))
    tor('clock_handle', 0.022, 0.003, CH, g, (0, 0.006, 0.112), rot=(radians(90), 0, 0), keep=lambda c: c.y > 0)
    cyl('clock_key', 0.007, 0.004, CH, g, (0, 0.019, 0.058), rot=(radians(90), 0, 0), v=20)

def build_mouse():
    g = grp('mouse', DX + 0.31, DY - 0.16, TOP, -0.08)
    BD = mat('mouse_body', '2a2c30', 0.55, bump=(1500, 0.05)); BT = mat('mouse_button', '1b1c1f', 0.35, coat=0.3)
    RB = mat('mouse_rubber', '3a3c40', 0.9, bump=(2500, 0.2)); GL = mat('mouse_glide', '0e0f10', 0.4)
    sph('mouse_body', 0.04, BD, g, (0.0, 0, 0.034), (0.75, 1.35, 0.95), rot=(0, radians(-28), 0), seg=48)
    sph('mouse_glide', 0.04, GL, g, (0.0, 0, 0.006), (0.78, 1.38, 0.12), seg=32)
    cube('mouse_btn_l', 0.006, 0.05, 0.03, BT, g, (0.019, -0.03, 0.068), rot=(0, radians(-55), 0), sub=2)
    cube('mouse_btn_r', 0.006, 0.05, 0.026, BT, g, (0.028, -0.03, 0.054), rot=(0, radians(-55), 0), sub=2)
    cyl('mouse_wheel', 0.008, 0.005, RB, g, (0.022, -0.012, 0.064), rot=(0, radians(90 - 55), 0), v=32)
    sph('mouse_thumb_rest', 0.022, RB, g, (-0.024, -0.005, 0.024), (0.35, 1.6, 0.6))
    for i in range(2):
        cube(f'mouse_side_btn_{i}', 0.003, 0.012, 0.005, BT, g, (-0.022, -0.022 + i * 0.016, 0.046), rot=(0, radians(-28), 0), sub=1)
    cyl('mouse_led', 0.0018, 0.002, mat('mouse_led', '3dd47a', 0.3), g, (0.006, 0.03, 0.078), rot=(0, radians(-28), 0), v=12)

def build_notebook():
    g = grp('notebook', DX + 0.13, DY - 0.24, TOP, 0.1)
    PG = mat('nb_pages', 'f3f0e8', 0.9, bump=(3000, 0.05)); CV = mat('nb_backboard', '9b9488', 0.9)
    WR = mat('nb_wire', 'c9ccd0', 0.25, metal=1.0)
    cube('nb_back', 0.112, 0.152, 0.002, CV, g, (0, 0, 0.001), bevel=0.0008)
    cube('nb_pages', 0.108, 0.148, 0.014, PG, g, (0, -0.001, 0.009), bevel=0.0015)
    for k in range(5):
        cube(f'nb_page_edge_{k}', 0.1085, 0.0005, 0.0006, mat('nb_line', 'dcd7cc', 0.9), g, (0, -0.0752, 0.004 + k * 0.0024))
    cube('nb_cover', 0.112, 0.152, 0.0016, mat('nb_cover', 'fbfaf6', 0.5, coat=0.4), g, (0, 0, 0.0168), bevel=0.0006)
    cols = [('3fa3a8', -0.027, 0.034), ('e8bf34', 0.027, 0.034), ('d04a3f', -0.027, -0.04), ('2f5aa8', 0.027, -0.04)]
    for i, (c, x, y) in enumerate(cols):
        cube(f'nb_panel_{i}', 0.05, 0.066, 0.0008, mat('nb_panel_' + c, c, 0.45, coat=0.4), g, (x, y, 0.0178), bevel=0.003)
        sph(f'nb_pup_{i}', 0.011, mat('nb_pup', 'f7f3ea', 0.6), g, (x, y - 0.004, 0.0182), (1, 1, 0.08))
        sph(f'nb_pup_ear_{i}', 0.005, mat('nb_pup_ear', '6b4a35', 0.6), g, (x - 0.009, y + 0.004, 0.0184), (1, 1.4, 0.08))
    for k in range(11):
        tor(f'nb_ring_{k}', 0.0055, 0.0009, WR, g, (-0.05 + k * 0.01, 0.075, 0.009), rot=(0, radians(90), 0))

# ------------------------------------------------------------------ stages
def carve_old(obj):
    me = obj.data; bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    mw = obj.matrix_world; seen = set(); kill = []
    for v in bm.verts:
        if v.index in seen: continue
        stack, isl = [v], []; seen.add(v.index)
        while stack:
            a = stack.pop(); isl.append(a)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); stack.append(b)
        pts = [mw @ x.co for x in isl]
        lo = [min(p[i] for p in pts) for i in range(3)]; hi = [max(p[i] for p in pts) for i in range(3)]
        if any(all(lo[i] >= bx[0][i] and hi[i] <= bx[1][i] for i in range(3)) for bx in OLD.values()): kill += isl
    if kill: bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(me); bm.free(); me.update()
    print('removed old low-poly pieces from desk_items:', len(kill), 'verts')

def build():
    di = bpy.data.objects.get('desk_items')
    if not di: raise Exception('desk_items not found — run step3_bake.py once first (the room must be baked).')
    old = bpy.data.objects.get('desk_hd')
    if old: bpy.data.objects.remove(old, do_unlink=True)
    if not di.get('hd_carved2'): carve_old(di); di['hd_carved'] = di['hd_carved2'] = True
    for f in (build_duck, build_homer, build_headphones, build_clock, build_mouse, build_notebook): f()
    bpy.context.view_layer.update()
    deselect()
    for o in NEW: o.select_set(True)
    bpy.context.view_layer.objects.active = NEW[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    hd = act(); hd.name = 'desk_hd'; hd.data.name = 'desk_hd'
    for o in [o for o in bpy.data.objects if o.name.startswith('hd_grp_')]: bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=radians(60), island_margin=0.004, scale_to_bounds=False)
    try: bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    except Exception: pass
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.wm.save_mainfile()
    print('BUILD DONE: desk_hd', len(hd.data.polygons), 'faces. Now run bake_desk_hd.bat (overnight).')

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

def bake_and_export():
    hd = bpy.data.objects.get('desk_hd')
    if not hd: raise Exception('desk_hd not found — run this script in the GUI first (build stage).')
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES; sc.cycles.use_adaptive_sampling = False
    for k, v in (('use_denoising', True), ('use_denoising_bake', True)):
        try: setattr(sc.cycles, k, v)
        except Exception: pass
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 2
    b = sc.render.bake; b.use_pass_direct = b.use_pass_indirect = b.use_pass_color = True; b.margin = 8; b.use_clear = True
    img = bpy.data.images.get('desk_hd_bake') or bpy.data.images.new('desk_hd_bake', SIZE, SIZE)
    if img.size[0] != SIZE: img.scale(SIZE, SIZE)
    for s in hd.material_slots:
        nt = s.material.node_tree
        n = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'BAKE_TARGET'; n.image = img; nt.nodes.active = n
    lights = [o for o in sc.objects if o.type == 'LIGHT']
    for o in lights: o.hide_render = False
    # neutral key over the desk so true colours (yellow skin, white shirt) survive the pink/blue neon
    kd = bpy.data.lights.new('bake_key', 'AREA'); kd.energy = 70; kd.size = 1.4; kd.color = srgb('fff3e6')
    key = bpy.data.objects.new('bake_key', kd); key.location = (DX + 0.2, DY - 0.15, 1.95); sc.collection.objects.link(key)
    chair = bpy.data.objects.get('chair')
    if chair: chair.hide_render = True
    deselect(); hd.select_set(True); bpy.context.view_layer.objects.active = hd
    print('Baking desk_hd', SIZE, 'px', SAMPLES, 'samples ... (hours on CPU — leave it)')
    bpy.ops.object.bake(type='COMBINED')
    for o in lights: o.hide_render = True
    bpy.data.objects.remove(key, do_unlink=True); bpy.data.lights.remove(kd)
    if chair: chair.hide_render = False
    img.filepath_raw = os.path.join(out_dir, 'desk_hd_bake.png'); img.file_format = 'PNG'; img.save()
    hd.data.materials.clear(); hd.data.materials.append(baked_material('desk_hd_baked', img))
    bpy.ops.wm.save_mainfile()
    out = os.path.join(out_dir, 'desk-hd-v3.glb')
    deselect(); hd.select_set(True)
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
