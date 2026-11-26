import { writeFileSync } from 'fs';
import { runBuild } from './runBuild.js';
import { gzipBuildOutputs } from './gzip.js';

const STATIC_DIR = process.env.STATIC_DIR ?? '/staticfiles';
// Django container waits for this file to mark completion.
const BUILD_MARKER = process.env.BUILD_MARKER ?? `${STATIC_DIR}/.bun-build-complete`;

function markBuildComplete() {
	writeFileSync(BUILD_MARKER, `${new Date().toISOString()}\n`);
}

// Build guides index
buildGuidesIndex(STATIC_DIR);

const buildFiles = null;
const minify = true;
const sourceMap = 'none';
// Initial build
const result = await runBuild(buildFiles, STATIC_DIR, minify, sourceMap);
if (!result.success) {
	process.exit(1);
}

markBuildComplete()
gzipBuildOutputs(result.outputs, STATIC_DIR);
