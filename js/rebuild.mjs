import { globSync } from 'fs';
import path from 'path';

const jsRoot = import.meta.dir;
const outDir = path.resolve(jsRoot, '..', 'reWiLD', 'reWiLDsite', 'staticfiles');

const entrypoints = globSync('./src/**/*.{js,ts,css}', {
    cwd: jsRoot,
    ignore: ['**/*.test.js', '**/*.d.ts']
});

const result = await Bun.build({
    entrypoints: entrypoints.map(e => path.resolve(jsRoot, e)),
    outdir: outDir,
    root: path.resolve(jsRoot, 'src'),
    minify: false,
    sourcemap: 'inline',
    naming: '[dir]/[name].[ext]',
});

if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
}
console.log(`[Bun] Built ${result.outputs.length} entrypoints.`);
