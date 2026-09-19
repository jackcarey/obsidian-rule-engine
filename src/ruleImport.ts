import type { Filter, FilterConjunction, FilterGroup, FilterSubgroup, RuleConfig } from "types";

const CONJUNCTIONS: FilterConjunction[] = ["AND", "OR", "NOR"];
const FILE_HANDLING = ["file", "results", "both"];

interface LegacyFields {
	templateBase?: string;
	templateCanvas?: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/** Adds fields older versions lacked. Used on load and on import. */
export function migrateRule(rule: RuleConfig, legacy: LegacyFields = rule as unknown as LegacyFields): void {
	// Legacy override text only counted when non-empty.
	rule.enableTemplateForBase ??= Boolean(legacy.templateBase?.trim());
	rule.enableTemplateForCanvas ??= Boolean(legacy.templateCanvas?.trim());
	// Old rules always templated file views.
	rule.enableTemplateForFile ??= true;
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
		const isGroup = isObject(c) && c.type === "group";
		const parsed = isGroup ? allowNested && normalizeGroup(c, false) : normalizeFilter(c);
		// Dropping a bad condition would silently widen what the rule matches, so reject the rule.
		if (!parsed) return null;
		conditions.push(parsed as Filter | FilterSubgroup);
	}
	return { type: "group", operator: raw.operator as FilterConjunction, conditions };
}

/** Returns null if the rule can't be used safely. */
export function normalizeRule(raw: unknown): RuleConfig | null {
	if (!isObject(raw) || typeof raw.name !== "string") return null;
	const filterGroup = normalizeGroup(raw.filterGroup, true);
	if (!filterGroup) return null;

	const rule = {
		id: "",
		name: raw.name,
		filterGroup,
		template: typeof raw.template === "string" ? raw.template : "",
		enableTemplateForFile: raw.enableTemplateForFile,
		enableTemplateForBase: raw.enableTemplateForBase,
		enableTemplateForCanvas: raw.enableTemplateForCanvas,
		enabled: raw.enabled !== false,
		commandIds: Array.isArray(raw.commandIds)
			? raw.commandIds.filter((c): c is string => typeof c === "string")
			: [],
		baseFileHandling: FILE_HANDLING.includes(raw.baseFileHandling as string)
			? raw.baseFileHandling
			: "file",
	} as RuleConfig;
	migrateRule(rule, raw as LegacyFields);
	return rule;
}

export const serializeRules = (rules: RuleConfig[]): string =>
	JSON.stringify({ version: 1, rules }, null, 2);

/** Never overwrites: adds a counter when the name is taken. */
export function exportFileName(exists: (path: string) => boolean, now = new Date()): string {
	const base = `rule-engine-rules-${now.toISOString().slice(0, 10)}`;
	let name = `${base}.json`;
	for (let n = 2; exists(name); n++) name = `${base}-${n}.json`;
	return name;
}

/** Random suffix so ids from one import batch don't collide within the same millisecond. */
export const newRuleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface ParsedImport {
	rules: RuleConfig[];
	skipped: number;
	error?: string;
}

const fail = (error: string): ParsedImport => ({ rules: [], skipped: 0, error });

/** Accepts `{ rules: [...] }` or a bare array. Imported rules get fresh ids so they can't clash with existing ones. */
export function parseRuleImport(text: string, makeId: () => string = newRuleId): ParsedImport {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return fail("That isn't valid JSON.");
	}
	const list = Array.isArray(data) ? data : isObject(data) ? data.rules : undefined;
	if (!Array.isArray(list)) return fail("No rules found in that JSON.");

	const rules = list.flatMap((raw) => {
		const rule = normalizeRule(raw);
		return rule ? [{ ...rule, id: makeId() }] : [];
	});
	const skipped = list.length - rules.length;
	return rules.length ? { rules, skipped } : { rules, skipped, error: "None of the rules were valid." };
}
