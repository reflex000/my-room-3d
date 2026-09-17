# Step 2 — builds the whole study room in Blender (tested for Blender 4.x / 5.x)
# Scripting tab -> New -> paste -> Run Script (Alt+P)
import bpy, bmesh
from math import radians, pi, cos, sin
from mathutils import Vector

# ---------- reset ----------
bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for b in list(block):
        if b.users == 0: block.remove(b)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'; sc.unit_settings.length_unit = 'METERS'
sc.render.engine = 'CYCLES'

# ---------- helpers ----------
def srgb(h):
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    return tuple(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in (r, g, b))

MATS = {}
def mat(name, hexcol, rough=0.6, metal=0.0, emit=None, strength=1.0, alpha=1.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        try: m.blend_method = 'BLEND'
        except: pass
    if emit:
        for key in ('Emission Color', 'Emission'):
            if key in b.inputs: b.inputs[key].default_value = (*srgb(emit), 1); break
        b.inputs['Emission Strength'].default_value = strength
    MATS[name] = m; return m

def smooth_shade(o):
    for f in (lambda: bpy.ops.object.shade_smooth_by_angle(angle=radians(35)),
              lambda: bpy.ops.object.shade_smooth(use_auto_smooth=True),
              lambda: bpy.ops.object.shade_smooth()):
        try: f(); return
        except Exception: pass

def finish(o, name, m, bevel=0.012, seg=3, smooth=False, parent=None):
    o.name = name; o.data.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(m)
    if bevel:
        bm = o.modifiers.new('Bevel', 'BEVEL'); bm.width = bevel; bm.segments = seg
        bm.limit_method = 'ANGLE'; bm.angle_limit = radians(40)
    if smooth: smooth_shade(o)
    if parent: o.parent = parent
    return o

def box(name, w, d, h, m, x, y, z, rot=(0, 0, 0), bevel=0.012, seg=3, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=rot)
    o = bpy.context.active_object; o.scale = (w, d, h)
    return finish(o, name, m, bevel, seg, parent=parent)

def cyl(name, r, h, m, x, y, z, rot=(0, 0, 0), verts=32, r2=None, bevel=0.004, parent=None):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z), rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=(x, y, z), rotation=rot)
    return finish(bpy.context.active_object, name, m, bevel, 2, smooth=True, parent=parent)

def sphere(name, r, m, x, y, z, scale=(1, 1, 1), parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=28, ring_count=18, location=(x, y, z))
    o = bpy.context.active_object; o.scale = scale
    return finish(o, name, m, 0, smooth=True, parent=parent)

def torus(name, R, r, m, x, y, z, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=28, minor_segments=12, location=(x, y, z), rotation=rot)
    return finish(bpy.context.active_object, name, m, 0, smooth=True, parent=parent)

def plane(name, w, h, m, x, y, z, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z), rotation=rot)
    o = bpy.context.active_object; o.scale = (w, h, 1)
    return finish(o, name, m, 0, parent=parent)

def group(name, x=0, y=0, z=0, rz=0, parent=None):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    g = bpy.context.active_object; g.name = name; g.empty_display_size = 0.1
    g.parent = parent
    g.location = (x, y, z); g.rotation_euler = (0, 0, rz)
    return g

def arc_panel(name, R, theta, h, m, x, y, z, segs=36, solid=None, parent=None):
    """curved screen, concave toward -Y (the viewer)"""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    rows = []
    for zi, zz in enumerate((-h / 2, h / 2)):
        row = []
        for i in range(segs + 1):
            a = -theta / 2 + theta * i / segs
            row.append(bm.verts.new((R * sin(a), R - R * cos(a), zz)))
        rows.append(row)
    for i in range(segs):
        f = bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        for l in f.loops:
            vi = l.vert
            ii = i if vi in (rows[0][i], rows[1][i]) else i + 1
            l[uv].uv = (1 - ii / segs, 0 if vi in rows[0] else 1)
    bm.faces.ensure_lookup_table(); bm.normal_update()
    if bm.faces[0].normal.y > 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = (x, y, z); o.data.materials.append(m)
    if solid:
        s = o.modifiers.new('Solidify', 'SOLIDIFY'); s.thickness = solid; s.offset = -1
    smooth_shade_obj(o)
    if parent: o.parent = parent
    return o

def smooth_shade_obj(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    smooth_shade(o)

# ---------- materials ----------
WALL = mat('wall_white', 'e6e3de', 1.0)
FLOOR = mat('laminate_floor', '9c9791', 0.6)
TRIM = mat('trim_white', 'fdfdfc', 0.6)
BLACK = mat('black_matte', '1b1d1f', 0.55)
DESK = mat('desk_top_black', '17191b', 0.42)
STEEL = mat('steel', 'b4b8bc', 0.34, 0.6)
SILVER = mat('laptop_silver', 'c8ccd0', 0.34, 0.5)
WHITE = mat('white_plastic', 'f2f1ee', 0.45)
FRAME = mat('bed_frame_white', 'f6f5f2', 0.4, 0.2)
FABRIC = mat('grey_fabric', 'a8adb2', 1.0)
RUG = mat('rug_grey', '8e8b87', 1.0)
MESH = mat('chair_mesh', '24282c', 0.9, alpha=0.75)
TEAL = mat('teal', '3fa3a8', 0.6)
LEAF = mat('foliage', '406b3c', 0.9)
YELLOW = mat('yellow_bin', 'e8bf34', 0.55)
PINK = mat('pink_plastic', 'e2557f', 0.55)
BOOK = mat('book_blue', '2e6fa8', 0.8)
PAPER = mat('paper', 'eeeae1', 0.95)
RED = mat('red_accent', 'c3453c', 0.6)
NAVY = mat('navy_blue', '2f5aa8', 0.55)
SKY = mat('sky_blue', '4d8fd6', 0.6)
ORANGE = mat('orange', 'f0921e', 0.5)
LIME = mat('lime_green', '8fc63a', 0.7)
CREAM = mat('cream', 'f3e4c8', 0.9)
CONE = mat('waffle_cone', 'c98a4b', 0.9)
SLAT = mat('bed_slat_wood', 'd9c3a3', 0.8)
MINT = mat('mint_bin', 'b9cbb8', 0.9)
CHROME = mat('chrome', 'd9dcdf', 0.2, 0.8)
PEG = mat('pegboard', 'eeedea', 0.8)
HALL = mat('hall_dark', '6d675f', 1.0)
BLIND = mat('blinds', 'efeae1', 0.95, emit='fff4e2', strength=0.5, alpha=0.7)
SCREEN_MAIN = mat('screen_main', '0d1b25', 0.2, emit='3f9fd0', strength=2.0)
SCREEN_SIDE = mat('screen_side', '0d1b25', 0.2, emit='3fb98f', strength=1.8)
SCREEN_LAP = mat('screen_laptop', '11161c', 0.2, emit='7fd1a8', strength=1.6)
LED = mat('led_display', '2a3f52', 0.3, emit='6ad2ff', strength=3.0)
SHADE = mat('shade_white', 'f7f6f3', 0.5, emit='ffeccf', strength=0.8)

# ---------- shell ----------
HW, TH, RH = 1.85, 0.09, 2.5
box('floor', HW * 2, HW * 2, 0.05, FLOOR, 0, 0, -0.025, bevel=0)
box('wall_back', HW * 2, TH, RH, WALL, 0, HW - TH / 2, RH / 2, bevel=0)
box('wall_left', TH, HW * 2, RH, WALL, -HW + TH / 2, 0, RH / 2, bevel=0)
box('wall_right_low', TH, HW * 2, 0.56, WALL, HW - TH / 2, 0, 0.28, bevel=0)
box('wall_right_pier', TH, 0.5, RH, WALL, HW - TH / 2, HW - 0.25, RH / 2, bevel=0)
box('baseboard_back', HW * 2, 0.022, 0.12, TRIM, 0, HW - TH - 0.012, 0.06, bevel=0.004)
box('baseboard_left', 0.022, HW * 2, 0.12, TRIM, -HW + TH + 0.012, 0, 0.06, bevel=0.004)
box('baseboard_right', 0.022, HW * 2, 0.12, TRIM, HW - TH - 0.012, 0, 0.06, bevel=0.004)
wx = HW - TH - 0.01
plane('window_blinds', 1.75, 2.5, BLIND, wx, -0.2, 1.42, rot=(0, radians(90), 0))
box('blind_rail', 0.07, 2.58, 0.05, TRIM, wx - 0.02, -0.2, 2.32, bevel=0.006)
box('window_sill', 0.1, 2.54, 0.04, TRIM, wx - 0.04, -0.2, 0.54, bevel=0.006)
dy = HW - TH - 0.03
box('door_casing_l', 0.05, 0.06, 2.05, TRIM, -0.78, dy, 1.02, bevel=0.006)
box('door_casing_r', 0.05, 0.06, 2.05, TRIM, 0.02, dy, 1.02, bevel=0.006)
box('door_casing_top', 0.85, 0.06, 0.05, TRIM, -0.38, dy, 2.05, bevel=0.006)
box('doorway_dark', 0.78, 0.02, 2.02, HALL, -0.38, HW - TH - 0.005, 1.01, bevel=0)
box('light_switch', 0.08, 0.02, 0.12, TRIM, -0.92, HW - TH - 0.011, 1.25, bevel=0.004)
box('thermostat', 0.14, 0.02, 0.1, WHITE, -1.02, HW - TH - 0.011, 1.55, bevel=0.006)

# ---------- standing desk ----------
DX, DY, DZ, DW, DD = 0.72, 1.24, 0.76, 1.66, 0.66
box('desk_top', DW, DD, 0.035, DESK, DX, DY, DZ, bevel=0.008)
box('desk_drawer', 1.0, 0.42, 0.1, BLACK, DX, DY - 0.06, DZ - 0.075, bevel=0.012)
box('desk_controller', 0.24, 0.1, 0.05, BLACK, DX + 0.62, DY - 0.22, DZ - 0.055, bevel=0.008)
box('desk_controller_led', 0.13, 0.012, 0.022, LED, DX + 0.62, DY - 0.272, DZ - 0.055, bevel=0)
for i, sg in enumerate((-1, 1)):
    lx = DX + sg * (DW / 2 - 0.16)
    box(f'desk_column_{i+1}', 0.1, 0.11, DZ - 0.09, BLACK, lx, DY, (DZ - 0.09) / 2 + 0.03, bevel=0.016)
    box(f'desk_column_inner_{i+1}', 0.075, 0.085, DZ - 0.24, BLACK, lx, DY, (DZ - 0.24) / 2 + 0.1, bevel=0.012)
    box(f'desk_foot_{i+1}', 0.07, 0.56, 0.05, BLACK, lx, DY, 0.035, bevel=0.014)
    for j, s2 in enumerate((-1, 1)):
        cyl(f'desk_glide_{i+1}_{j+1}', 0.024, 0.022, BLACK, lx, DY + s2 * 0.24, 0.011, verts=16)
box('desk_side_tray', 0.56, 0.44, 0.03, DESK, DX - DW / 2 - 0.24, DY - 0.18, DZ - 0.1, rot=(0, 0, 0.06), bevel=0.008)
box('tray_arm', 0.34, 0.05, 0.05, BLACK, DX - DW / 2 + 0.02, DY - 0.18, DZ - 0.11, bevel=0.012)

# ---------- white main monitor + side monitor on arm ----------
mm = group('monitor_main', DX - 0.2, DY + 0.18, DZ + 0.278, rz=-0.08)
box('monitor_main_shell', 0.74, 0.03, 0.44, WHITE, 0, 0, 0.22, bevel=0.012, parent=mm)
plane('screen_main', 0.71, 0.405, SCREEN_MAIN, 0, -0.017, 0.225, rot=(radians(90), 0, 0), parent=mm)
box('monitor_main_neck', 0.07, 0.045, 0.26, WHITE, 0, 0.01, -0.13, bevel=0.014, parent=mm)
box('monitor_main_base', 0.3, 0.22, 0.02, WHITE, 0, -0.05, -0.25, bevel=0.008, parent=mm)

mon = group('monitor_side', DX + 0.62, DY + 0.12, DZ + 0.24, rz=0.42)
box('monitor_side_shell', 0.56, 0.026, 0.34, BLACK, 0, 0, 0.17, bevel=0.012, parent=mon)
plane('screen_side', 0.538, 0.318, SCREEN_SIDE, 0, -0.015, 0.17, rot=(radians(90), 0, 0), parent=mon)
box('monitor_side_vesa', 0.1, 0.03, 0.1, BLACK, 0, 0.025, 0.17, bevel=0.01, parent=mon)
cyl('monitor_arm_pole', 0.018, 0.5, BLACK, DX + 0.78, DY + 0.3, DZ + 0.27, verts=20)
cyl('monitor_arm_ring', 0.022, 0.05, RED, DX + 0.78, DY + 0.3, DZ + 0.36, verts=20)
cyl('monitor_arm_clamp', 0.03, 0.04, BLACK, DX + 0.78, DY + 0.3, DZ + 0.04, verts=20)
box('monitor_arm_horizontal', 0.26, 0.03, 0.03, BLACK, DX + 0.7, DY + 0.22, DZ + 0.41, rot=(0, 0, 0.6), bevel=0.01)

# ---------- laptops ----------
def laptop(name, w, d, m, x, y, z, rz, open_rad, screen_mat):
    g = group(name, x, y, z, rz=rz)
    box(name + '_base', w, d, 0.014, m, 0, 0, 0, bevel=0.005, parent=g)
    box(name + '_keyboard', w - 0.06, d - 0.1, 0.003, BLACK, 0, -0.012, 0.009, bevel=0, parent=g)
    box(name + '_trackpad', 0.1, 0.07, 0.004, STEEL, 0, -(d / 2 - 0.06), 0.009, bevel=0, parent=g)
    t = open_rad - pi / 2
    L = d * 0.92
    lid = group(name + '_lid', 0, d / 2, 0.007, parent=g)
    lid.rotation_euler = (-t, 0, 0)
    box(name + '_lid_shell', w, 0.012, L, m, 0, 0, L / 2, bevel=0.005, parent=lid)
    plane(name + '_screen' if screen_mat is not SCREEN_LAP else 'screen_laptop', w - 0.03, L - 0.03, screen_mat, 0, -0.008, L / 2, rot=(radians(90), 0, 0), parent=lid)
    return g
laptop('laptop_thinkpad', 0.33, 0.23, BLACK, DX - 0.16, DY - 0.17, DZ + 0.025, -0.05, 1.85, SCREEN_LAP)
laptop('laptop_hp', 0.34, 0.24, SILVER, DX - DW / 2 - 0.24, DY - 0.2, DZ - 0.08, -0.62, 1.78, SCREEN_SIDE)

# ---------- desk clutter (from the photos) ----------
TOP = DZ + 0.0175
box('mousepad_red', 0.24, 0.2, 0.004, RED, DX + 0.3, DY - 0.16, TOP + 0.002, rot=(0, 0, 0.08), bevel=0.003)
box('mousepad_stripe', 0.04, 0.15, 0.005, PAPER, DX + 0.245, DY - 0.16, TOP + 0.004, rot=(0, 0, 0.08), bevel=0)
sphere('mouse', 0.046, BLACK, DX + 0.31, DY - 0.16, TOP + 0.04, scale=(0.7, 1.15, 0.85))
pup = group('notebook_puppies', DX + 0.13, DY - 0.24, TOP, rz=-0.1)
box('pup_pages', 0.11, 0.15, 0.018, PAPER, 0, 0, 0.009, bevel=0.004, parent=pup)
for i, (m, px, py) in enumerate(((TEAL, -0.026, 0.036), (YELLOW, 0.026, 0.036), (RED, -0.026, -0.036), (NAVY, 0.026, -0.036))):
    box(f'pup_panel_{i+1}', 0.05, 0.068, 0.002, m, px, py, 0.019, bevel=0, parent=pup)
for i in range(9):
    torus(f'pup_spiral_{i+1}', 0.006, 0.0012, STEEL, -0.048 + i * 0.012, 0.077, 0.014, rot=(0, radians(90), 0), parent=pup)
tn = group('notebook_teal', DX + 0.62, DY - 0.15, TOP, rz=0.1)
box('teal_nb_pages', 0.2, 0.27, 0.022, PAPER, 0, 0, 0.011, bevel=0.004, parent=tn)
box('teal_nb_cover', 0.19, 0.26, 0.003, TEAL, 0, 0, 0.0235, bevel=0, parent=tn)
for i in range(14):
    torus(f'teal_spiral_{i+1}', 0.008, 0.0012, BLACK, -0.085 + i * 0.013, 0.137, 0.014, rot=(0, radians(90), 0), parent=tn)
duck = group('duck_figure', DX + 0.34, DY + 0.16, TOP, rz=0.4)
for i, (fx, fy) in enumerate(((-0.018, -0.022), (0.018, -0.004))):
    sphere(f'duck_foot_{i+1}', 0.02, ORANGE, fx, fy, 0.006, scale=(1, 1.5, 0.35), parent=duck)
sphere('duck_body', 0.036, WHITE, 0, 0, 0.05, scale=(1, 0.95, 1.1), parent=duck)
sphere('duck_shirt', 0.037, SKY, 0, 0, 0.075, scale=(1.02, 0.98, 0.7), parent=duck)
box('duck_bow', 0.03, 0.012, 0.014, RED, 0, -0.03, 0.09, bevel=0.003, parent=duck)
sphere('duck_head', 0.03, WHITE, 0, -0.008, 0.128, parent=duck)
sphere('duck_bill', 0.02, ORANGE, 0, -0.038, 0.12, scale=(1.1, 1.4, 0.5), parent=duck)
cyl('duck_hat', 0.026, 0.016, NAVY, 0, -0.002, 0.155, r2=0.03, rot=(-0.2, 0, 0), verts=18, parent=duck)
for i, sg in enumerate((-1, 1)):
    cyl(f'duck_arm_{i+1}', 0.008, 0.046, SKY, sg * 0.038, -0.006, 0.075, rot=(0, -sg * 1.2, 0), verts=10, bevel=0, parent=duck)
hp = group('headphones', DX + 0.52, DY + 0.1, TOP, rz=-0.5)
torus('headphone_band', 0.075, 0.009, NAVY, 0, 0, 0.02, parent=hp)
for i, (cx, cy) in enumerate(((-0.07, -0.03), (0.07, 0.03))):
    cyl(f'headphone_cup_{i+1}', 0.038, 0.03, NAVY, cx, cy, 0.018, rot=(0, radians(90), 0), verts=24, parent=hp)
    torus(f'headphone_pad_{i+1}', 0.026, 0.011, SKY, cx + (0.016 if i == 0 else -0.016), cy, 0.018, rot=(0, radians(90), 0), parent=hp)
box('cards_box', 0.065, 0.09, 0.02, LIME, DX + 0.45, DY + 0.02, TOP + 0.01, rot=(0, 0, -0.35), bevel=0.003)
box('cards_box_band', 0.066, 0.02, 0.021, RED, DX + 0.45, DY + 0.02, TOP + 0.01, rot=(0, 0, -0.35), bevel=0)
ck = group('alarm_clock', DX + 0.7, DY + 0.2, TOP, rz=0.3)
cyl('clock_body', 0.045, 0.035, BLACK, 0, 0, 0.055, rot=(radians(90), 0, 0), verts=28, parent=ck)
cyl('clock_face', 0.037, 0.002, CREAM, 0, -0.0185, 0.055, rot=(radians(90), 0, 0), verts=28, bevel=0, parent=ck)
box('clock_hand_h', 0.003, 0.001, 0.02, BLACK, 0, -0.02, 0.064, bevel=0, parent=ck)
box('clock_hand_m', 0.003, 0.001, 0.03, BLACK, 0.01, -0.0205, 0.06, rot=(0, 1.2, 0), bevel=0, parent=ck)
for i, sg in enumerate((-1, 1)):
    sphere(f'clock_bell_{i+1}', 0.02, BLACK, sg * 0.028, 0, 0.105, parent=ck)
    cyl(f'clock_foot_{i+1}', 0.004, 0.02, CHROME, sg * 0.03, -0.006, 0.01, rot=(0, sg * 0.4, 0), verts=8, bevel=0, parent=ck)
torus('clock_handle', 0.02, 0.003, CHROME, 0, 0, 0.11, rot=(radians(90), 0, 0), parent=ck)
cyl('spray_can', 0.028, 0.15, NAVY, DX + 0.16, DY + 0.12, TOP + 0.075, verts=24)
cyl('spray_cap', 0.026, 0.02, BLACK, DX + 0.16, DY + 0.12, TOP + 0.16, verts=24)
box('bike_light', 0.03, 0.07, 0.02, BLACK, DX + 0.56, DY - 0.02, TOP + 0.01, rot=(0, 0, -0.6), bevel=0.006)
box('bike_light_lens', 0.028, 0.02, 0.012, RED, DX + 0.575, DY - 0.048, TOP + 0.012, rot=(0, 0, -0.6), bevel=0)
cyl('cup_holder', 0.04, 0.09, BLACK, DX - 0.52, DY + 0.08, TOP + 0.045, verts=24)
for i, c in enumerate(('e8bf34', '3fa3a8', 'e2557f', 'f2f1ee')):
    cyl(f'pen_{i+1}', 0.005, 0.15, mat(f'pen_{i+1}', c, 0.5), DX - 0.52 + (i - 1.5) * 0.012, DY + 0.08, TOP + 0.11,
        rot=(0.1 * (i - 1.5), 0.12 * (i - 1.5), 0), verts=8, bevel=0)
box('card_red', 0.1, 0.14, 0.006, RED, DX - 0.02, DY + 0.02, TOP + 0.003, rot=(0, 0, 0.3), bevel=0.003)

# ---------- 3-shade floor lamp with vine ----------
lamp = group('floor_lamp', HW - 0.42, 0.62, 0)
cyl('lamp_base', 0.17, 0.025, BLACK, 0, 0, 0.0125, r2=0.15, verts=32, parent=lamp)
cyl('lamp_pole', 0.017, 2.0, BLACK, 0, 0, 1.0, verts=20, parent=lamp)
for i, (sz, ang, tilt) in enumerate(((1.72, 0.5, 0.95), (1.42, 2.5, 0.8), (1.12, 4.4, 1.0))):
    ex, ey = cos(ang) * 0.17, -sin(ang) * 0.17
    cyl(f'lamp_arm_{i+1}', 0.011, 0.22, BLACK, ex * 0.55, ey * 0.55, sz - 0.02,
        rot=(0, radians(90) - 0.45, -ang), verts=12, bevel=0, parent=lamp)
    cyl(f'lamp_shade_{i+1}', 0.052, 0.2, SHADE, ex, ey, sz - 0.02, r2=0.115,
        rot=(sin(ang) * tilt * 0.5, cos(ang) * tilt * 0.55 + 0.4, 0), verts=32, bevel=0, parent=lamp)
for i in range(26):
    p = i / 25; a = p * 7.5
    sphere(f'vine_leaf_{i+1}', 0.035, LEAF, cos(a) * 0.07, -sin(a) * 0.07, 1.92 - p * 0.95,
           scale=(1, 0.7, 0.2), parent=lamp)

# ---------- mesh office chair ----------
ch = group('chair', 0.5, 0.28, 0, rz=0.35)
for i in range(5):
    a = i / 5 * pi * 2 + 0.5
    box(f'chair_base_arm_{i+1}', 0.32, 0.06, 0.045, BLACK, cos(a) * 0.16, sin(a) * 0.16, 0.085, rot=(0, 0, a), bevel=0.016, parent=ch)
    torus(f'chair_caster_{i+1}', 0.027, 0.013, BLACK, cos(a) * 0.31, sin(a) * 0.31, 0.042, rot=(radians(90), 0, a), parent=ch)
    cyl(f'chair_caster_fork_{i+1}', 0.011, 0.05, BLACK, cos(a) * 0.31, sin(a) * 0.31, 0.086, verts=12, bevel=0, parent=ch)
cyl('chair_hub', 0.08, 0.055, BLACK, 0, 0, 0.1, r2=0.06, verts=24, parent=ch)
cyl('chair_gas_lift', 0.026, 0.26, STEEL, 0, 0, 0.26, verts=20, parent=ch)
cyl('chair_lift_sleeve', 0.046, 0.13, BLACK, 0, 0, 0.19, r2=0.042, verts=20, parent=ch)
box('chair_tilt_housing', 0.16, 0.2, 0.06, BLACK, 0, -0.01, 0.4, bevel=0.01, parent=ch)
box('chair_seat_pan', 0.48, 0.46, 0.055, BLACK, 0, -0.01, 0.46, bevel=0.024, parent=ch)
box('chair_seat_cushion', 0.44, 0.42, 0.055, BLACK, 0, -0.015, 0.5, bevel=0.026, parent=ch)
bk = group('chair_backrest', 0, 0.2, 0.5, parent=ch); bk.rotation_euler = (0.13, 0, 0)
box('chair_back_frame_l', 0.035, 0.05, 0.6, BLACK, -0.21, 0, 0.32, bevel=0.012, parent=bk)
box('chair_back_frame_r', 0.035, 0.05, 0.6, BLACK, 0.21, 0, 0.32, bevel=0.012, parent=bk)
box('chair_back_frame_top', 0.46, 0.05, 0.05, BLACK, 0, 0, 0.61, bevel=0.016, parent=bk)
box('chair_back_frame_bottom', 0.42, 0.05, 0.04, BLACK, 0, 0, 0.05, bevel=0.014, parent=bk)
plane('chair_back_mesh', 0.4, 0.55, MESH, 0, -0.006, 0.33, rot=(radians(90), 0, 0), parent=bk)
box('chair_lumbar', 0.3, 0.05, 0.07, BLACK, 0, -0.03, 0.12, bevel=0.018, parent=bk)
box('chair_back_support', 0.09, 0.06, 0.22, BLACK, 0, -0.03, -0.07, bevel=0.018, parent=bk)
for i, sg in enumerate((-1, 1)):
    box(f'chair_arm_post_{i+1}', 0.04, 0.05, 0.2, BLACK, sg * 0.25, 0.04, 0.58, rot=(0, -sg * 0.06, 0), bevel=0.014, parent=ch)
    box(f'chair_arm_pad_{i+1}', 0.075, 0.24, 0.03, BLACK, sg * 0.27, 0, 0.69, bevel=0.012, parent=ch)

# ---------- loft bed (white tube frame, grey fabric guard) ----------
bed = group('loft_bed', -HW + 0.62, 0.1, 0)
BW, BL, BH, GH = 0.95, 2.0, 1.45, 0.5
for i, (px, py) in enumerate(((-BW / 2, -BL / 2), (BW / 2, -BL / 2), (-BW / 2, BL / 2), (BW / 2, BL / 2))):
    cyl(f'bed_post_{i+1}', 0.024, BH + GH + 0.06, FRAME, px, py, (BH + GH + 0.06) / 2, verts=16, bevel=0, parent=bed)
box('bed_frame_side_l', 0.05, BL, 0.07, FRAME, -BW / 2, 0, BH, bevel=0.012, parent=bed)
box('bed_frame_side_r', 0.05, BL, 0.07, FRAME, BW / 2, 0, BH, bevel=0.012, parent=bed)
box('bed_frame_end_1', BW, 0.05, 0.07, FRAME, 0, -BL / 2, BH, bevel=0.012, parent=bed)
box('bed_frame_end_2', BW, 0.05, 0.07, FRAME, 0, BL / 2, BH, bevel=0.012, parent=bed)
for i in range(14):
    box(f'bed_slat_{i+1}', BW - 0.06, 0.06, 0.018, SLAT, 0, -BL / 2 + 0.1 + i * (BL - 0.2) / 13, BH - 0.01, bevel=0.003, parent=bed)
box('bed_mattress', BW - 0.1, BL - 0.12, 0.12, PAPER, 0, 0, BH + 0.09, bevel=0.04, parent=bed)
box('bed_duvet', BW - 0.12, 1.2, 0.08, LIME, 0, -0.25, BH + 0.18, bevel=0.04, parent=bed)
box('bed_rail_side_r', 0.03, BL, 0.03, FRAME, BW / 2, 0, BH + GH, bevel=0.012, parent=bed)
box('bed_rail_side_l', 0.03, BL, 0.03, FRAME, -BW / 2, 0, BH + GH, bevel=0.012, parent=bed)
box('bed_rail_end_1', BW, 0.03, 0.03, FRAME, 0, -BL / 2, BH + GH, bevel=0.012, parent=bed)
box('bed_rail_end_2', BW, 0.03, 0.03, FRAME, 0, BL / 2, BH + GH, bevel=0.012, parent=bed)
box('bed_guard_front_1', 0.02, BL / 2 - 0.05, GH - 0.06, FABRIC, BW / 2 + 0.025, BL / 4, BH + GH / 2, bevel=0.008, parent=bed)
box('bed_guard_front_2', 0.02, BL / 2 - 0.05, GH - 0.06, FABRIC, BW / 2 + 0.025, -BL / 4, BH + GH / 2, bevel=0.008, parent=bed)
box('bed_guard_end_1', BW - 0.04, 0.02, GH - 0.06, FABRIC, 0, BL / 2 + 0.025, BH + GH / 2, bevel=0.008, parent=bed)
box('bed_guard_end_2', BW - 0.04, 0.02, GH - 0.06, FABRIC, 0, -BL / 2 - 0.025, BH + GH / 2, bevel=0.008, parent=bed)
for i, py in enumerate((BL / 2 + 0.01, -BL / 2 - 0.01, 0)):
    box(f'bed_trim_top_{i+1}', 0.03, 0.05, 0.02, YELLOW, BW / 2 + 0.03, py, BH + GH - 0.04, bevel=0.003, parent=bed)
    box(f'bed_trim_bottom_{i+1}', 0.03, 0.05, 0.02, YELLOW, BW / 2 + 0.03, py, BH + 0.06, bevel=0.003, parent=bed)
box('bed_pegboard', BW - 0.06, 0.015, 0.55, PEG, 0, BL / 2 - 0.03, 0.95, bevel=0.004, parent=bed)
box('bed_pegboard_shelf', BW - 0.1, 0.12, 0.02, FRAME, 0, BL / 2 - 0.09, 0.68, bevel=0.005, parent=bed)
box('bed_pegboard_cup', 0.06, 0.06, 0.09, FRAME, -0.3, BL / 2 - 0.07, 1.02, bevel=0.02, parent=bed)
lad = group('bed_ladder', 0.1, -(BL / 2 + 0.05), 0, parent=bed); lad.rotation_euler = (-0.17, 0, 0)
cyl('ladder_rail_1', 0.018, 1.95, FRAME, -0.2, 0, 0.975, verts=14, bevel=0, parent=lad)
cyl('ladder_rail_2', 0.018, 1.95, FRAME, 0.2, 0, 0.975, verts=14, bevel=0, parent=lad)
for i in range(6):
    cyl(f'ladder_step_{i+1}', 0.015, 0.4, FRAME, 0, 0, 0.25 + i * 0.29, rot=(0, radians(90), 0), verts=12, bevel=0, parent=lad)
box('clothes_jacket', 0.36, 0.06, 0.55, BLACK, 0.1, -(BL / 2 + 0.08), BH + 0.25, rot=(-0.17, 0, 0), bevel=0.03, parent=bed)
box('clothes_khaki', 0.2, 0.05, 0.42, CREAM, 0.25, -(BL / 2 + 0.12), BH + 0.12, rot=(-0.17, 0, 0), bevel=0.025, parent=bed)
box('clothes_towel', 0.05, 0.22, 0.4, WHITE, BW / 2 + 0.04, -0.55, BH - 0.3, bevel=0.02, parent=bed)
box('kids_chair_seat', 0.32, 0.3, 0.03, TEAL, 0.05, 0.55, 0.36, bevel=0.014, parent=bed)
box('kids_chair_back', 0.3, 0.03, 0.3, TEAL, 0.05, 0.7, 0.53, rot=(0.15, 0, 0), bevel=0.014, parent=bed)
cyl('kids_chair_post', 0.02, 0.3, WHITE, 0.05, 0.55, 0.19, verts=14, bevel=0, parent=bed)
for i in range(4):
    a = i * pi / 2 + pi / 4
    box(f'kids_chair_leg_{i+1}', 0.22, 0.04, 0.025, WHITE, 0.05 + cos(a) * 0.1, 0.55 - sin(a) * 0.1, 0.02, rot=(0, 0, -a), bevel=0.008, parent=bed)
ice = group('ice_cream_plush', -0.28, 0.85, 0.02, parent=bed); ice.rotation_euler = (0, -0.15, 0)
cyl('ice_cone', 0.005, 0.3, CONE, 0, 0, 0.15, r2=0.11, verts=20, bevel=0, parent=ice)
sphere('ice_swirl_1', 0.12, CREAM, 0, 0, 0.33, parent=ice)
sphere('ice_swirl_2', 0.085, CREAM, 0, 0, 0.46, parent=ice)
sphere('ice_swirl_3', 0.05, CREAM, 0.01, 0, 0.54, parent=ice)
box('storage_bin_mint', 0.42, 0.42, 0.36, MINT, 0.05, -0.35, 0.18, bevel=0.02, parent=bed)
box('folded_clothes', 0.3, 0.26, 0.12, FABRIC, 0.05, -0.35, 0.42, bevel=0.03, parent=bed)
box('toy_bin_pink', 0.26, 0.18, 0.14, PINK, -0.25, BL / 2 - 0.12, 0.9, bevel=0.02, parent=bed)
box('toy_bin_blue', 0.28, 0.2, 0.03, SKY, -0.25, BL / 2 - 0.12, 0.985, bevel=0.01, parent=bed)
box('bed_rug', BW + 0.3, 1.3, 0.012, RUG, 0.2, -0.1, 0.006, bevel=0.004, parent=bed)

# ---------- floor extras ----------
rug = cyl('rug', 1.05, 0.014, RUG, 0.25, -0.75, 0.007, verts=48, bevel=0.005)
rug.scale = (1.25, 0.95, 1)
bb = group('basketball', DX + 0.55, DY - 0.3, 0)
sphere('basketball_body', 0.12, TEAL, 0, 0, 0.12, parent=bb)
torus('basketball_seam_1', 0.12, 0.006, NAVY, 0, 0, 0.12, parent=bb)
torus('basketball_seam_2', 0.12, 0.006, NAVY, 0, 0, 0.12, rot=(radians(90), 0, 0.6), parent=bb)
torus('basketball_seam_3', 0.12, 0.004, WHITE, 0, 0, 0.12, rot=(0.5, 1.2, 0), parent=bb)
cyl('waste_basket', 0.12, 0.26, TEAL, HW - 0.36, 0.06, 0.13, r2=0.15, verts=28)
box('lego_bin', 0.3, 0.2, 0.16, YELLOW, HW - 0.3, -0.95, 0.62, bevel=0.02)
box('step_stool_top', 0.3, 0.2, 0.05, SKY, -0.5, -1.42, 0.24, bevel=0.02)
for i, sg in enumerate((-1, 1)):
    box(f'step_stool_leg_{i+1}', 0.06, 0.18, 0.24, PINK, -0.5 + sg * 0.1, -1.42, 0.12, bevel=0.02)
box('backpack', 0.3, 0.2, 0.4, BLACK, -0.95, -1.25, 0.2, rot=(0, 0, -0.4), bevel=0.06, seg=4)

# ---------- lights ----------
def light(name, kind, x, y, z, energy, color=(1, 1, 1), rot=(0, 0, 0), size=1.0, size_y=None):
    bpy.ops.object.light_add(type=kind, location=(x, y, z), rotation=rot)
    l = bpy.context.active_object; l.name = name
    l.data.energy = energy; l.data.color = color
    if kind == 'AREA':
        l.data.size = size
        if size_y: l.data.shape = 'RECTANGLE'; l.data.size_y = size_y
    return l
light('window_light', 'AREA', HW - 0.25, -0.2, 1.42, 120, srgb('fff1dc'), rot=(0, radians(90), 0), size=1.7, size_y=2.4)
light('ceiling_fill', 'AREA', 0.2, 0, 2.45, 40, srgb('f5f3ee'), size=3.0)
sun = light('sun', 'SUN', 3, -1.5, 3, 0.7, srgb('ffe9c4'))
sun.rotation_euler = (Vector((-1, 0.45, -0.7))).to_track_quat('-Z', 'Y').to_euler()
w = sc.world or bpy.data.worlds.new('World'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (*srgb('d9d6d0'), 1); bg.inputs['Strength'].default_value = 0.2
sc.view_settings.view_transform = 'Standard'  # preview what the bake will actually store

# ---------- camera ----------
bpy.ops.object.camera_add(location=(2.0, -4.8, 2.9))
cam = bpy.context.active_object; cam.name = 'preview_camera'
cam.rotation_euler = (Vector((0.1, 0.3, 0.9)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 30; sc.camera = cam
sc.cycles.samples = 128; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000

print('Room built:', len([o for o in bpy.data.objects if o.type == 'MESH']), 'meshes')
