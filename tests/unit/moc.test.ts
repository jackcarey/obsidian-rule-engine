import { describe, it, expect } from "vitest";
import type { HeadingCache } from "obsidian";
import { getFileTags, findMocMatches, applyMocSection } from "../../src/moc";

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

	it("creates a missing heading one level deeper than the file's last heading", () => {
		const content = ["# Title", "", "## Existing", "content"].join("\n");
		const headings = [heading("Title", 1, 0), heading("Existing", 2, 2)];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]"]);

		expect(result).toBe(["# Title", "", "## Existing", "content", "", "### Related notes", "", "- [[A]]"].join("\n"));
	});

	it("creates a missing heading at level 2 when the file has no headings at all", () => {
		const content = "Just some text.";
		const result = applyMocSection(content, [], "Related notes", ["- [[A]]"]);

		expect(result).toBe(["Just some text.", "", "## Related notes", "", "- [[A]]"].join("\n"));
	});

	it("caps the created heading level at 6", () => {
		const content = "###### Deepest";
		const headings = [heading("Deepest", 6, 0)];

		const result = applyMocSection(content, headings, "Related notes", ["- [[A]]"]);

		expect(result).toBe(["###### Deepest", "", "###### Related notes", "", "- [[A]]"].join("\n"));
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
