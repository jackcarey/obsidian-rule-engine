import { App, TFile } from "obsidian";

export interface TagMergeOptions {
	/**
	 * Ceiling on the field's total tag count. In append mode (the default),
	 * existing tags are never removed to enforce this - it only limits how
	 * many new candidates get added. If the field already has this many tags
	 * (or more), nothing is added. In override mode this caps the replacement
	 * list directly.
	 */
	maxCount: number;
	/**
	 * When true, replace the field's tags with `candidateTags` instead of
	 * merging into whatever is already there.
	 */
	override?: boolean;
}

/**
 * Normalizes a raw candidate/existing tag string into a value safe to store
 * in a tags frontmatter field: no leading '#', no whitespace, hierarchy
 * separators ('/') preserved.
 */
export function normalizeTag(raw: string): string {
	return raw
		.trim()
		.replace(/^#+/, "")
		.replace(/\s+/g, "-")
		.replace(/[^\p{L}\p{N}_\-/]+/gu, "")
		.replace(/-{2,}/g, "-")
		.replace(/^[-/]+|[-/]+$/g, "");
}

/**
 * Reads a frontmatter field that may be a single string or a list, returning
 * a flat string array regardless of which form is currently stored.
 */
export function getFrontmatterTagList(frontmatter: Record<string, unknown> | undefined, fieldKey: string): string[] {
	const raw = frontmatter?.[fieldKey];
	if (raw === undefined || raw === null) return [];
	const values = Array.isArray(raw) ? raw : [raw];
	return values
		.filter((t): t is string | number | boolean => t !== null && typeof t !== "object")
		.map(t => String(t));
}

/**
 * Merges existing frontmatter tags with newly generated candidates, deduping
 * case-insensitively. Every existing tag is always kept - `maxCount` only
 * caps how many new candidates get appended (zero, once the field already
 * has `maxCount` or more tags), it never truncates what's already there.
 *
 * In override mode (`options.override`), existing tags are dropped entirely
 * and the result is just the first `maxCount` deduped candidates.
 */
export function mergeTagLists(existingTags: string[], candidateTags: string[], options: TagMergeOptions): string[] {
	const maxCount = Math.max(0, Math.floor(options.maxCount));

	const seen = new Set<string>();
	const normalizedExisting: string[] = [];
	if (!options.override) {
		for (const tag of existingTags) {
			const normalized = normalizeTag(tag);
			const key = normalized.toLowerCase();
			if (normalized && !seen.has(key)) {
				seen.add(key);
				normalizedExisting.push(normalized);
			}
		}
	}
	const normalizedCandidates: string[] = [];
	for (const tag of candidateTags) {
		const normalized = normalizeTag(tag);
		const key = normalized.toLowerCase();
		if (normalized && !seen.has(key)) {
			seen.add(key);
			normalizedCandidates.push(normalized);
		}
	}

	const remainingSlots = Math.max(0, maxCount - normalizedExisting.length);
	const addedCandidates = normalizedCandidates.slice(0, remainingSlots);

	return [...normalizedExisting, ...addedCandidates];
}

/**
 * Applies `candidateTags` to a file's frontmatter tag field via
 * `processFrontMatter`, subject to `mergeTagLists`'s limit rule. Appends to
 * whatever is already there unless `options.override` is set, in which case
 * it replaces the field entirely.
 */
export async function appendFrontmatterTags(
	app: App,
	file: TFile,
	fieldKey: string,
	candidateTags: string[],
	options: TagMergeOptions
): Promise<{ finalTags: string[]; addedTags: string[] }> {
	let existingTags: string[] = [];
	let finalTags: string[] = [];
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		existingTags = getFrontmatterTagList(frontmatter, fieldKey);
		finalTags = mergeTagLists(existingTags, candidateTags, options);
		frontmatter[fieldKey] = finalTags;
	});

	const existingKeys = new Set(existingTags.map(t => normalizeTag(t).toLowerCase()));
	const addedTags = finalTags.filter(t => !existingKeys.has(t.toLowerCase()));
	return { finalTags, addedTags };
}
