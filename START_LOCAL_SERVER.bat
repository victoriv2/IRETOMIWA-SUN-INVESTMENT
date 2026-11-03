@echo off
title Iretomiwa Sun Investment - Local Server
cd /d "%~dp0"
cls
echo ==============================================================================
echo           STARTING IRETOMIWA SUN INVESTMENT LOCAL SERVER
echo ==============================================================================
echo.
echo Launching local server with Flutterwave IP proxy...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local_server.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server stopped or encountered an error.
    pause
)
