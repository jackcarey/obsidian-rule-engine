import { resolve } from "path";
import { defineConfig } from "vitest/config";

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
			// UI classes need real Obsidian; e2e covers them.
			exclude: ["src/main.ts", "src/settings.ts"],
			// Stops the pure-logic modules degrading.
			thresholds: {
				"src/{matcher,filters,moc,tfidf,tagFieldUtils,templateRenderer,ruleImport,sampleValue,taskDates,fileFields}.ts":
				{
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
