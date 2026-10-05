# Step 4 — export room-v4.glb with compressed textures (WebP, falls back to JPEG) so the file stays small (~4–8 MB instead of 40+ MB of PNG).
import bpy, os
out = os.path.join(os.path.dirname(bpy.data.filepath), 'room-v4.glb')
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
    if o.type == 'MESH': o.select_set(True)
base = dict(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
done = False
for fmt in ('WEBP', 'JPEG'):
    for qkey in ('export_image_quality', 'export_jpeg_quality'):
        try:
            bpy.ops.export_scene.gltf(**base, export_image_format=fmt, **{qkey: 90})
            done = True; print('exported', out, 'textures:', fmt); break
        except (TypeError, RuntimeError) as e:
            last = e
    if done: break
if not done:
    bpy.ops.export_scene.gltf(**base, export_image_format='JPEG')
    print('exported', out, 'textures: JPEG (default quality)')
print('size MB:', round(os.path.getsize(out) / 1e6, 1))
