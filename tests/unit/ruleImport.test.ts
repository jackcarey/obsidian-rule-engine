import { describe, expect, it } from "vitest";
import {
	exportFileName,
	migrateRule,
	normalizeRule,
	parseRuleImport,
	serializeRules,
} from "../../src/ruleImport";
import type { RuleConfig } from "../../src/types";

const validRule = () => ({
	id: "old",
	name: "Rule A",
	filterGroup: {
		type: "group",
		operator: "AND",
		conditions: [{ type: "filter", field: "file", operator: "has tag", value: "x" }],
	},
	template: "<h1>hi</h1>",
	enableTemplateForFile: true,
	enableTemplateForBase: false,
	enableTemplateForCanvas: true,
	enabled: true,
	commandIds: ["a"],
	baseFileHandling: "file",
});

let n = 0;
const makeId = () => `id-${++n}`;

describe("normalizeRule", () => {
	it("accepts a valid rule", () => {
		const rule = normalizeRule(validRule());
		expect(rule?.name).toBe("Rule A");
		expect(rule?.enableTemplateForCanvas).toBe(true);
	});

	it("rejects non-objects and missing names", () => {
		expect(normalizeRule(null)).toBeNull();
		expect(normalizeRule("x")).toBeNull();
		expect(normalizeRule({ ...validRule(), name: undefined })).toBeNull();
	});

	it("rejects bad filter groups", () => {
		expect(normalizeRule({ ...validRule(), filterGroup: null })).toBeNull();
		expect(
			normalizeRule({ ...validRule(), filterGroup: { type: "group", operator: "XOR", conditions: [] } }),
		).toBeNull();
		expect(
			normalizeRule({ ...validRule(), filterGroup: { type: "group", operator: "AND", conditions: [{ nope: 1 }] } }),
		).toBeNull();
	});

	it("allows one level of nested group but not two", () => {
		const nested = {
			type: "group",
			operator: "OR",
			conditions: [{ type: "filter", field: "a", operator: "is", value: "1" }],
		};
		const ok = { type: "group", operator: "AND", conditions: [nested] };
		expect(normalizeRule({ ...validRule(), filterGroup: ok })).not.toBeNull();
		const tooDeep = { type: "group", operator: "AND", conditions: [{ ...nested, conditions: [nested] }] };
		expect(normalizeRule({ ...validRule(), filterGroup: tooDeep })).toBeNull();
	});

	it("falls back to safe defaults for bad optional fields", () => {
		const rule = normalizeRule({ ...validRule(), baseFileHandling: "bogus", commandIds: [1, "b"], enabled: undefined });
		expect(rule?.baseFileHandling).toBe("file");
		expect(rule?.commandIds).toEqual(["b"]);
		expect(rule?.enabled).toBe(true);
	});
});

describe("migrateRule (pre-2.0 rules)", () => {
	it("turns legacy override text into toggles and drops the old keys", () => {
		const rule = {
			...validRule(),
			enableTemplateForBase: undefined,
			enableTemplateForCanvas: undefined,
			enableTemplateForFile: undefined,
			templateBase: "<b>x</b>",
			templateCanvas: "  ",
		} as unknown as RuleConfig;
		migrateRule(rule);
		expect(rule.enableTemplateForBase).toBe(true);
		expect(rule.enableTemplateForCanvas).toBe(false);
		expect(rule.enableTemplateForFile).toBe(true);
		expect("templateBase" in rule).toBe(false);
		expect("templateCanvas" in rule).toBe(false);
	});
});

describe("exportFileName", () => {
	const day = new Date("2026-09-19T12:00:00Z");
	it("uses a dated name", () => {
		expect(exportFileName(() => false, day)).toBe("rule-engine-rules-2026-09-19.json");
	});
	it("adds a counter instead of overwriting", () => {
		const taken = new Set(["rule-engine-rules-2026-09-19.json", "rule-engine-rules-2026-09-19-2.json"]);
		expect(exportFileName((p) => taken.has(p), day)).toBe("rule-engine-rules-2026-09-19-3.json");
	});
});

describe("parseRuleImport", () => {
	it("round-trips serializeRules and assigns fresh ids", () => {
		const rules = [normalizeRule(validRule())!];
		const result = parseRuleImport(serializeRules(rules), makeId);
		expect(result.error).toBeUndefined();
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]!.id).not.toBe("old");
	});

	it("accepts a bare array", () => {
		expect(parseRuleImport(JSON.stringify([validRule()]), makeId).rules).toHaveLength(1);
	});

	it("counts invalid rules as skipped", () => {
		const result = parseRuleImport(JSON.stringify({ rules: [validRule(), { bad: true }] }), makeId);
		expect(result.rules).toHaveLength(1);
		expect(result.skipped).toBe(1);
	});

	it("reports errors for bad JSON and empty results", () => {
		expect(parseRuleImport("{nope", makeId).error).toMatch(/JSON/);
		expect(parseRuleImport("{}", makeId).error).toMatch(/No rules/);
		expect(parseRuleImport(JSON.stringify([{ bad: 1 }]), makeId).error).toMatch(/valid/);
	});
});
