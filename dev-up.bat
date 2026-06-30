@echo off
REM ============================================================================
REM  VeldrixAI - local dev environment launcher (Windows)
REM
REM  Starts the full Dockerized dev stack (the same one `make dev-up` builds in
REM  WSL2): Traefik + Postgres + Redis + auth/core/connectors + Next.js UI +
REM  mock-inference + Prometheus/Grafana. The Next.js dev server comes up inside
REM  the veldrix-localdev-ui container.
REM
REM  Usage:
REM    dev-up.bat            Bring the full stack up (default)
REM    dev-up.bat lean       Bring it up without observability (lighter)
REM    dev-up.bat seed       Bring up + seed the dev database
REM    dev-up.bat verify     Run the end-to-end health check
REM    dev-up.bat status     Show container status
REM    dev-up.bat logs       Tail logs (Ctrl+C to stop)
REM    dev-up.bat down       Stop the stack (keeps data volumes)
REM    dev-up.bat reset      Wipe volumes, rebuild, and re-seed
REM
REM  Config (override by setting these env vars before running):
REM    VELDRIX_WSL_DISTRO   default: Ubuntu
REM    VELDRIX_REPO_DIR     default: ~/VeldrixAI   (path inside WSL)
REM    DOCKER_DESKTOP_EXE   default: C:\Program Files\Docker\Docker\Docker Desktop.exe
REM ============================================================================

setlocal enableextensions enabledelayedexpansion

if not defined VELDRIX_WSL_DISTRO set "VELDRIX_WSL_DISTRO=Ubuntu"
if not defined VELDRIX_REPO_DIR   set "VELDRIX_REPO_DIR=~/VeldrixAI"
if not defined DOCKER_DESKTOP_EXE set "DOCKER_DESKTOP_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

if /I "%CMD%"=="up"      goto :do_up
if /I "%CMD%"=="lean"    goto :do_lean
if /I "%CMD%"=="seed"    goto :do_seed
if /I "%CMD%"=="verify"  goto :do_verify
if /I "%CMD%"=="status"  goto :do_status
if /I "%CMD%"=="logs"    goto :do_logs
if /I "%CMD%"=="down"    goto :do_down
if /I "%CMD%"=="reset"   goto :do_reset
echo [veldrix] Unknown command: %CMD%
echo.
goto :usage

REM ---------------------------------------------------------------------------
:do_up
call :ensure_engine || goto :fail
echo [veldrix] Bringing up the full dev stack ^(make dev-up^)...
call :make dev-up || goto :fail
call :show_urls
goto :ok

:do_lean
call :ensure_engine || goto :fail
echo [veldrix] Bringing up the lean dev stack ^(make dev-up-lean^)...
call :make dev-up-lean || goto :fail
call :show_urls
goto :ok

:do_seed
call :ensure_engine || goto :fail
echo [veldrix] Bringing up + seeding...
call :make dev-up || goto :fail
call :make dev-seed || goto :fail
call :show_urls
goto :ok

:do_verify
call :ensure_engine || goto :fail
call :make dev-verify
goto :ok

:do_status
call :ensure_engine || goto :fail
call :make dev-ps
goto :ok

:do_logs
call :ensure_engine || goto :fail
call :make dev-logs
goto :ok

:do_down
echo [veldrix] Stopping the dev stack ^(volumes preserved^)...
call :make dev-down
goto :ok

:do_reset
call :ensure_engine || goto :fail
echo [veldrix] Resetting: wipe volumes, rebuild, re-seed...
call :make dev-reset || goto :fail
call :show_urls
goto :ok

REM ---------------------------------------------------------------------------
REM  :make <target>   run a Makefile dev target inside the WSL repo
REM ---------------------------------------------------------------------------
:make
wsl -d %VELDRIX_WSL_DISTRO% -- bash -lc "cd %VELDRIX_REPO_DIR% && make %*"
exit /b %errorlevel%

REM ---------------------------------------------------------------------------
REM  :ensure_engine   make sure the Docker engine is up (start Desktop if not)
REM                   and reachable from inside WSL.
REM ---------------------------------------------------------------------------
:ensure_engine
echo [veldrix] Checking Docker engine...
docker version >nul 2>&1
if not errorlevel 1 goto :engine_reachable

echo [veldrix] Docker engine not responding - starting Docker Desktop...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>nul | find /I "Docker Desktop.exe" >nul
if errorlevel 1 (
  if exist "%DOCKER_DESKTOP_EXE%" (
    start "" "%DOCKER_DESKTOP_EXE%"
  ) else (
    echo [veldrix] ERROR: Docker Desktop not found at "%DOCKER_DESKTOP_EXE%".
    echo            Set DOCKER_DESKTOP_EXE to the correct path and retry.
    exit /b 1
  )
)

set /a _tries=0
:wait_engine
set /a _tries+=1
docker version >nul 2>&1 && goto :engine_reachable
if !_tries! GEQ 60 (
  echo [veldrix] ERROR: Docker engine did not come up within ~3 minutes.
  exit /b 1
)
echo [veldrix]   waiting for engine... ^(!_tries!/60^)
ping -n 4 127.0.0.1 >nul
goto :wait_engine

:engine_reachable
REM The stack is built/run from inside WSL, so confirm WSL can reach Docker too.
wsl -d %VELDRIX_WSL_DISTRO% -- docker info >nul 2>&1
if errorlevel 1 (
  echo [veldrix] ERROR: Docker is up on Windows but NOT reachable inside WSL ^(%VELDRIX_WSL_DISTRO%^).
  echo            Fix: Docker Desktop ^> Settings ^> Resources ^> WSL Integration ^> enable %VELDRIX_WSL_DISTRO%,
  echo            then Apply ^& Restart.
  exit /b 1
)
echo [veldrix] Docker engine ready.
exit /b 0

REM ---------------------------------------------------------------------------
:show_urls
echo.
echo   ============================================================
echo    VeldrixAI dev stack is up
echo   ------------------------------------------------------------
echo    App         https://dev.veldrixai.ca
echo    API         https://api.dev.veldrixai.ca/health
echo    Grafana     http://localhost:3001
echo    Prometheus  http://localhost:9090
echo    Traefik     http://localhost:8081
echo   ------------------------------------------------------------
echo    Logs: dev-up.bat logs    Verify: dev-up.bat verify
echo    Stop: dev-up.bat down
echo   ============================================================
echo.
exit /b 0

:usage
echo Usage: dev-up.bat [ up ^| lean ^| seed ^| verify ^| status ^| logs ^| down ^| reset ]
endlocal
exit /b 1

:fail
echo [veldrix] Failed. See output above.
endlocal
exit /b 1

:ok
endlocal
exit /b 0
