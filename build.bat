@echo off
bunx.exe build js/src/script.ts --outfile=src/script.js
exit /b %ERRORLEVEL%
