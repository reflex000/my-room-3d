import bpy, os
out = os.path.join(os.path.dirname(bpy.data.filepath), 'room-v3.glb')
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
    if o.type == 'MESH': o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
    export_apply=True, export_image_format='AUTO', export_yup=True)
print('exported', out)
