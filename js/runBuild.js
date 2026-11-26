import { runTests } from './test.js';
import { globSync } from 'fs';
import path from 'path';

export async function runBuild(changedFile = null, outputDir = '/staticfiles', minify = false, sourceMap='none') {
	try {
		if (!(await runTests())) return false;
		const entrypoints = changedFile ? [changedFile] : allEntrypoints();
		const result = await Bun.build({
			entrypoints: entrypoints,
			outdir: outputDir,
			root: './src',			// Preserves subfolder paths relative to src/
			minify: minify,
			sourcemap: sourceMap,
			naming: '[dir]/[name].[ext]',		// Keeps original folder structure and file names
		});

		if (!result.success) {
			console.error("Build failed:", result.logs);
			return result;
		}

		if (changedFile) {
			console.log(`[Bun] Rebuilt ${path.relative('.', changedFile)}`);
		} else {
			console.log(`[Bun] Successfully built ${entrypoints.length} entrypoints.`);
		}
		return result;

	} catch (error) {
		console.error("Detailed error:", error.message);
		console.error("Stack trace:", error.stack);
		return {success: false, logs: [error.message]};
	}
}

// Find all JS/TS files in src/ while retaining directory structures
// e.g., src/maps/leaf.js -> staticfiles/maps/leaf.js
function allEntrypoints() {
	return globSync('./src/**/*.{js,ts,css}', {
		ignore: ['**/*.test.js', '**/*.d.ts']
	});
}
