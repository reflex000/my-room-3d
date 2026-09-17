# Step 3 — UV-unwrap, bake lighting into TWO textures (shell + props), save next to the .blend
# Scripting tab -> + New -> paste -> Run Script. 15-45 min on CPU. Blender freezes while baking — normal.
import bpy, os
from math import radians

SAMPLES = 64          # quick pass. Final: 256 and sizes 2048 / 4096 (run overnight)
GROUPS = {
    # name        : (texture size, name-match test)
    'room_shell': (1024, lambda n: n.startswith(('floor', 'wall_', 'baseboard', 'door', 'blind_rail', 'window_sill', 'light_switch', 'thermostat', 'outlet', 'rug', 'bed_rug'))),
    'room_props': (2048, lambda n: True),   # everything else
}
KEEP_SEPARATE = {'screen_main', 'screen_side', 'screen_laptop', 'window_blinds'}

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
if not bpy.data.filepath:
    raise Exception('Save the .blend first (File > Save As), then run again.')
out_dir = os.path.dirname(bpy.data.filepath)

def deselect(): bpy.ops.object.select_all(action='DESELECT')
if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')

# 1. free meshes from parent empties (keep world position), apply modifiers
meshes = [o for o in sc.objects if o.type == 'MESH']
deselect()
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.convert(target='MESH')
for o in [o for o in sc.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o)

# 2. bucket objects into groups and join each
remaining = [o for o in sc.objects if o.type == 'MESH' and o.name not in KEEP_SEPARATE]
joined = {}
for gname, (size, test) in GROUPS.items():
    members = [o for o in remaining if test(o.name)]
    remaining = [o for o in remaining if o not in members]
    if not members: continue
    deselect()
    for o in members: o.select_set(True)
    bpy.context.view_layer.objects.active = members[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = gname; obj.data.name = gname
    joined[gname] = (obj, size)

# 3. bake settings (shared)
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False
try: sc.cycles.use_denoising_bake = False
except Exception: pass
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.05
b = sc.render.bake
b.use_pass_direct = True; b.use_pass_indirect = True; b.use_pass_color = True
b.margin = 8; b.use_selected_to_active = False; b.use_clear = True

def make_baked_material(name, img):
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

for gname, (obj, size) in joined.items():
    # unwrap
    deselect(); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.0012, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # target image
    img_name = gname + '_bake'
    img = bpy.data.images.get(img_name) or bpy.data.images.new(img_name, size, size)
    if img.size[0] != size: img.scale(size, size)
    img.colorspace_settings.name = 'sRGB'
    for slot in obj.material_slots:
        m = slot.material
        if not m: continue
        m.use_nodes = True
        nt = m.node_tree
        node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE_TARGET'; node.image = img; node.location = (-600, 400)
        nt.nodes.active = node
    print('Baking', gname, size, '...')
    bpy.ops.object.bake(type='COMBINED')
    img.filepath_raw = os.path.join(out_dir, img_name + '.png')
    img.file_format = 'PNG'
    img.save()
    print('Saved', img.filepath_raw)
    obj.data.materials.clear()
    obj.data.materials.append(make_baked_material(gname + '_baked', img))

# lights now live in the textures
for o in sc.objects:
    if o.type == 'LIGHT': o.hide_render = True; o.hide_viewport = True

bpy.ops.wm.save_mainfile()
print('DONE — both bakes complete.')
