@echo off
REM Overnight HD bake, one group at a time, no GUI. Run from the folder that has myroom.blend + step3_bake.py.
REM Edit BLENDER path if different.
set BLENDER="C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
for %%G in (room_shell desk_items room_props chair) do (
  echo === HD bake %%G ===
  %BLENDER% -b myroom.blend --python step3_bake.py -- --group %%G --hd
)
%BLENDER% -b myroom.blend --python step4_export.py
echo === ALL DONE: room-v3.glb ===
pause
