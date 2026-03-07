@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>nul

rem Usage:
rem 1. Double-click this file to stop the backend and frontend services for this project.
rem 2. The script automatically switches to the repository root.
rem 3. It only stops services that match this project on ports 8000 and 3000.
rem 4. If matching title windows exist, they are also closed.

cd /d "%~dp0"
set "ROOT=%CD%"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"
set "BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%/api/health"
set "FRONTEND_URL=http://127.0.0.1:%FRONTEND_PORT%"
set "STOPPED_ANY=0"

echo [INFO] Repository root: %ROOT%

call :stop_backend
call :stop_frontend
call :close_window_by_title "PINGDOU_BACKEND"
call :close_window_by_title "PINGDOU_FRONTEND"

if "%STOPPED_ANY%"=="1" (
    echo [INFO] Stop completed.
) else (
    echo [INFO] No running Pingdou frontend/backend services were found.
)

exit /b 0

:stop_backend
call :get_port_pid %BACKEND_PORT%
if not defined PORT_PID (
    echo [INFO] Backend port %BACKEND_PORT% is not in use.
    exit /b 0
)

call :url_contains "%BACKEND_URL%" "Pingdou API is running" URL_MATCH
if /I not "%URL_MATCH%"=="YES" (
    echo [INFO] Port %BACKEND_PORT% is occupied, but it does not look like the Pingdou backend. Skipped.
    exit /b 0
)

echo [INFO] Stopping backend PID %PORT_PID% on port %BACKEND_PORT%...
taskkill /PID %PORT_PID% /T /F >nul 2>nul
if errorlevel 1 (
    echo [WARN] Failed to stop backend PID %PORT_PID%.
    exit /b 0
)

set "STOPPED_ANY=1"
timeout /t 1 >nul
exit /b 0

:stop_frontend
call :get_port_pid %FRONTEND_PORT%
if not defined PORT_PID (
    echo [INFO] Frontend port %FRONTEND_PORT% is not in use.
    exit /b 0
)

call :url_contains "%FRONTEND_URL%" "Popbeads" URL_MATCH
if /I not "%URL_MATCH%"=="YES" (
    echo [INFO] Port %FRONTEND_PORT% is occupied, but it does not look like the Pingdou frontend. Skipped.
    exit /b 0
)

echo [INFO] Stopping frontend PID %PORT_PID% on port %FRONTEND_PORT%...
taskkill /PID %PORT_PID% /T /F >nul 2>nul
if errorlevel 1 (
    echo [WARN] Failed to stop frontend PID %PORT_PID%.
    exit /b 0
)

set "STOPPED_ANY=1"
timeout /t 1 >nul
exit /b 0

:close_window_by_title
taskkill /FI "WINDOWTITLE eq %~1" /T /F >nul 2>nul
if not errorlevel 1 set "STOPPED_ANY=1"
exit /b 0

:get_port_pid
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr /R /C:":%~1 .*LISTENING"') do (
    if not defined PORT_PID set "PORT_PID=%%P"
)
exit /b 0

:url_contains
set "%~3=NO"
for /f "usebackq delims=" %%R in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $resp = Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2; if (($resp.Content + '') -like '*%~2*') { 'YES' } else { 'NO' } } catch { 'NO' }"`) do (
    set "%~3=%%R"
)
exit /b 0