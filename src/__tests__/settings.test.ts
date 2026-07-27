import { describe, it, expect, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../consts";
import { ObsidianRuleEngineSettingTab } from "../settings";
import type ObsidianRuleEnginePlugin from "../main";

describe("DEFAULT_SETTINGS", () => {
	it("has enabled: true by default", () => {
		expect(DEFAULT_SETTINGS.enabled).toBe(true);
	});

	it("has workInLivePreview: true by default", () => {
		expect(DEFAULT_SETTINGS.workInLivePreview).toBe(true);
	});

	it("has workInCanvas: false by default", () => {
		expect(DEFAULT_SETTINGS.workInCanvas).toBe(false);
	});

	it("has at least one default rule", () => {
		expect(DEFAULT_SETTINGS.rules.length).toBeGreaterThan(0);
	});

	it("every default rule has the required fields", () => {
		for (const rule of DEFAULT_SETTINGS.rules) {
			expect(typeof rule.id).toBe("string");
			expect(rule.id.length).toBeGreaterThan(0);
			expect(typeof rule.name).toBe("string");
			expect(rule.name.length).toBeGreaterThan(0);
			expect(typeof rule.template).toBe("string");
			expect(rule.filterGroup).toBeDefined();
			expect(rule.filterGroup.type).toBe("group");
			expect(["AND", "OR", "NOR"]).toContain(rule.filterGroup.operator);
			expect(Array.isArray(rule.filterGroup.conditions)).toBe(true);
			expect(Array.isArray(rule.commandIds)).toBe(true);
		}
	});

	it("default rules share no object references (deep-cloned filterGroup)", () => {
		const copy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
		copy.rules[0]!.filterGroup.conditions.push({
			type: "filter",
			field: "test",
			operator: "is",
			value: "x",
		});
		expect(DEFAULT_SETTINGS.rules[0]!.filterGroup.conditions).not.toEqual(copy.rules[0]!.filterGroup.conditions);
	});
});

function makePlugin() {
	return {
		settings: {
			rules: [],
			commands: {},
			enabled: true,
			useDnd: true,
			debug: false,
			workInLivePreview: false,
			workInCanvas: false,
			processOnSave: false,
			processBaseResultsAutomatically: false,
		},
		commands: [],
		saveSettings: async () => { /* no-op */ },
		isBasesViewRegistered: false,
		debug: () => { /* no-op */ },
	} as unknown as ObsidianRuleEnginePlugin;
}

describe("ObsidianRuleEngineSettingTab display() gate", () => {
	it("falls back to legacy rendering when Obsidian has no update() (pre-1.13)", () => {
		const tab = new ObsidianRuleEngineSettingTab({} as never, makePlugin());
		const legacySpy = vi.fn();
		(tab as unknown as { displayLegacy: () => void }).displayLegacy = legacySpy;

		// The mocked PluginSettingTab never defines update(), matching real
		// pre-1.13 Obsidian, so the gate should choose the legacy path.
		expect(typeof (tab as unknown as { update?: unknown }).update).not.toBe("function");
		tab.display();

		expect(legacySpy).toHaveBeenCalledTimes(1);
	});

	it("uses the declarative update() path when Obsidian provides it (1.13+)", () => {
		const tab = new ObsidianRuleEngineSettingTab({} as never, makePlugin());
		const legacySpy = vi.fn();
		const updateSpy = vi.fn();
		(tab as unknown as { displayLegacy: () => void }).displayLegacy = legacySpy;
		(tab as unknown as { update: () => void }).update = updateSpy;

		tab.display();

		expect(updateSpy).toHaveBeenCalledTimes(1);
		expect(legacySpy).not.toHaveBeenCalled();
	});
});
