export async function runTests() {
	console.log("[Bun] Running tests...");
	const result = Bun.spawnSync(['bun', 'test'], {
		cwd: import.meta.dir,
		stdio: ['inherit', 'inherit', 'inherit'],
	});
	if (result.exitCode !== 0) {
		console.error("[Bun] Tests failed, skipping build.");
		return false;
	}
	console.log("[Bun] Tests passed.");
	return true;
}
