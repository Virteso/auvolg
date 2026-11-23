import { rmSync, writeFileSync, readFileSync, renameSync } from 'fs';
import { gzipSync } from 'zlib';
import path from 'path';

const GZIP_LEVEL = 9;
// Keep in sync with gzip_min_length in nginx/nginx.conf.
const GZIP_MIN_BYTES = 256;
const COMPRESSIBLE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.json', '.svg', '.xml', '.txt', '.map']);

// Write a <file>.gz sidecar so nginx can serve it directly with gzip_static.
export function gzipSidecar(filePath) {
	const gzPath = `${filePath}.gz`;
	const tmpPath = `${gzPath}.tmp`;
	try {
		const ext = path.extname(filePath).toLowerCase();
		if (!COMPRESSIBLE_EXTENSIONS.has(ext)) return false;

		const content = readFileSync(filePath);
		if (content.length < GZIP_MIN_BYTES) {
			// Drop a stale sidecar if the file has become too small to bother compressing.
			rmSync(gzPath, { force: true });
			return false;
		}

		// Write-then-rename so nginx never serves a partially written .gz file.
		writeFileSync(tmpPath, gzipSync(content, { level: GZIP_LEVEL }));
		renameSync(tmpPath, gzPath);
		return true;
	} catch (error) {
		rmSync(tmpPath, { force: true });
		console.error(`[Bun] Failed to gzip ${filePath}:`, error.message);
		return false;
	}
}

export function gzipBuildOutputs(outputs, outDir) {
	let count = 0;
	for (const output of outputs) {
		const outputPath = path.isAbsolute(output.path)
			? output.path
			: path.resolve(outDir, output.path);
		if (gzipSidecar(outputPath)) count++;
	}
	console.log(`[Bun] Pre-compressed ${count} output file(s) (.gz)`);
}
