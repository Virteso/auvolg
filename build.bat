@echo off
bun build js/src/script.js --production --minify --outfile=src/script.js
exit /b %ERRORLEVEL%
