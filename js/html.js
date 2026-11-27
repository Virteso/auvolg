import { readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { minify } from 'html-minifier-terser';
import { gzipSidecar } from './gzip.js';

// Conservative options: shrink markup without touching inline JS/CSS or
// decoding entities (the pages use &nbsp; for intentional spacing).
const HTML_MINIFY_OPTIONS = {
	collapseWhitespace: true,
	removeComments: true,
	removeScriptTypeAttributes: true,
	removeStyleLinkTypeAttributes: true,
	useShortDoctype: true,
	decodeEntities: false,
};

export async function minifyHtml(html) {
	return minify(html, HTML_MINIFY_OPTIONS);
}

export async function buildHtml(sourceDir, outputDir) {
	const files = readdirSync(sourceDir).filter((file) => file.endsWith('.html'));
	const outputs = [];

	for (const file of files) {
		const html = readFileSync(path.join(sourceDir, file), 'utf8');
		const outputPath = path.join(outputDir, file);
		writeFileSync(outputPath, await minifyHtml(html));
		gzipSidecar(outputPath);
		outputs.push(outputPath);
	}

	console.log(`[Bun] Minified ${outputs.length} HTML file(s) into ${outputDir}`);
	return outputs;
}
