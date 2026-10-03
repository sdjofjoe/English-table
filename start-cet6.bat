@echo off
rem Start CET-6 monitor local server and open the app
start "" "C:\Users\31151\.workbuddy\binaries\node\versions\22.22.2\node.exe" "%~dp0server.cjs"
timeout /t 1 >nul
start "" http://localhost:8642
echo CET-6 monitor is running at http://localhost:8642
