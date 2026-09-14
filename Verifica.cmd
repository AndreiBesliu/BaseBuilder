@echo off
setlocal
title Kinstead — verificare

REM ---------------------------------------------------------------------------
REM  Poarta proiectului, la dublu-click.
REM
REM  Ruleaza exact ce ruleaza si CI-ul la fiecare push: disciplina de determinism,
REM  typecheck pe ambele configuratii, toate testele, auto-testul programului de
REM  verdict, si verificarea ca cifrele din bench\GATE.md corespund codului.
REM ---------------------------------------------------------------------------

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js nu e instalat, sau nu e in PATH. https://nodejs.org
  pause
  exit /b 1
)

call npm run check
set REZULTAT=%ERRORLEVEL%

echo.
if %REZULTAT%==0 (
  echo   ===============================================================
  echo    TOTUL E VERDE.
  echo   ===============================================================
) else (
  echo   ===============================================================
  echo    CEVA A PICAT. Mesajul de mai sus spune ce si unde.
  echo   ===============================================================
)
echo.
pause
endlocal
