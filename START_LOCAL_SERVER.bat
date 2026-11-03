@echo off
title Iretomiwa Sun Investment - Local Server
cd /d "%~dp0"
cls
echo ==============================================================================
echo           STARTING IRETOMIWA SUN INVESTMENT LOCAL SERVER
echo ==============================================================================
echo.
echo Initializing server on http://localhost:8080 ...
echo (Do not close this command window while using the application)
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local_server.ps1"
echo.
echo ==============================================================================
echo Local server has stopped.
echo ==============================================================================
echo.
pause
