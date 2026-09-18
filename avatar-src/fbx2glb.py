# Blender CLI: merge all Mixamo FBX clips (downloaded "without skin") onto one armature and export a GLB.
#   blender -b -P fbx2glb.py -- <fbx_dir> <out.glb>
import bpy, sys, os, glob

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
files = sorted(glob.glob(os.path.join(src, '*.fbx')))

bpy.ops.wm.read_factory_settings(use_empty=True)
main = None
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f, ignore_leaf_bones=True, automatic_bone_orientation=False, use_anim=True)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    name = os.path.splitext(os.path.basename(f))[0]
    act = arm.animation_data.action
    act.name = name
    if main is None:
        main = arm
        main.name = 'Armature'
        main.animation_data.action = None
    else:
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
    track = main.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    print('clip', name, 'frames', act.frame_range[:], 'fps', bpy.context.scene.render.fps)

for o in bpy.data.objects:
    o.select_set(o == main)
bpy.context.view_layer.objects.active = main
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
                          export_skins=True, export_apply=False, export_yup=True, export_optimize_animation_size=False)
print('exported', out)
