@echo off
:: QualiApp installer for Windows
:: Double-click this file, or run:  install.bat
:: It downloads offline dependencies and launches the app.

setlocal EnableDelayedExpansion
title QualiApp Installer

echo.
echo  =====================================
echo   QualiApp -- offline installer
echo  =====================================
echo.

set "DIR=%~dp0"
set "VENDOR=%DIR%vendor"
set "FONTS=%VENDOR%\fonts"

:: Create vendor folders
if not exist "%VENDOR%" mkdir "%VENDOR%"
if not exist "%FONTS%"  mkdir "%FONTS%"

echo  Downloading JavaScript libraries...
echo.

call :download "react.production.min.js"     "https://unpkg.com/react@18/umd/react.production.min.js"              "%VENDOR%\react.production.min.js"
call :download "react-dom.production.min.js" "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"       "%VENDOR%\react-dom.production.min.js"
call :download "babel.min.js"                "https://unpkg.com/@babel/standalone/babel.min.js"                    "%VENDOR%\babel.min.js"
call :download "tailwind.min.js"             "https://cdn.tailwindcss.com"                                         "%VENDOR%\tailwind.min.js"

echo.
echo  Downloading fonts...
echo.

if exist "%VENDOR%\fonts.css" (
  echo    [skip] fonts.css -- already downloaded
) else (
  :: Use PowerShell to download fonts (handles Google Fonts CSS + individual WOFF2 files)
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';" ^
    "$url = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&display=swap';" ^
    "$css = (Invoke-WebRequest -Uri $url -UserAgent $ua -UseBasicParsing).Content;" ^
    "$urls = [regex]::Matches($css, 'url\((https://fonts\.gstatic\.com[^)]+)\)') | ForEach-Object { $_.Groups[1].Value };" ^
    "$i = 0;" ^
    "foreach ($fu in $urls) {" ^
    "  $fname = 'font_{0:D3}.woff2' -f $i;" ^
    "  $dest  = '%FONTS%\' + $fname;" ^
    "  if (-not (Test-Path $dest)) { Invoke-WebRequest -Uri $fu -UserAgent $ua -OutFile $dest -UseBasicParsing; Write-Host ('  Downloaded ' + $fname) };" ^
    "  $css = $css -replace [regex]::Escape($fu), ('fonts/' + $fname);" ^
    "  $i++;" ^
    "};" ^
    "[System.IO.File]::WriteAllText('%VENDOR%\fonts.css', $css);" ^
    "Write-Host ('  fonts.css written (' + $i + ' font files)')"
)

echo.
echo  Installation complete!
echo.

:: Detect Python
set "PY_CMD="
where python3 >nul 2>&1 && set "PY_CMD=python3 -m http.server" && goto :launch
where python  >nul 2>&1 && set "PY_CMD=python -m http.server"  && goto :launch
echo  Python not found. Install Python 3 from https://python.org
echo  then re-run this installer to launch the app automatically.
echo.
echo  Alternatively, open index.html via VS Code's Live Server extension.
pause
exit /b 0

:launch
set "PORT=8080"
echo  Starting QualiApp at http://localhost:%PORT%
echo  Close this window to stop the server.
echo.
start "" "http://localhost:%PORT%"
cd /d "%DIR%"
%PY_CMD% %PORT%
pause
exit /b 0

:: ── helper subroutine ──────────────────────────────────────────────────────
:download
set "_label=%~1"
set "_url=%~2"
set "_dest=%~3"
if exist "%_dest%" (
  echo    [skip] %_label% -- already downloaded
  exit /b 0
)
echo    Downloading %_label% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Invoke-WebRequest -Uri '%_url%' -UserAgent 'Mozilla/5.0' -OutFile '%_dest%' -UseBasicParsing"
echo    OK
exit /b 0
