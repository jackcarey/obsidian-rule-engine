import type { Filter, FilterConjunction, FilterGroup, FilterSubgroup, RuleConfig } from "types";

const CONJUNCTIONS: FilterConjunction[] = ["AND", "OR", "NOR"];
const FILE_HANDLING = ["file", "results", "both"];

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Fills fields older versions didn't have. Shared by settings load and import
 * so a rule exported from an old install still works.
 */
export function migrateRule(rule: RuleConfig): void {
	// Pre-2.0 stored separate override strings; only a non-empty one meant "on".
	const legacy = rule as unknown as { templateBase?: string; templateCanvas?: string };
	if (rule.enableTemplateForBase === undefined) {
		rule.enableTemplateForBase = Boolean(legacy.templateBase?.trim());
	}
	if (rule.enableTemplateForCanvas === undefined) {
		rule.enableTemplateForCanvas = Boolean(legacy.templateCanvas?.trim());
	}
	// Pre-2.0 rules always templated normal file views.
	if (rule.enableTemplateForFile === undefined) {
		rule.enableTemplateForFile = true;
	}
	delete legacy.templateBase;
	delete legacy.templateCanvas;
}

function normalizeFilter(raw: unknown): Filter | null {
	if (!isObject(raw) || typeof raw.field !== "string" || typeof raw.operator !== "string") {
		return null;
	}
	return {
		type: "filter",
		field: raw.field,
		operator: raw.operator as Filter["operator"],
		value: typeof raw.value === "string" ? raw.value : "",
	};
}

function normalizeGroup(raw: unknown, allowNested: boolean): FilterGroup | null {
	if (!isObject(raw) || !Array.isArray(raw.conditions)) return null;
	if (!CONJUNCTIONS.includes(raw.operator as FilterConjunction)) return null;
	const conditions: (Filter | FilterSubgroup)[] = [];
	for (const c of raw.conditions) {
		// Bad conditions fail the whole rule; silently dropping one would widen what it matches.
		const parsed =
			isObject(c) && c.type === "group" ? (allowNested ? normalizeGroup(c, false) : null) : normalizeFilter(c);
		if (!parsed) return null;
		conditions.push(parsed as Filter | FilterSubgroup);
	}
	return { type: "group", operator: raw.operator as FilterConjunction, conditions };
}

/** Validates untrusted JSON. Returns null if the rule can't be used safely. */
export function normalizeRule(raw: unknown): RuleConfig | null {
	if (!isObject(raw) || typeof raw.name !== "string") return null;
	const filterGroup = normalizeGroup(raw.filterGroup, true);
	if (!filterGroup) return null;

	const rule = {
		id: "",
		name: raw.name,
		filterGroup,
		template: typeof raw.template === "string" ? raw.template : "",
		enableTemplateForFile: raw.enableTemplateForFile as boolean | undefined,
		enableTemplateForBase: raw.enableTemplateForBase as boolean | undefined,
		enableTemplateForCanvas: raw.enableTemplateForCanvas as boolean | undefined,
		enabled: raw.enabled !== false,
		commandIds: Array.isArray(raw.commandIds)
			? raw.commandIds.filter((c): c is string => typeof c === "string")
			: [],
		baseFileHandling: FILE_HANDLING.includes(raw.baseFileHandling as string)
			? (raw.baseFileHandling as RuleConfig["baseFileHandling"])
			: "file",
		templateBase: raw.templateBase,
		templateCanvas: raw.templateCanvas,
	} as unknown as RuleConfig;
	migrateRule(rule);
	return rule;
}

export function serializeRules(rules: RuleConfig[]): string {
	return JSON.stringify({ version: 1, rules }, null, 2);
}

/** Dated name that never overwrites: appends a counter if the path is taken. */
export function exportFileName(exists: (path: string) => boolean, now = new Date()): string {
	const base = `rule-engine-rules-${now.toISOString().slice(0, 10)}`;
	let name = `${base}.json`;
	for (let n = 2; exists(name); n++) name = `${base}-${n}.json`;
	return name;
}

export interface ParsedImport {
	rules: RuleConfig[];
	skipped: number;
	error?: string;
}

/** Accepts `{ rules: [...] }` or a bare array. Imported rules get new ids so they can't collide with existing ones. */
export function parseRuleImport(text: string, makeId: () => string): ParsedImport {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { rules: [], skipped: 0, error: "That isn't valid JSON." };
	}
	const list = Array.isArray(data) ? data : isObject(data) ? data.rules : undefined;
	if (!Array.isArray(list)) {
		return { rules: [], skipped: 0, error: "No rules found in that JSON." };
	}
	const rules: RuleConfig[] = [];
	let skipped = 0;
	for (const raw of list) {
		const rule = normalizeRule(raw);
		if (rule) {
			rule.id = makeId();
			rules.push(rule);
		} else {
			skipped++;
		}
	}
	if (rules.length === 0) {
		return { rules, skipped, error: "None of the rules were valid." };
	}
	return { rules, skipped };
}
