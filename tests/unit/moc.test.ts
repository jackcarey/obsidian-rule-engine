import { describe, it, expect } from "vitest";
import type { HeadingCache } from "obsidian";
import { findMocMatches, applyMocSection, clampMinPercentage, clampMinCount } from "../../src/moc";
import { getFileTags } from "../../src/tagFieldUtils";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockFileCache {
	tags?: Array<{ tag: string }>;
	frontmatter?: Record<string, unknown>;
}

function mockFile(path: string) {
	const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	return { path, basename, extension: "md" } as unknown as import("obsidian").TFile;
}

function mockApp(filesCaches: Record<string, MockFileCache>) {
	const paths = Object.keys(filesCaches);
	const files = paths.map(mockFile);
	return {
		vault: {
			getMarkdownFiles: () => files,
		},
		metadataCache: {
			getFileCache: (file: import("obsidian").TFile) => filesCaches[file.path],
		},
	} as unknown as import("obsidian").App;
}

// ---------------------------------------------------------------------------
// getFileTags
// ---------------------------------------------------------------------------

describe("getFileTags", () => {
	it("combines body tags (stripping #) and frontmatter tags", () => {
		const app = mockApp({
			"a.md": { tags: [{ tag: "#body" }], frontmatter: { tags: ["fm"] } },
		});
		expect(getFileTags(app, mockFile("a.md"))).toEqual(["body", "fm"]);
	});

	it("handles a single-string frontmatter tags value", () => {
		const app = mockApp({ "a.md": { frontmatter: { tags: "solo" } } });
		expect(getFileTags(app, mockFile("a.md"))).toEqual(["solo"]);
	});

	it("dedupes case-insensitively, keeping the first-seen casing", () => {
		const app = mockApp({
			"a.md": { tags: [{ tag: "#Movies" }], frontmatter: { tags: ["movies"] } },
		});
		expect(getFileTags(app, mockFile("a.md"))).toEqual(["Movies"]);
	});

	it("returns an empty array for a file with no tags", () => {
		const app = mockApp({ "a.md": {} });
		expect(getFileTags(app, mockFile("a.md"))).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// findMocMatches
// ---------------------------------------------------------------------------

describe("findMocMatches", () => {
	it("'any' mode matches files sharing at least one tag", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["a", "b"] } },
			"shares-a.md": { frontmatter: { tags: ["a", "z"] } },
			"shares-nothing.md": { frontmatter: { tags: ["z"] } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "any");
		expect(result.map(f => f.path)).toEqual(["shares-a.md"]);
	});

	it("'all' mode only matches files that have every source tag (superset)", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["a", "b"] } },
			"has-both.md": { frontmatter: { tags: ["a", "b", "c"] } },
			"has-only-a.md": { frontmatter: { tags: ["a"] } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "all");
		expect(result.map(f => f.path)).toEqual(["has-both.md"]);
	});

	it("excludes the source file itself", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["a"] } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "any");
		expect(result).toEqual([]);
	});

	it("matches tags case-insensitively", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["Movies"] } },
			"other.md": { frontmatter: { tags: ["movies"] } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "any");
		expect(result.map(f => f.path)).toEqual(["other.md"]);
	});

	it("sorts matches alphabetically by basename", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["a"] } },
			"Zebra.md": { frontmatter: { tags: ["a"] } },
			"Apple.md": { frontmatter: { tags: ["a"] } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "any");
		expect(result.map(f => f.basename)).toEqual(["Apple", "Zebra"]);
	});

	it("'all' mode: a candidate with no tags never matches a source that has tags", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["a"] } },
			"empty.md": {},
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "all");
		expect(result).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// findMocMatches - percentage / count modes
// ---------------------------------------------------------------------------

// Source has 4 tags; candidates share 1, 2, 3 and 4 of them (plus one with none).
function thresholdApp() {
	return mockApp({
		"source.md": { frontmatter: { tags: ["a", "b", "c", "d"] } },
		"shares-1.md": { frontmatter: { tags: ["a", "z"] } },
		"shares-2.md": { frontmatter: { tags: ["a", "b"] } },
		"shares-3.md": { frontmatter: { tags: ["a", "b", "c"] } },
		"shares-4.md": { frontmatter: { tags: ["a", "b", "c", "d", "e"] } },
		"shares-0.md": { frontmatter: { tags: ["z"] } },
	});
}

function run(mode: "percentage" | "count", options: { minPercentage?: number; minCount?: number }) {
	const app = thresholdApp();
	const source = mockFile("source.md");
	return findMocMatches(app, source, getFileTags(app, source), mode, options).map(f => f.path);
}

describe("findMocMatches - percentage mode", () => {
	it("matches at exactly the threshold and above, not below", () => {
		expect(run("percentage", { minPercentage: 50 })).toEqual(["shares-2.md", "shares-3.md", "shares-4.md"]);
	});

	it("excludes a candidate just below the threshold", () => {
		expect(run("percentage", { minPercentage: 51 })).toEqual(["shares-3.md", "shares-4.md"]);
	});

	it("100% requires every source tag", () => {
		expect(run("percentage", { minPercentage: 100 })).toEqual(["shares-4.md"]);
	});

	it("a threshold above 100 clamps to 100", () => {
		expect(run("percentage", { minPercentage: 250 })).toEqual(["shares-4.md"]);
	});

	it("a 0 or negative threshold clamps up so files sharing nothing never match", () => {
		expect(run("percentage", { minPercentage: 0 })).not.toContain("shares-0.md");
		expect(run("percentage", { minPercentage: -10 })).not.toContain("shares-0.md");
		expect(run("percentage", { minPercentage: 0 })).toContain("shares-1.md");
	});

	it("falls back to 50% when the threshold is missing or NaN", () => {
		expect(run("percentage", {})).toEqual(["shares-2.md", "shares-3.md", "shares-4.md"]);
		expect(run("percentage", { minPercentage: NaN })).toEqual(["shares-2.md", "shares-3.md", "shares-4.md"]);
	});

	it("avoids float error at exact fractions (29 of 100 tags = 29%)", () => {
		const sourceTags = Array.from({ length: 100 }, (_, i) => `t${i}`);
		const app = mockApp({
			"source.md": { frontmatter: { tags: sourceTags } },
			"other.md": { frontmatter: { tags: sourceTags.slice(0, 29) } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "percentage", { minPercentage: 29 });
		expect(result.map(f => f.path)).toEqual(["other.md"]);
	});
});

describe("findMocMatches - count mode", () => {
	it("matches at exactly the threshold and above, not below", () => {
		expect(run("count", { minCount: 2 })).toEqual(["shares-2.md", "shares-3.md", "shares-4.md"]);
	});

	it("a threshold above the source tag count matches nothing", () => {
		expect(run("count", { minCount: 5 })).toEqual([]);
	});

	it("a threshold equal to the source tag count matches only full overlaps", () => {
		expect(run("count", { minCount: 4 })).toEqual(["shares-4.md"]);
	});

	it("a 0 or negative threshold clamps to 1 so files sharing nothing never match", () => {
		const anyShared = ["shares-1.md", "shares-2.md", "shares-3.md", "shares-4.md"];
		expect(run("count", { minCount: 0 })).toEqual(anyShared);
		expect(run("count", { minCount: -3 })).toEqual(anyShared);
	});

	it("falls back to 2 when the threshold is missing or NaN", () => {
		expect(run("count", {})).toEqual(["shares-2.md", "shares-3.md", "shares-4.md"]);
		expect(run("count", { minCount: NaN })).toEqual(["shares-2.md", "shares-3.md", "shares-4.md"]);
	});

	it("counts tags case-insensitively", () => {
		const app = mockApp({
			"source.md": { frontmatter: { tags: ["A", "B"] } },
			"other.md": { frontmatter: { tags: ["a", "b"] } },
		});
		const source = mockFile("source.md");
		const result = findMocMatches(app, source, getFileTags(app, source), "count", { minCount: 2 });
		expect(result.map(f => f.path)).toEqual(["other.md"]);
	});
});

describe("findMocMatches - existing modes ignore thresholds", () => {
	it("'any' and 'all' behave the same when options are passed", () => {
		const app = thresholdApp();
		const source = mockFile("source.md");
		const tags = getFileTags(app, source);
		const opts = { minPercentage: 100, minCount: 4 };
		expect(findMocMatches(app, source, tags, "any", opts).map(f => f.path)).toEqual(
			["shares-1.md", "shares-2.md", "shares-3.md", "shares-4.md"],
		);
		expect(findMocMatches(app, source, tags, "all", opts).map(f => f.path)).toEqual(["shares-4.md"]);
	});
});

describe("threshold coercion", () => {
	it("coerces numeric strings (frontmatter overrides) and clamps", () => {
		expect(clampMinPercentage("75")).toBe(75);
		expect(clampMinPercentage("abc")).toBe(50);
		expect(clampMinPercentage(0)).toBe(1);
		expect(clampMinPercentage(101)).toBe(100);
		expect(clampMinCount("3")).toBe(3);
		expect(clampMinCount("abc")).toBe(2);
		expect(clampMinCount(0)).toBe(1);
		expect(clampMinCount(2.2)).toBe(3);
	});

	it("undefined falls back to defaults", () => {
		expect(clampMinPercentage(undefined)).toBe(50);
		expect(clampMinCount(undefined)).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// applyMocSection
// ---------------------------------------------------------------------------

function heading(text: string, level: number, line: number): HeadingCache {
	return {
		heading: text,
		level,
		position: { start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } },
	};
}

describe("applyMocSection", () => {
	it("replaces content between the heading and the next heading of equal-or-shallower level", () => {
		const content = ["# Title", "", "## Related notes", "old link 1", "old link 2", "", "## Next section", "keep me"].join("\n");
		const headings = [heading("Title", 1, 0), heading("Related notes", 2, 2), heading("Next section", 2, 6)];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]", "- [[B]]"]);

		expect(result).toBe(["# Title", "", "## Related notes", "", "- [[A]]", "- [[B]]", "", "## Next section", "keep me"].join("\n"));
	});

	it("replaces content through EOF when the matched heading is the last one", () => {
		const content = ["# Title", "## Related notes", "stale content"].join("\n");
		const headings = [heading("Title", 1, 0), heading("Related notes", 2, 1)];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]"]);

		expect(result).toBe(["# Title", "## Related notes", "", "- [[A]]"].join("\n"));
	});

	it("matches the heading case-insensitively", () => {
		const content = ["## related NOTES", "old"].join("\n");
		const headings = [heading("related NOTES", 2, 0)];

		const result = applyMocSection(content, headings, "Related Notes", ["- [[A]]"]);

		expect(result).toBe(["## related NOTES", "", "- [[A]]"].join("\n"));
	});

	it("does not stop at a deeper heading - only equal-or-shallower ends the section", () => {
		const content = ["## Related notes", "old", "### A sub-heading", "sub content", "## Next", "keep"].join("\n");
		const headings = [
			heading("Related notes", 2, 0),
			heading("A sub-heading", 3, 2),
			heading("Next", 2, 4),
		];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]"]);

		expect(result).toBe(["## Related notes", "", "- [[A]]", "", "## Next", "keep"].join("\n"));
	});

	it("uses the first match when there are duplicate heading names", () => {
		const content = ["## Related notes", "first", "## Related notes", "second"].join("\n");
		const headings = [heading("Related notes", 2, 0), heading("Related notes", 2, 2)];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]"]);

		expect(result).toBe(["## Related notes", "", "- [[A]]", "", "## Related notes", "second"].join("\n"));
	});

	it("creates a missing heading at the default level (2) regardless of the file's existing headings", () => {
		const content = ["# Title", "", "## Existing", "content"].join("\n");
		const headings = [heading("Title", 1, 0), heading("Existing", 2, 2)];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]"]);

		expect(result).toBe(["# Title", "", "## Existing", "content", "", "## Related notes", "", "- [[A]]"].join("\n"));
	});

	it("creates a missing heading at level 2 when the file has no headings at all", () => {
		const content = "Just some text.";
		const result = applyMocSection(content, [], "Related notes", ["- [[A]]"]);

		expect(result).toBe(["Just some text.", "", "## Related notes", "", "- [[A]]"].join("\n"));
	});

	it("creates the missing heading at a custom level when given one", () => {
		const content = "Just some text.";
		const result = applyMocSection(content, [], "Related notes", ["- [[A]]"], 4);

		expect(result).toBe(["Just some text.", "", "#### Related notes", "", "- [[A]]"].join("\n"));
	});

	it("clamps an out-of-range missing heading level to 1-6", () => {
		const content = "Just some text.";

		const tooLow = applyMocSection(content, [], "Related notes", ["- [[A]]"], 0);
		expect(tooLow).toBe(["Just some text.", "", "# Related notes", "", "- [[A]]"].join("\n"));

		const tooHigh = applyMocSection(content, [], "Related notes", ["- [[A]]"], 9);
		expect(tooHigh).toBe(["Just some text.", "", "###### Related notes", "", "- [[A]]"].join("\n"));
	});

	it("does not leave a double-blank line when the file already ends with a blank line", () => {
		const content = ["# Title", ""].join("\n");
		const result = applyMocSection(content, [heading("Title", 1, 0)], "Related notes", ["- [[A]]"]);

		expect(result).toBe(["# Title", "", "## Related notes", "", "- [[A]]"].join("\n"));
	});

	it("writes an empty section (no list lines) when there are no matches", () => {
		const content = ["## Related notes", "old", "## Next", "keep"].join("\n");
		const headings = [heading("Related notes", 2, 0), heading("Next", 2, 2)];

		const result = applyMocSection(content, headings, "Related notes", []);

		expect(result).toBe(["## Related notes", "", "", "## Next", "keep"].join("\n"));
	});
});
