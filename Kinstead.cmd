@echo off
setlocal
title Kinstead

REM ---------------------------------------------------------------------------
REM  Dublu-click si merge. Fara comenzi de tastat.
REM
REM  Ce face: verifica Node, instaleaza dependentele daca lipsesc, porneste
REM  serverul si deschide browserul pe el.
REM
REM  Ca sa OPRESTI: inchizi fereastra asta, sau Ctrl+C in ea. Serverul moare
REM  odata cu ea — de aia ruleaza in PRIM-PLAN si nu in fundal.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nu e instalat, sau nu e in PATH.
  echo   Kinstead are nevoie de Node 23 sau mai nou, fiindca ruleaza TypeScript
  echo   direct, fara pas de build.
  echo.
  echo   https://nodejs.org
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set MAJOR=%%v
if %MAJOR% LSS 23 (
  echo.
  echo   Node %MAJOR% e prea vechi. Kinstead cere 23 sau mai nou.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\three" (
  echo.
  echo   Prima pornire: instalez dependentele. Dureaza un minut.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Instalarea a esuat. Incearca `npm install` intr-un terminal, ca sa vezi de ce.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo   Kinstead — viewer de teren
echo   ---------------------------------------------------------------
echo.
echo   drag           roteste           click stanga   sapa un voxel
echo   rotita         zoom              Shift+click    construieste
echo   click dr.+drag panoramare        Q / E / R      nivel de slice
echo.
echo   G   overlay de regiuni — aceeasi culoare inseamna ca se poate
echo       ajunge dintr-o zona in cealalta. Sapa un sant si vezi cum
echo       se rupe componenta.
echo   T   traversare 40 m/s (Shift+T schimba sensul)
echo.
echo   ---------------------------------------------------------------
echo   Se deschide singur in browser. Inchide fereastra asta ca sa opresti.
echo.

REM  Browserul se deschide cu intarziere, ca serverul sa apuce sa raspunda.
REM  Fara asta, prima incarcare da eroare de conexiune si pare ca nu merge.
start "" cmd /c "timeout /t 4 /nobreak >nul & start """" http://localhost:5175"

call npm run viewer

endlocal
