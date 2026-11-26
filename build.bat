@echo off
setlocal
cd /d "%~dp0"

set "BUN_EXE="

for /f "delims=" %%I in ('where bun.exe 2^>nul') do (
	set "BUN_EXE=%%I"
	goto :found_bun
)

if exist "%USERPROFILE%\.bun\bin\bun.exe" (
	set "BUN_EXE=%USERPROFILE%\.bun\bin\bun.exe"
	goto :found_bun
)

echo ERROR: bun.exe was not found. Install Bun or add it to PATH.
exit /b 1

:found_bun
if not exist "js\src\script.ts" (
	echo ERROR: js\src\script.ts was not found.
	exit /b 1
)

if not exist "js\src\styles.css" (
	echo ERROR: js\src\styles.css was not found.
	exit /b 1
)

echo Building readable browser script...
"%BUN_EXE%" build "js\src\script.ts" --outfile=src\script.js --target browser --format iife
if errorlevel 1 (
	echo ERROR: Bun script build failed.
	exit /b 1
)

echo Minifying stylesheet...
"%BUN_EXE%" build "js\src\styles.css" --outfile=src\styles.css --minify
if errorlevel 1 (
	echo ERROR: Bun stylesheet build failed.
	exit /b 1
)

if not exist "src\script.js" (
	echo ERROR: Build finished without creating src\script.js.
	exit /b 1
)

if not exist "src\styles.css" (
	echo ERROR: Build finished without creating src\styles.css.
	exit /b 1
)

echo Done: src\script.js and src\styles.css are ready next to the HTML files.
exit /b 0
