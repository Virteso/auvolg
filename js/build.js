import { globSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { gzipBuildOutputs } from './gzip.js';

const isProd = process.env.PIPELINE === 'production';

const STATIC_DIR = process.env.STATIC_DIR ?? '/staticfiles';
// Django container waits for this file to mark completion.
const BUILD_MARKER = process.env.BUILD_MARKER ?? `${STATIC_DIR}/.bun-build-complete`;
// Remove build marker if it exists
rmSync(BUILD_MARKER, { force: true });

function markBuildComplete() {
	writeFileSync(BUILD_MARKER, `${new Date().toISOString()}\n`);
}

// Find all JS/TS files in src/ while retaining directory structures
// e.g., src/maps/leaf.js -> staticfiles/maps/leaf.js
function allEntrypoints() {
	return globSync('./src/**/*.{js,ts,css}', {
		ignore: ['**/*.test.js', '**/*.d.ts']
	});
}

async function runTests() {
	console.log("[Bun] Running tests...");
	const result = Bun.spawnSync(['bun', 'test'], {
		cwd: import.meta.dir,
		stdio: ['inherit', 'inherit', 'inherit'],
	});
	if (result.exitCode !== 0) {
		console.error("[Bun] Tests failed, skipping build.");
		if (isProd) process.exit(1);
		return false;
	}
	console.log("[Bun] Tests passed.");
	return true;
}

async function runBuild(changedFile = null) {
	try {
		if (!(await runTests())) return false;
		const entrypoints = changedFile ? [changedFile] : allEntrypoints();
		const result = await Bun.build({
			entrypoints: entrypoints,
			outdir: STATIC_DIR,
			root: './src',			// Preserves subfolder paths relative to src/
			minify: isProd,
			sourcemap: isProd ? 'none' : 'inline',
			naming: '[dir]/[name].[ext]',		// Keeps original folder structure and file names
		});

		if (!result.success) {
			console.error("Build failed:", result.logs);
			return false;
		}

		if (changedFile) {
			console.log(`[Bun] Rebuilt ${path.relative('.', changedFile)}`);
		} else {
			console.log(`[Bun] Successfully built ${entrypoints.length} entrypoints.`);
		}

		markBuildComplete()
		if (isProd) gzipBuildOutputs(result.outputs, STATIC_DIR);
		return true;

	} catch (error) {
		console.error("Detailed error:", error.message);
		console.error("Stack trace:", error.stack);
		return false;
	}
}

// Initial build
if (!(await runBuild()) && isProd) {
	process.exit(1);
}

// Handle Watch Mode for Development
if (!isProd) {
	console.log("[Bun] Watching for file changes in ./src...");
	const fs = require('fs');

	let timer = null;
	fs.watch('./src', { recursive: true }, (eventType, filename) => {
		if (!filename) return;

		// Ignore non-buildable files and files excluded from the entrypoint glob
		if (!/\.(js|ts|css)$/.test(filename)) return;
		if (/\.test\.(js|ts)$|\.d\.ts$/.test(filename)) return;

		// fs.watch can fire several events per change; debounce them
		clearTimeout(timer);
		timer = setTimeout(async () => {
			console.log(`File changed (${filename})`);
			// Entrypoints import shared modules (e.g. map/mapInit.js), so a single
			// file change can affect many bundles. Rebuild everything to avoid
			// stale inlined dependencies.
			await runBuild();
		}, 50);
	});
}
