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
REM      (si pe electron.exe, daca rulezi gazda Electron)
REM    - un singur monitor, refresh FIX, VRR/G-Sync OFF
REM    - Discord / OBS / GeForce Experience / Steam inchise
REM    - DevTools INCHIS
REM    - sub 5%% CPU in Task Manager inainte de start
REM
REM  Folosire:  bench\ruleaza-gate.cmd [scenariu] [d1b] [electron ^| electron-curat]
REM  Scenarii:  bisect (implicit) ^| fortress ^| dig ^| traverse
REM  Gazde:     (nimic) = Chrome pe profil curat, ca pana acum
REM             electron       = Electron cu flagurile de LIVRARE (--in-process-gpu)
REM             electron-curat = Electron FARA flagul de livrare — ablatia care separa
REM                              costul gazdei de costul flagului (GATE.md §12, golul 3)
REM  Ambele gazde deschid fereastra la 1600x900, ca `canvasPx` din JSON sa fie
REM  acelasi si comparatia sa fie pe gazda, nu pe numarul de pixeli.
REM ---------------------------------------------------------------------------

setlocal
set SCENARIU=%1
set D1B=
set GAZDA=chrome
for %%a in (%*) do (
  if /i "%%a"=="d1b" set D1B=1
  if /i "%%a"=="electron" set GAZDA=electron
  if /i "%%a"=="electron-curat" set GAZDA=electron-curat
)
if "%SCENARIU%"=="" set SCENARIU=bisect
if /i "%SCENARIU%"=="d1b" set SCENARIU=bisect
if /i "%SCENARIU%"=="electron" set SCENARIU=bisect
if /i "%SCENARIU%"=="electron-curat" set SCENARIU=bisect

set EXTRA=
if "%D1B%"=="1" set EXTRA=^&d1b=1

if "%SCENARIU%"=="bisect" (
  set QUERY=?bisect=1^&ballast=1^&warmup=300%EXTRA%
) else (
  set QUERY=?scenario=%SCENARIU%^&ballast=1^&warmup=300^&frames=3600%EXTRA%
)

echo.
echo  Construiesc build-ul de PRODUCTIE (dev server-ul invalideaza rularea)...
call npm --prefix "%~dp0.." run viewer:build
if errorlevel 1 goto :eof

echo.
echo  Pornesc serverul de preview pe 4173...
start "kinstead-preview" /min cmd /c "npm --prefix ""%~dp0.."" run viewer:preview"
timeout /t 4 /nobreak >nul

if /i "%GAZDA%"=="electron" goto :electron
if /i "%GAZDA%"=="electron-curat" goto :electron

REM  Profil nou de Chrome: fara extensii, fara istoric, fara nimic din ce ai tu instalat.
REM  --enable-webgl-developer-extensions deblocheaza EXT_disjoint_timer_query_webgl2,
REM  dezactivata implicit din motive Spectre. Fara ea, atribuirea CPU/GPU ramane grosiera.
echo.
echo  Deschid Chrome pe profil curat. NU minimiza fereastra si NU schimba tabul.
echo  Rularea dureaza ~60 de secunde si descarca singura un fisier .json la final.
echo.
start "" chrome.exe --user-data-dir=%TEMP%\kin-bench --disable-extensions --enable-webgl-developer-extensions --window-size=1600,900 --new-window "http://localhost:4173/%QUERY%"
goto :sfarsit

:electron
set CURAT=
if /i "%GAZDA%"=="electron-curat" set CURAT=--curat
echo.
echo  Deschid Electron (%GAZDA%). NU minimiza fereastra.
echo  Rularea dureaza ~60 de secunde; JSON-ul se salveaza in Downloads, iar titlul
echo  ferestrei spune unde, la final.
echo.
start "" "%~dp0..\node_modules\.bin\electron.cmd" "%~dp0gate-electron.mjs" %CURAT% "http://localhost:4173/%QUERY%"

:sfarsit
endlocal
