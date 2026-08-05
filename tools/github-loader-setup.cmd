@echo off
setlocal EnableExtensions

set "TARGET=%USERPROFILE%\Downloads\GitHubUserScriptLoader"
set "BASE=https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/extension/github-loader"
set "LOG=%TEMP%\github-loader-setup.log"

echo [%date% %time%] START>"%LOG%"

if not exist "%TARGET%" (
    mkdir "%TARGET%" >>"%LOG%" 2>&1
    if errorlevel 1 goto :ERROR
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$target='%TARGET%';" ^
  "$base='%BASE%';" ^
  "$files=@('manifest.json','background.js','config.json','popup.html','popup.js');" ^
  "foreach($file in $files){" ^
  "  $out=Join-Path $target $file;" ^
  "  $url=$base+'/'+$file+'?t='+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();" ^
  "  Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $url -OutFile $out;" ^
  "  if(!(Test-Path $out)){throw ('Missing file: '+$file)};" ^
  "  if((Get-Item $out).Length -le 0){throw ('Empty file: '+$file)};" ^
  "}" >>"%LOG%" 2>&1

if errorlevel 1 goto :ERROR

for %%F in (manifest.json background.js config.json popup.html popup.js) do (
    if not exist "%TARGET%\%%F" goto :ERROR
    for %%S in ("%TARGET%\%%F") do if %%~zS LEQ 0 goto :ERROR
)

echo [%date% %time%] COMPLETE>>"%LOG%"
start "" "%TARGET%"
echo.
echo Setup completed successfully.
echo Folder: %TARGET%
echo Open chrome://extensions/ in Chrome and load this folder.
pause
exit /b 0

:ERROR
echo [%date% %time%] ERROR>>"%LOG%"
echo.
echo Setup failed.
echo Log: %LOG%
start "" notepad.exe "%LOG%"
pause
exit /b 1
