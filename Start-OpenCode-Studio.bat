@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "Start-OpenCode-Studio.ps1"
