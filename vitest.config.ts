import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
	test: {
		// Use jsdom so DOMParser and other browser APIs are available
		environment: "jsdom",
		globals: true,
		// Where to find test files
		include: ["tests/unit/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: ["src/**/*.ts"],
			// Plugin/UI classes need a real Obsidian; e2e covers them instead.
			exclude: ["src/main.ts", "src/settings.ts"],
			// Guard only the pure logic modules so they can't quietly rot.
			thresholds: {
				"src/{matcher,filters,moc,tfidf,tagFieldUtils,templateRenderer,ruleImport}.ts": {
					lines: 80,
				},
			},
		},
	},
	resolve: {
		tsconfigPaths: true,
		alias: {
			// Redirect all `import ... from 'obsidian'` to our mock
			obsidian: resolve(__dirname, "__mocks__/obsidian.ts"),
		},
	},
});
