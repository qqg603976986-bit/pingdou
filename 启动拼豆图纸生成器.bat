@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>nul

rem Usage:
rem 1. Double-click this file to start both backend and frontend.
rem 2. The script automatically switches to the repository root.
rem 3. If port 8000 or 3000 is occupied by another process, the script will free that port.
rem 4. If this project is already running on those ports, the script reuses the running services.
rem 5. After both services are ready, the default browser opens automatically.
rem 6. Close the spawned backend/frontend terminal windows to stop the services.

cd /d "%~dp0"
set "ROOT=%CD%"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"
set "BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%/api/health"
set "FRONTEND_URL=http://127.0.0.1:%FRONTEND_PORT%"
set "PYTHON_EXE=%ROOT%\.venv\Scripts\python.exe"
set "NPM_EXE=npm.cmd"
set "BACKEND_REUSED=0"
set "FRONTEND_REUSED=0"

echo [INFO] Repository root: %ROOT%

if not exist "%BACKEND_DIR%\main.py" (
    echo [ERROR] Backend entry file not found: %BACKEND_DIR%\main.py
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERROR] Frontend package.json not found: %FRONTEND_DIR%\package.json
    exit /b 1
)

if exist "%PYTHON_EXE%" (
    echo [INFO] Using virtual environment Python: %PYTHON_EXE%
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Python was not found. Create .venv or install Python first.
        exit /b 1
    )
    set "PYTHON_EXE=python"
    echo [INFO] Using system Python from PATH.
)

where %NPM_EXE% >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm.cmd was not found. Install Node.js first.
    exit /b 1
)

call :prepare_backend_slot
if errorlevel 1 exit /b 1

call :prepare_frontend_slot
if errorlevel 1 exit /b 1

if "%BACKEND_REUSED%"=="0" (
    echo [INFO] Starting backend service...
    start "PINGDOU_BACKEND" /D "%BACKEND_DIR%" cmd /k ""%PYTHON_EXE%" main.py"
) else (
    echo [INFO] Reusing existing backend service on port %BACKEND_PORT%.
)

if "%FRONTEND_REUSED%"=="0" (
    echo [INFO] Starting frontend service...
    start "PINGDOU_FRONTEND" /D "%FRONTEND_DIR%" cmd /k "set \"NEXT_PUBLIC_API_BASE=http://127.0.0.1:%BACKEND_PORT%\" && %NPM_EXE% run dev -- --port %FRONTEND_PORT%"
) else (
    echo [INFO] Reusing existing frontend service on port %FRONTEND_PORT%.
)

echo [INFO] Waiting for backend health check...
call :wait_for_text "%BACKEND_URL%" "Pingdou API is running" 60
if errorlevel 1 (
    echo [ERROR] Backend did not become ready in time.
    exit /b 1
)

echo [INFO] Waiting for frontend page...
call :wait_for_text "%FRONTEND_URL%" "Popbeads" 120
if errorlevel 1 (
    echo [ERROR] Frontend did not become ready in time.
    exit /b 1
)

echo [INFO] Services are ready. Opening browser...
start "" "%FRONTEND_URL%"
echo [INFO] Startup completed successfully.
exit /b 0

:prepare_backend_slot
call :get_port_pid %BACKEND_PORT%
if not defined PORT_PID exit /b 0

call :url_contains "%BACKEND_URL%" "Pingdou API is running" URL_MATCH
if /I "%URL_MATCH%"=="YES" (
    set "BACKEND_REUSED=1"
    exit /b 0
)

echo [WARN] Port %BACKEND_PORT% is occupied by PID %PORT_PID%. Terminating it...
taskkill /PID %PORT_PID% /T /F >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Failed to free backend port %BACKEND_PORT%.
    exit /b 1
)
timeout /t 1 >nul
exit /b 0

:prepare_frontend_slot
call :get_port_pid %FRONTEND_PORT%
if not defined PORT_PID exit /b 0

call :url_contains "%FRONTEND_URL%" "Popbeads" URL_MATCH
if /I "%URL_MATCH%"=="YES" (
    set "FRONTEND_REUSED=1"
    exit /b 0
)

echo [WARN] Port %FRONTEND_PORT% is occupied by PID %PORT_PID%. Terminating it...
taskkill /PID %PORT_PID% /T /F >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Failed to free frontend port %FRONTEND_PORT%.
    exit /b 1
)
timeout /t 1 >nul
exit /b 0

:get_port_pid
set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr /R /C:":%~1 .*LISTENING"') do (
    if not defined PORT_PID set "PORT_PID=%%P"
)
exit /b 0

:wait_for_text
set "WAIT_RESULT=NO"
for /L %%I in (1,1,%~3) do (
    call :url_contains "%~1" "%~2" WAIT_RESULT
    if /I "!WAIT_RESULT!"=="YES" exit /b 0
    timeout /t 1 >nul
)
exit /b 1

:url_contains
set "%~3=NO"
for /f "usebackq delims=" %%R in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $resp = Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2; if (($resp.Content + '') -like '*%~2*') { 'YES' } else { 'NO' } } catch { 'NO' }"`) do (
    set "%~3=%%R"
)
exit /b 0