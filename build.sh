#!/usr/bin/bash
set -e

bun build js/src/script.js --production --minify --outfile=src/script.js
