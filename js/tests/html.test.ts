import { expect, test } from 'bun:test';
import { minifyHtml } from '../html.js';

test('minifies HTML while preserving meaningful text', async () => {
	const source = [
		'<!doctype html>',
		'<!-- remove me -->',
		'<html><body>',
		'<p>  A &nbsp; B  </p>',
		'<textarea> keep\n whitespace </textarea>',
		'</body></html>',
	].join('\n');

	const output = await minifyHtml(source);

	expect(output).toContain('A &nbsp; B');
	expect(output).toContain('<textarea> keep\n whitespace </textarea>');
	expect(output).not.toContain('remove me');
	expect(output.length).toBeLessThan(source.length);
});
