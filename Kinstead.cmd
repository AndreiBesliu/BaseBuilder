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
echo   Kinstead
echo   ---------------------------------------------------------------
echo.
echo   Se deschide ecranul de titlu: Joc nou, Incarca, Exploreaza demo-ul.
echo   In joc: F1 = ajutorul (toate tastele), Esc = meniul, Ctrl+S = salveaza.
echo.
echo   V selecteaza   D sapa   C construieste   A anuleaza   K zone
echo   trage cu o unealta = dreptunghi      Q / E / R = nivelul
echo   Spatiu = pauza      1 2 3 = viteza      O = oamenii
echo.
echo   ---------------------------------------------------------------
echo   Se deschide singur in browser. Inchide fereastra asta ca sa opresti.
echo.

REM  Browserul se deschide cu intarziere, ca serverul sa apuce sa raspunda.
REM  Fara asta, prima incarcare da eroare de conexiune si pare ca nu merge.
start "" cmd /c "timeout /t 4 /nobreak >nul & start """" http://localhost:5175"

call npm run viewer

endlocal
