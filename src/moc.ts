import { App, HeadingCache, TFile } from "obsidian";
import { normalizeTag } from "tagFieldUtils";

export type MocMode = "any" | "all" | "percentage" | "count";

export interface MocOptions {
	minPercentage?: number;
	minCount?: number;
}

export const DEFAULT_MIN_PERCENTAGE = 50;
export const DEFAULT_MIN_COUNT = 2;

// Thresholds of 0 (or below) would match every file, so clamp to a real minimum.
export function clampMinPercentage(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return DEFAULT_MIN_PERCENTAGE;
	return Math.min(100, Math.max(1, n));
}

export function clampMinCount(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return DEFAULT_MIN_COUNT;
	return Math.max(1, Math.ceil(n));
}

/** A file's combined body+frontmatter tags, normalized and deduped case-insensitively. */
export function getFileTags(app: App, file: TFile): string[] {
	const cache = app.metadataCache.getFileCache(file);
	const seen = new Set<string>();
	const tags: string[] = [];

	const addTag = (raw: string) => {
		const normalized = normalizeTag(raw);
		const key = normalized.toLowerCase();
		if (normalized && !seen.has(key)) {
			seen.add(key);
			tags.push(normalized);
		}
	};

	for (const bodyTag of cache?.tags ?? []) {
		addTag(bodyTag.tag.replace(/^#+/, ""));
	}

	const frontmatterTags = cache?.frontmatter?.tags as string | string[] | undefined;
	if (frontmatterTags) {
		const list = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
		for (const tag of list) addTag(String(tag));
	}

	return tags;
}

/**
 * Finds every other markdown file in the vault whose tags match `file`'s own
 * tags per `mode` ('any' shared tag, 'all' of them - `file`'s tag set is a
 * subset of the candidate's, 'percentage' of `file`'s tags shared, or 'count'
 * of shared tags). Sorted alphabetically by basename.
 *
 * `sourceTags` must be non-empty and is assumed to already be `file`'s tags
 * (via `getFileTags`) - callers should treat an empty tag set as a no-op
 * before calling this, since 'all' mode would otherwise vacuously match
 * every file in the vault against an empty required-tag-set.
 */
export function findMocMatches(app: App, file: TFile, sourceTags: string[], mode: MocMode, options: MocOptions = {}): TFile[] {
	const sourceKeys = sourceTags.map(t => t.toLowerCase());
	const minPercentage = clampMinPercentage(options.minPercentage);
	const minCount = clampMinCount(options.minCount);

	const matches: TFile[] = [];
	for (const candidate of app.vault.getMarkdownFiles()) {
		if (candidate.path === file.path) continue;

		const candidateKeys = new Set(getFileTags(app, candidate).map(t => t.toLowerCase()));
		const shared = sourceKeys.filter(key => candidateKeys.has(key)).length;
		let isMatch: boolean;
		switch (mode) {
			case "any": isMatch = shared > 0; break;
			case "all": isMatch = shared === sourceKeys.length; break;
			// Multiply before dividing: 0.29 * 100 is 28.999... and would miss a 29% threshold.
			case "percentage": isMatch = shared * 100 / sourceKeys.length >= minPercentage; break;
			case "count": isMatch = shared >= minCount; break;
		}
		if (isMatch) matches.push(candidate);
	}

	matches.sort((a, b) => a.basename.localeCompare(b.basename));
	return matches;
}

/**
 * Replaces (or creates) the section under `headingName` (case-insensitive,
 * trimmed, first match wins) with `lines`, and returns the full updated file
 * content. Pure string-in/string-out - `headings` should come from
 * `app.metadataCache.getFileCache(file)?.headings`.
 *
 * - Heading found: everything from right after it up to the next heading of
 *   equal-or-shallower level (or EOF) is replaced with `lines`.
 * - Heading missing: a new one is appended at the end of the file at
 *   `missingHeadingLevel` (clamped to 1-6).
 */
export function applyMocSection(content: string, headings: HeadingCache[], headingName: string, lines: string[], missingHeadingLevel: number = 2): string {
	const contentLines = content.split("\n");
	const normalizedTarget = headingName.trim().toLowerCase();
	const matchIndex = headings.findIndex(h => h.heading.trim().toLowerCase() === normalizedTarget);

	if (matchIndex === -1) {
		const newLevel = Math.max(1, Math.min(6, Math.round(missingHeadingLevel)));
		const headingLine = `${"#".repeat(newLevel)} ${headingName.trim()}`;

		const trimmedTrailingBlank = contentLines[contentLines.length - 1]?.trim() === ""
			? contentLines.slice(0, -1)
			: contentLines;
		const separator = trimmedTrailingBlank.length > 0 ? [""] : [];

		return [...trimmedTrailingBlank, ...separator, headingLine, "", ...lines].join("\n");
	}

	const matched = headings[matchIndex];
	if (!matched) return content;

	const sectionStart = matched.position.start.line + 1;
	const next = headings.slice(matchIndex + 1).find(h => h.level <= matched.level);
	const sectionEnd = next ? next.position.start.line : contentLines.length;

	const newSection = next ? ["", ...lines, ""] : ["", ...lines];
	return [
		...contentLines.slice(0, sectionStart),
		...newSection,
		...contentLines.slice(sectionEnd),
	].join("\n");
}
