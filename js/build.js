import { writeFileSync } from 'fs';
import { runBuild } from './runBuild.js';
import { gzipBuildOutputs } from './gzip.js';
import { buildHtml } from './html.js';

const STATIC_DIR = process.env.STATIC_DIR ?? '/staticfiles';
const SITE_SRC_DIR = process.env.SITE_SRC_DIR ?? '/site-src';
// Nginx waits for this file before starting.
const BUILD_MARKER = process.env.BUILD_MARKER ?? `${STATIC_DIR}/.bun-build-complete`;

function markBuildComplete() {
	writeFileSync(BUILD_MARKER, `${new Date().toISOString()}\n`);
}

const buildFiles = null;
const minify = true;
const sourceMap = 'none';
// Initial build
const result = await runBuild(buildFiles, STATIC_DIR, minify, sourceMap);
if (!result.success) {
	process.exit(1);
}

await buildHtml(SITE_SRC_DIR, STATIC_DIR);
gzipBuildOutputs(result.outputs, STATIC_DIR);

// Everything, including HTML and .gz sidecars, is ready for nginx.
markBuildComplete();
