@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "TARGET=%USERPROFILE%\Downloads\GitHubユーザースクリプトローダー"
set "BASE=https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/extension/github-loader"
set "LOG=%TEMP%\github-loader-setup.log"

echo [%date% %time%] 開始>"%LOG%"

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
  "  if(!(Test-Path $out)){throw ('未作成: '+$file)};" ^
  "  if((Get-Item $out).Length -le 0){throw ('空ファイル: '+$file)};" ^
  "}" >>"%LOG%" 2>&1

if errorlevel 1 goto :ERROR

for %%F in (manifest.json background.js config.json popup.html popup.js) do (
    if not exist "%TARGET%\%%F" goto :ERROR
    for %%S in ("%TARGET%\%%F") do if %%~zS LEQ 0 goto :ERROR
)

echo [%date% %time%] 完了>>"%LOG%"
start "" "%TARGET%"
echo.
echo 本番ローダーの準備が完了しました。
echo 保存先: %TARGET%
echo Chromeで chrome://extensions/ を開いて、このフォルダーを読み込んでください。
pause
exit /b 0

:ERROR
echo [%date% %time%] エラー>>"%LOG%"
echo.
echo 取得に失敗しました。
echo ログ: %LOG%
start "" notepad.exe "%LOG%"
pause
exit /b 1
