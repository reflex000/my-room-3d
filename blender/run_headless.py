# Runs the whole pipeline in background Blender (no UI freeze):
#   blender -b --python run_headless.py -- [--quick]
import bpy, sys, os, runpy
here = os.path.dirname(os.path.abspath(__file__))
blend = os.path.join(here, 'myroom.blend')
bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.wm.save_as_mainfile(filepath=blend)
for step in ('step2_build_room.py', 'step3_bake.py', 'step4_export.py'):
    print('=== running', step)
    runpy.run_path(os.path.join(here, step), run_name='__main__')
    bpy.ops.wm.save_mainfile()
print('=== ALL DONE ->', os.path.join(here, 'room-v3.glb'))
