import { writeFileSync } from 'fs';
import { runBuild } from './runBuild.js';

const STATIC_DIR = process.env.STATIC_DIR ?? '/staticfiles';
// Django container waits for this file to mark completion.
const BUILD_MARKER = process.env.BUILD_MARKER ?? `${STATIC_DIR}/.bun-build-complete`;
let buildComplete = false;
function markBuildComplete() {
	writeFileSync(BUILD_MARKER, `${new Date().toISOString()}\n`);
	buildComplete = true;
}

const buildFiles = null;
const minify = false;
const sourceMap = 'inline';
let result = await runBuild(buildFiles, STATIC_DIR, minify, sourceMap);
if (result.success) {
	markBuildComplete()
}

// Handle Watch Mode for Development
console.log("[Bun] Watching for file changes in ./src...");
const fs = require('fs');

let timer = null;
fs.watch('./src', { recursive: true }, (eventType, filename) => {
	// fs.watch can fire several events per change; debounce them
	clearTimeout(timer);
	timer = setTimeout(async () => {
		console.log(`File changed (${filename})`);
		// Rebuild everything to avoid stale inlined dependencies.
		result = await runBuild(buildFiles, STATIC_DIR, minify, sourceMap);
		if (result.success && !buildComplete) {
			markBuildComplete()
		}
	}, 50);
});
