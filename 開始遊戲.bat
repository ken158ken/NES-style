@echo off
setlocal
set "PAGE=%~dp0index.html"
title Kirby Star (fan game)

rem Build a properly percent-encoded file:// URL (non-ASCII folder names need this for Edge/Chrome app mode).
set "URL="
for /f "usebackq delims=" %%u in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "([uri]('%PAGE%')).AbsoluteUri"`) do set "URL=%%u"
if not defined URL set "URL=file:///%PAGE:\=/%"

rem Prefer Edge / Chrome app mode (no address bar); otherwise use the default browser.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
set "EDGE2=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME2=%LocalAppData%\Google\Chrome\Application\chrome.exe"
set "ARGS=--window-size=1040,940 --user-data-dir=%TEMP%\kirbystar_profile --no-first-run --no-default-browser-check --disable-features=Translate"
if defined KIRBY_DEBUG_PORT set "ARGS=%ARGS% --remote-debugging-port=%KIRBY_DEBUG_PORT%"

if exist "%EDGE%"    ( start "" "%EDGE%"    --app="%URL%" %ARGS% & goto :eof )
if exist "%EDGE2%"   ( start "" "%EDGE2%"   --app="%URL%" %ARGS% & goto :eof )
if exist "%CHROME%"  ( start "" "%CHROME%"  --app="%URL%" %ARGS% & goto :eof )
if exist "%CHROME2%" ( start "" "%CHROME2%" --app="%URL%" %ARGS% & goto :eof )
start "" "%PAGE%"
