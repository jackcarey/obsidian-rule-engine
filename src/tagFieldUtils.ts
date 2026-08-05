import { App, TFile } from "obsidian";

export interface TagMergeOptions {
	/** Maximum number of tags the frontmatter field may hold once merged. */
	maxCount: number;
	/**
	 * Fraction (0-1) of `maxCount` slots reserved for the file's existing tags
	 * ahead of newly generated candidates. 1 (default) always keeps every
	 * existing tag that fits before adding anything new; 0 prioritizes new
	 * candidates and only backfills with leftover existing tags if room remains.
	 */
	weight?: number;
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
 * case-insensitively and enforcing `maxCount`. Existing tags are only ever
 * dropped when the merged list would otherwise exceed `maxCount` - `weight`
 * decides which side gives way first, it never discards tags on its own.
 */
export function mergeTagLists(existingTags: string[], candidateTags: string[], options: TagMergeOptions): string[] {
	const maxCount = Math.max(0, Math.floor(options.maxCount));
	const weight = Math.min(1, Math.max(0, options.weight ?? 1));
	if (maxCount === 0) return [];

	const seen = new Set<string>();
	const normalizedExisting: string[] = [];
	for (const tag of existingTags) {
		const normalized = normalizeTag(tag);
		const key = normalized.toLowerCase();
		if (normalized && !seen.has(key)) {
			seen.add(key);
			normalizedExisting.push(normalized);
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

	const existingSlots = Math.round(maxCount * weight);
	const keptExisting = normalizedExisting.slice(0, Math.min(existingSlots, maxCount));
	const addedCandidates = normalizedCandidates.slice(0, maxCount - keptExisting.length);

	const result = [...keptExisting, ...addedCandidates];

	// Backfill any still-empty slots with leftover existing tags (covers
	// weight < 1 when there weren't enough candidates to fill the gap).
	if (result.length < maxCount) {
		for (const tag of normalizedExisting.slice(keptExisting.length)) {
			if (result.length >= maxCount) break;
			result.push(tag);
		}
	}

	return result;
}

/**
 * Applies `candidateTags` to a file's frontmatter tag field via
 * `processFrontMatter`, appending to (never replacing) whatever is already
 * there, subject to `mergeTagLists`'s limit/weight rules.
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
