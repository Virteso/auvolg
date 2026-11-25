import { test } from 'bun:test';
const expect_req = await import('bun:test');

const expect = expect_req.expect;

test('empty Test', () => {});
