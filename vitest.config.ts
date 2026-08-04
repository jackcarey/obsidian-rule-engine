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
			exclude: ["src/main.ts", "src/settings.ts"],
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
