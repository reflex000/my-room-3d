# Step 3 — bake ONE group per run (resume-able). Blender GUI or headless.
#
#   GUI:  set GROUP below, Run Script, wait, Ctrl+S. Repeat for the next group.
#         Order: room_shell -> desk_items -> room_props -> chair
#   Headless HD (overnight):
#         blender -b myroom.blend --python step3_bake.py -- --group room_props --hd
#
# First run also does the one-time prep (parent clear, join into groups, chair pivot) and saves.
# A group whose PNG already exists next to the .blend AND whose object already has the baked material is skipped.
import bpy, os, sys
from math import radians
from mathutils import Matrix, Vector

# ------------------------------------------------------------------ settings
GROUP = 'room_shell'            # <- change per run: room_shell | desk_items | room_props | chair | all
HD = False
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--group' in args: GROUP = args[args.index('--group') + 1]
if '--hd' in args: HD = True

SIZES = {'room_shell': 1024, 'desk_items': 1024, 'room_props': 2048, 'chair': 512}
if HD: SIZES = {'room_shell': 2048, 'desk_items': 2048, 'room_props': 4096, 'chair': 1024}
SAMPLES = 256 if HD else 32
ORDER = ['room_shell', 'desk_items', 'room_props', 'chair']

DESK_ITEMS = ('duck_', 'clock_', 'mouse', 'pup_', 'teal_', 'headphone_', 'cards_', 'spray_', 'bike_light', 'cup_holder', 'pen_',
              'card_red', 'laptop_', 'monitor_', 'desk_top', 'desk_controller', 'desk_drawer', 'desk_side_tray', 'tray_arm')
SHELL = ('floor', 'wall_', 'baseboard', 'door', 'window_frame', 'window_mullion', 'window_sill', 'light_switch', 'thermostat', 'outlet', 'rug', 'bed_rug', 'curtain_rod', 'curtain_finial')
KEEP_SEPARATE = {'screen_main', 'screen_side', 'screen_laptop', 'laptop_hp_screen', 'window_glass', 'led_strip_desk', 'led_strip_bed', 'bed_light_bulb'}
CHAIR_PIVOT, CHAIR_ROT = Vector((0.5, 0.28, 0.0)), -0.35

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
if not bpy.data.filepath:
    raise Exception('Save the .blend first (File > Save As), then run again.')
out_dir = os.path.dirname(bpy.data.filepath)

def deselect(): bpy.ops.object.select_all(action='DESELECT')
if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ one-time prep
def prepped(): return all(bpy.data.objects.get(n) for n in ORDER)

def join(members, name):
    deselect()
    for o in members: o.select_set(True)
    bpy.context.view_layer.objects.active = members[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name; obj.data.name = name
    return obj

if not prepped():
    print('prep: joining scene into bake groups (one time)')
    meshes = [o for o in sc.objects if o.type == 'MESH']
    deselect()
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.convert(target='MESH')
    for o in [o for o in sc.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o)
    remaining = [o for o in sc.objects if o.type == 'MESH' and o.name not in KEEP_SEPARATE]
    def take(test):
        global remaining
        got = [o for o in remaining if test(o.name)]
        remaining = [o for o in remaining if o not in got]
        return got
    chair = join(take(lambda n: n.startswith('chair_')), 'chair')
    sc.cursor.location = CHAIR_PIVOT
    deselect(); chair.select_set(True); bpy.context.view_layer.objects.active = chair
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    chair.data.transform(Matrix.Rotation(-CHAIR_ROT, 4, 'Z'))
    chair.rotation_euler = (0, 0, CHAIR_ROT)
    join(take(lambda n: n.startswith(SHELL)), 'room_shell')
    join(take(lambda n: n.startswith(DESK_ITEMS)), 'desk_items')
    join(remaining, 'room_props')
    # unwrap every group now so re-runs never touch UVs again
    for n in ORDER:
        o = bpy.data.objects[n]
        deselect(); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.0012, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.wm.save_mainfile()
    print('prep done + saved')

# ------------------------------------------------------------------ bake settings (fast on CPU)
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = HD
try: sc.cycles.use_denoising_bake = HD
except Exception: pass
sc.cycles.use_adaptive_sampling = False
sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 1
sc.cycles.transmission_bounces = 1; sc.cycles.transparent_max_bounces = 2
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
b = sc.render.bake
b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = True
b.margin = 8; b.use_selected_to_active = False; b.use_clear = True

def baked_material(name, img):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.location = (-400, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); bsdf.location = (0, 0)
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    for key in ('Emission Color', 'Emission'):
        if key in bsdf.inputs: nt.links.new(tex.outputs['Color'], bsdf.inputs[key]); break
    bsdf.inputs['Emission Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (300, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m

def already_baked(gname):
    obj = bpy.data.objects[gname]
    png = os.path.join(out_dir, gname + '_bake.png')
    return os.path.exists(png) and len(obj.material_slots) == 1 and obj.material_slots[0].material and obj.material_slots[0].material.name == gname + '_baked'

def bake(gname):
    obj = bpy.data.objects[gname]; size = SIZES[gname]
    if already_baked(gname) and not HD:
        print('skip', gname, '(already baked)'); return
    img_name = gname + '_bake'
    img = bpy.data.images.get(img_name) or bpy.data.images.new(img_name, size, size)
    if img.size[0] != size: img.scale(size, size)
    img.colorspace_settings.name = 'sRGB'
    if already_baked(gname):   # HD re-bake of a finished group: bake from the baked emission material works, but original materials are better
        print('note: re-baking', gname, 'from its baked material (HD pass)')
    for slot in obj.material_slots:
        m = slot.material
        if not m: continue
        m.use_nodes = True
        nt = m.node_tree
        node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE_TARGET'; node.image = img; node.location = (-600, 400)
        nt.nodes.active = node
    chair = bpy.data.objects['chair']
    chair.hide_render = (gname != 'chair')      # no painted chair shadow on the floor
    deselect(); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    print('Baking', gname, size, 'samples', SAMPLES, '...')
    bpy.ops.object.bake(type='COMBINED')
    chair.hide_render = False
    img.filepath_raw = os.path.join(out_dir, img_name + '.png')
    img.file_format = 'PNG'
    img.save()
    obj.data.materials.clear()
    obj.data.materials.append(baked_material(gname + '_baked', img))
    bpy.ops.wm.save_mainfile()
    print('Saved', img.filepath_raw, '+ .blend')

for g in (ORDER if GROUP == 'all' else [GROUP]):
    bake(g)

if all(already_baked(g) for g in ORDER):
    for o in sc.objects:
        if o.type == 'LIGHT': o.hide_render = True; o.hide_viewport = True
    bpy.ops.wm.save_mainfile()
    print('ALL FOUR GROUPS BAKED — run step4_export.py')
else:
    print('DONE:', GROUP, '| remaining:', [g for g in ORDER if not already_baked(g)])
