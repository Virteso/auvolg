import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterEach } from 'bun:test';

GlobalRegistrator.register();

/**
 * Put the document back to a pristine state between tests.
 */
export function resetDom(): void {
	document.documentElement.innerHTML = '<html><head></head><body></body></html>';
}

afterEach(resetDom);
