import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Renders are waited for inline, a few seconds each, against the mock.
		testTimeout: 30_000,
	},
});
