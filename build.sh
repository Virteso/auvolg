#!/usr/bin/bash
set -e

bun build js/src/script.ts --outfile=src/script.js --target browser --format iife
bun build js/src/styles.css --outfile=src/styles.css --minify
