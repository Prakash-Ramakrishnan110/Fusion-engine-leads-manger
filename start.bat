@echo off
title Fusion Engine Technology — 24/7 Client Acquisition Engine
color 0B

echo ======================================================================
echo          FUSION ENGINE TECHNOLOGY — CLIENT ACQUISITION ENGINE
echo ======================================================================
echo.

if not exist node_modules (
    echo [INFO] First time startup detected. Installing dependencies...
    call npm install
    echo.
)

echo [1/3] Starting Express API Server on http://127.0.0.1:3000 ...
start "Fusion Engine API Server" cmd /k "node server.js"

echo [2/3] Starting Dashboard Static Server on http://127.0.0.1:8085 ...
start "Fusion Engine Static Dashboard" cmd /k "node staticServer.js"

timeout /t 2 >nul

echo [3/3] Launching Fusion Engine Dashboard in default browser...
start http://localhost:8085

echo.
echo ======================================================================
echo  Dashboard is running at: http://localhost:8085
echo  Default Login Pin: fusion2026
echo ======================================================================
echo  Press Ctrl+C in the server windows to stop the servers.
echo.
pause
