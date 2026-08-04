import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: ["node_modules/**", "main.js", "coverage/**", "tests/e2e/**", "*.config.mjs", "vitest.config.ts", "version-bump.mjs"],
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
		rules: {
			// Obsidian's own API is heavily `any`-typed, so these fire constantly
			// on legitimate calls into it — keep as warnings, not build-breaking errors.
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
		},
	},
	// Test files run under vitest/jsdom, not inside Obsidian
	{
		files: ["tests/unit/**/*.ts"],
		rules: {
			"obsidianmd/no-global-this": "off",
			"obsidianmd/no-tfile-tfolder-cast": "off",
			"obsidianmd/prefer-active-doc": "off",
			// createDiv()/createEl() are Obsidian-injected globals not present in jsdom
			"obsidianmd/prefer-create-el": "off",
		},
	},
	{
		files: ["src/templateRenderer.ts"],
		rules: {
			// new Function() for template scripts is intentional (see comment at
			// the call site); this rule can't be suppressed inline (obsidianmd/*
			// disables are banned), so it's scoped off for this file instead.
			"obsidianmd/rule-custom-message": "off",
		},
	},
	{
		files: ["__mocks__/**/*.ts"],
		rules: {
			// this file is the obsidian mock, so it must import the real moment package
			"@typescript-eslint/no-restricted-imports": "off",
		},
	},
	{
		files: ["package.json"],
		rules: {
			// moment is a devDependency only, used by the obsidian test mock so
			// specs run outside Obsidian — not bundled into the plugin.
			"depend/ban-dependencies": ["error", { presets: ["native", "microutilities", "preferred"], allowed: ["moment"] }],
		},
	},
]);
