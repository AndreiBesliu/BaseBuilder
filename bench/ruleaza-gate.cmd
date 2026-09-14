@echo off
REM ---------------------------------------------------------------------------
REM  Rularea gate-ului de motor (D1). Protocolul: bench\GATE.md
REM
REM  DE CE E UN SCRIPT SI NU o comanda rulata de Claude: intr-o fereastra ascunsa
REM  sau nefocalizata, `requestAnimationFrame` nu e apelat DELOC — bucla nu
REM  incetineste, se opreste. Masuratoarea cere o fereastra reala, vizibila, pe
REM  care o deschide un om. Sonda marcheaza singura rularea INVALIDA daca nu e.
REM
REM  Inainte de rulare, verificat VIZUAL, nu presupus:
REM    - in priza, Windows pe "Best performance"
REM    - NVIDIA Control Panel -> Prefer maximum performance pe chrome.exe
REM    - un singur monitor, refresh FIX, VRR/G-Sync OFF
REM    - Discord / OBS / GeForce Experience / Steam inchise
REM    - DevTools INCHIS
REM    - sub 5%% CPU in Task Manager inainte de start
REM
REM  Folosire:  bench\ruleaza-gate.cmd [scenariu]
REM  Scenarii:  bisect (implicit) ^| fortress ^| dig ^| traverse
REM ---------------------------------------------------------------------------

setlocal
set SCENARIU=%1
if "%SCENARIU%"=="" set SCENARIU=bisect

set D1B=
if "%2"=="d1b" set D1B=^&d1b=1

if "%SCENARIU%"=="bisect" (
  set QUERY=?bisect=1^&ballast=1^&warmup=300%D1B%
) else (
  set QUERY=?scenario=%SCENARIU%^&ballast=1^&warmup=300^&frames=3600%D1B%
)

echo.
echo  Construiesc build-ul de PRODUCTIE (dev server-ul invalideaza rularea)...
call npm --prefix "%~dp0.." run viewer:build
if errorlevel 1 goto :eof

echo.
echo  Pornesc serverul de preview pe 4173...
start "kinstead-preview" /min cmd /c "npm --prefix ""%~dp0.."" run viewer:preview"

REM  Profil nou de Chrome: fara extensii, fara istoric, fara nimic din ce ai tu instalat.
REM  --enable-webgl-developer-extensions deblocheaza EXT_disjoint_timer_query_webgl2,
REM  dezactivata implicit din motive Spectre. Fara ea, atribuirea CPU/GPU ramene grosiera.
echo.
echo  Deschid Chrome pe profil curat. NU minimiza fereastra si NU schimba tabul.
echo  Rularea dureaza ~60 de secunde si descarca singura un fisier .json la final.
echo.
timeout /t 4 /nobreak >nul
start "" chrome.exe --user-data-dir=%TEMP%\kin-bench --disable-extensions --enable-webgl-developer-extensions --new-window "http://localhost:4173/%QUERY%"

endlocal
