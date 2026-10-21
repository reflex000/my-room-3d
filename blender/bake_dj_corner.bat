@echo off
rem Overnight bake of the DJ corner + room extension only. Laptop plugged in, sleep = Never. Close Blender first.
rem Put this .bat and step2c_dj_corner.py in C:\Users\sssid\Project\MyroomBlend\ next to myroom.blend.
cd /d "%~dp0"
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b "%~dp0myroom.blend" --python "%~dp0step2c_dj_corner.py" -- --bake
echo.
echo Finished. Look for dj-corner-v1.glb in this folder.
pause
