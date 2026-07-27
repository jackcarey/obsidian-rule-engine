import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: ["node_modules/**", "main.js", "coverage/**", "e2e/**"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: true,
				sourceType: "module",
			},
		},
	},
	// e2e scripts run under Node, before Obsidian even starts, and are excluded
	// from the plugin bundle (see tsconfig.json's include) — they need real Node
	// globals. The obsidianmd rules that don't apply here are silenced inline,
	// per file, with a description.
	{
		files: ["e2e/**/*.ts"],
		languageOptions: {
			globals: {
				process: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
			},
		},
	},
	// Test files run under vitest/jsdom, not inside Obsidian
	{
		files: ["src/__tests__/**/*.ts"],
		rules: {
			"obsidianmd/no-global-this": "off",
			"obsidianmd/no-tfile-tfolder-cast": "off",
			"obsidianmd/prefer-active-doc": "off",
		},
	},
]);
