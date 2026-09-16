@echo off
rem ===========================================================================
rem  Kinstead - lansator pentru comenzile proiectului.
rem
rem  Doua feluri de pornire:
rem
rem    dublu-click           meniu; dupa fiecare comanda asteapta si revine
rem    kinstead.bat check    ruleaza o singura comanda si INTOARCE codul ei de
rem                          iesire, deci se poate lega in alt script sau in CI
rem
rem  FARA DIACRITICE, intentionat. Consola Windows nu e pe UTF-8 implicit, iar
rem  un .bat scris in UTF-8 si-ar afisa textul stalcit. E aceeasi conventie ca
rem  la comentariile din src/: documentele din radacina au diacritice, codul nu.
rem
rem  "call npm", nu "npm". npm e un .cmd, iar fara "call" scriptul asta s-ar
rem  incheia in locul lui si liniile de dupa n-ar mai rula niciodata.
rem ===========================================================================

setlocal
cd /d "%~dp0"

set "cod=0"
if "%~1"=="" goto :meniu
set "arg=%~1"
goto :dispecer

:meniu
set "dinMeniu=1"
set "goale=0"

:meniuCitire
echo.
echo   KINSTEAD
echo   --------
echo    1  poarta completa      disciplina + typecheck + teste + autotestele portii
echo    2  teste                node --test, FARA typecheck
echo    3  typecheck
echo    4  scenariul de referinta    100.000 de tickuri, 40 de agenti, ~8 secunde
echo    5  scenariu scurt            20.000 de tickuri, doar ca sa vezi ca merge
echo    6  viewer                    in browser; Ctrl+C ca sa-l opresti
echo    7  mutatii                   89 de probe; cere arbore curat, dureaza ~40 min
echo    0  iesire
echo.
set "arg="
set /p "arg=  Alege: "
if defined arg goto :meniuAles
rem Enter gol. Plafonul nu e politete, e o plasa: cand intrarea s-a TERMINAT
rem (lansatorul rulat dintr-un script, cu stdin redirectat), "set /p" nu mai
rem asteapta nimic si lasa variabila goala la nesfarsit. Fara plafon, bucla asta
rem se invarte pana o omoara cineva. Masurat: exact asa s-a intamplat prima data.
set /a goale+=1
if %goale% GEQ 3 goto :meniuGol
goto :meniuCitire

:meniuGol
echo.
echo   Nicio alegere de trei ori la rand. Ies.
set "cod=0"
goto :sfarsit

:meniuAles
set "goale=0"
if "%arg%"=="0" goto :sfarsit
if "%arg%"=="1" set "arg=check"
if "%arg%"=="2" set "arg=test"
if "%arg%"=="3" set "arg=typecheck"
if "%arg%"=="4" set "arg=ref"
if "%arg%"=="5" set "arg=scurt"
if "%arg%"=="6" set "arg=viewer"
if "%arg%"=="7" set "arg=mutatii"

:dispecer
if /i "%arg%"=="check"     goto :check
if /i "%arg%"=="test"      goto :test
if /i "%arg%"=="typecheck" goto :typecheck
if /i "%arg%"=="ref"       goto :ref
if /i "%arg%"=="scurt"     goto :scurt
if /i "%arg%"=="viewer"    goto :viewer
if /i "%arg%"=="mutatii"   goto :mutatii
if /i "%arg%"=="ajutor"    goto :ajutor
if /i "%arg%"=="-h"        goto :ajutor
if /i "%arg%"=="--help"    goto :ajutor
echo.
echo   Nu cunosc "%arg%".
goto :ajutorCuCod

:check
echo.
echo   == poarta completa ==
call npm run check
set "cod=%ERRORLEVEL%"
goto :gata

:test
echo.
echo   == teste ==   typecheck-ul NU e inclus aici; poarta intreaga e "check"
call npm test
set "cod=%ERRORLEVEL%"
goto :gata

:typecheck
echo.
echo   == typecheck ==
call npm run typecheck
set "cod=%ERRORLEVEL%"
goto :gata

:ref
echo.
echo   == scenariul de referinta ==
node src/harness/cli.ts --seed 12345 --ticks 100000 --agents 40
set "cod=%ERRORLEVEL%"
call :hashAsteptat
goto :gata

:scurt
echo.
echo   == scenariu scurt ==   hash-ul de aici NU e cel de referinta
node src/harness/cli.ts --seed 12345 --ticks 20000 --agents 40
set "cod=%ERRORLEVEL%"
goto :gata

:viewer
echo.
echo   == viewer ==   Ctrl+C ca sa-l opresti
call npm run viewer
set "cod=%ERRORLEVEL%"
goto :gata

:mutatii
echo.
echo   == mutatii ==   strica pe rand cate o garantie si verifica daca testul ei
echo                   chiar se inroseste. Cere arborele CURAT: restaurarea se
echo                   face prin git. Toate cele 89 trec de o jumatate de ora.
call npm run mutatii
set "cod=%ERRORLEVEL%"
goto :gata

:ajutor
set "cod=0"
goto :ajutorText
:ajutorCuCod
set "cod=2"
:ajutorText
echo.
echo   kinstead.bat [comanda]
echo.
echo     check       poarta completa: disciplina, typecheck, teste, autotestele portii
echo     test        doar testele, fara typecheck
echo     typecheck   doar tipurile, si pentru viewer
echo     ref         scenariul de referinta, cel din care ies hash-ul si microsecundele
echo     scurt       acelasi scenariu, 20.000 de tickuri
echo     viewer      porneste viewerul in browser
echo     mutatii     cele 89 de probe de mutatie; arbore curat, ~40 de minute
echo.
echo     Fara comanda: meniu.
echo.
echo   O singura suita, sau doar cateva mutatii dintr-una:
echo     npm run mutatii -- --lista
echo     npm run mutatii -- nevoi
echo     npm run mutatii -- nevoi podeaua
echo.
echo   Pentru o rulare cu alti parametri, harness-ul se cheama direct:
echo     npm run run:headless -- --seed 12345 --ticks 5000 --agents 8
echo.
goto :gata

rem Hash-ul asteptat se CITESTE din workflow-ul de CI, nu se scrie aici: o a
rem doua copie a lui s-ar invechi la prima taietura care schimba simularea, si
rem atunci lansatorul ar minti exact cand te uiti la el.
:hashAsteptat
set "asteptat="
for /f "tokens=2 delims==" %%h in ('findstr /c:"EXPECTED=" ".github\workflows\ci.yml" 2^>nul') do set "asteptat=%%h"
if defined asteptat echo   asteptat de CI:   %asteptat%
goto :eof

:gata
if not defined dinMeniu goto :sfarsit
echo.
echo   [cod de iesire %cod%]
pause
goto :meniu

:sfarsit
endlocal & exit /b %cod%
