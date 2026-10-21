@echo off
rem Overnight HD bake of the desk items only. Keep the laptop plugged in, sleep = Never.
rem Put this .bat and step2b_desk_upgrade.py in C:\Users\sssid\Project\MyroomBlend\ next to myroom.blend. Close Blender first.
cd /d "%~dp0"
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b "%~dp0myroom.blend" --python "%~dp0step2b_desk_upgrade.py" -- --bake
echo.
echo Finished. Look for desk-hd-v3.glb in this folder.
pause
