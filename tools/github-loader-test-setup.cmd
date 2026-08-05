@echo off
chcp 65001 >nul
setlocal

set "TARGET=%USERPROFILE%\Downloads\GitHub自動読込テスト"
set "BASE=https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/extension/github-loader-test"

if not exist "%TARGET%" mkdir "%TARGET%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$files=@('manifest.json','background.js','popup.html','popup.js');" ^
  "foreach($file in $files){Invoke-WebRequest -UseBasicParsing -Uri ('%BASE%/'+$file+'?t='+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -OutFile (Join-Path '%TARGET%' $file)}"

if errorlevel 1 (
  echo.
  echo 取得に失敗しました。
  pause
  exit /b 1
)

echo.
echo 作成完了: %TARGET%
start "" "%TARGET%"
start "" "chrome://extensions"
pause
