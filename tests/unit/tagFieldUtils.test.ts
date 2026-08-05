import { describe, it, expect } from "vitest";
import {
	normalizeTag,
	getFrontmatterTagList,
	mergeTagLists,
	appendFrontmatterTags,
} from "../../src/tagFieldUtils";

// ---------------------------------------------------------------------------
// normalizeTag
// ---------------------------------------------------------------------------

describe("normalizeTag", () => {
	it("strips a leading #", () => {
		expect(normalizeTag("#movies")).toBe("movies");
	});

	it("strips multiple leading #s", () => {
		expect(normalizeTag("##movies")).toBe("movies");
	});

	it("replaces whitespace with dashes", () => {
		expect(normalizeTag("machine learning")).toBe("machine-learning");
	});

	it("preserves hierarchy separators", () => {
		expect(normalizeTag("movies/action")).toBe("movies/action");
	});

	it("trims surrounding whitespace", () => {
		expect(normalizeTag("  tag  ")).toBe("tag");
	});

	it("strips disallowed punctuation", () => {
		expect(normalizeTag("tag!@#$%^&*()")).toBe("tag");
	});

	it("collapses repeated dashes", () => {
		expect(normalizeTag("a---b")).toBe("a-b");
	});

	it("trims leading/trailing separators after cleanup", () => {
		expect(normalizeTag("-tag-")).toBe("tag");
	});

	it("preserves unicode letters", () => {
		expect(normalizeTag("café")).toBe("café");
	});

	it("returns an empty string for input that is only punctuation", () => {
		expect(normalizeTag("!!!")).toBe("");
	});
});

// ---------------------------------------------------------------------------
// getFrontmatterTagList
// ---------------------------------------------------------------------------

describe("getFrontmatterTagList", () => {
	it("returns an empty array when the field is missing", () => {
		expect(getFrontmatterTagList({}, "tags")).toEqual([]);
	});

	it("returns an empty array when frontmatter is undefined", () => {
		expect(getFrontmatterTagList(undefined, "tags")).toEqual([]);
	});

	it("wraps a single string value in an array", () => {
		expect(getFrontmatterTagList({ tags: "solo" }, "tags")).toEqual(["solo"]);
	});

	it("passes through an array value", () => {
		expect(getFrontmatterTagList({ tags: ["a", "b"] }, "tags")).toEqual(["a", "b"]);
	});

	it("stringifies non-string primitives in a list", () => {
		expect(getFrontmatterTagList({ tags: [1, true] }, "tags")).toEqual(["1", "true"]);
	});

	it("reads a custom field key", () => {
		expect(getFrontmatterTagList({ keywords: ["x"] }, "keywords")).toEqual(["x"]);
	});

	it("ignores nested object values instead of stringifying them as [object Object]", () => {
		expect(getFrontmatterTagList({ tags: [{ nested: true }, "ok"] }, "tags")).toEqual(["ok"]);
	});
});

// ---------------------------------------------------------------------------
// mergeTagLists
// ---------------------------------------------------------------------------

describe("mergeTagLists", () => {
	it("keeps all existing tags and fills remaining capacity with new ones", () => {
		const result = mergeTagLists(["a", "b"], ["c", "d", "e"], { maxCount: 4 });
		expect(result).toEqual(["a", "b", "c", "d"]);
	});

	it("adds exactly up to the ceiling: 6 existing + maxCount 10 adds 4 new", () => {
		const existing = ["e1", "e2", "e3", "e4", "e5", "e6"];
		const candidates = ["n1", "n2", "n3", "n4", "n5", "n6"];
		const result = mergeTagLists(existing, candidates, { maxCount: 10 });
		expect(result).toEqual([...existing, "n1", "n2", "n3", "n4"]);
	});

	it("adds nothing and removes nothing when already at or over the ceiling: 11 existing + maxCount 10 adds 0", () => {
		const existing = Array.from({ length: 11 }, (_, i) => `e${i}`);
		const result = mergeTagLists(existing, ["n1", "n2"], { maxCount: 10 });
		expect(result).toEqual(existing);
		expect(result.length).toBe(11);
	});

	it("never removes existing tags even when maxCount is 0", () => {
		const result = mergeTagLists(["a", "b"], ["c"], { maxCount: 0 });
		expect(result).toEqual(["a", "b"]);
	});

	it("does not duplicate a candidate that already exists (case-insensitive)", () => {
		const result = mergeTagLists(["Movies"], ["movies", "action"], { maxCount: 5 });
		expect(result).toEqual(["Movies", "action"]);
	});

	it("normalizes both existing and candidate tags", () => {
		const result = mergeTagLists(["#Old Tag"], ["#New Tag"], { maxCount: 4 });
		expect(result).toEqual(["Old-Tag", "New-Tag"]);
	});

	it("returns an empty array when both inputs are empty", () => {
		expect(mergeTagLists([], [], { maxCount: 10 })).toEqual([]);
	});

	it("drops empty/blank candidates after normalization", () => {
		const result = mergeTagLists([], ["  ", "!!!", "real"], { maxCount: 5 });
		expect(result).toEqual(["real"]);
	});
});

// ---------------------------------------------------------------------------
// appendFrontmatterTags
// ---------------------------------------------------------------------------

function mockAppWithFrontmatter(initialFrontmatter: Record<string, unknown>) {
	const frontmatter = { ...initialFrontmatter };
	return {
		app: {
			fileManager: {
				processFrontMatter: async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => {
					fn(frontmatter);
				},
			},
		} as unknown as import("obsidian").App,
		frontmatter,
	};
}

describe("appendFrontmatterTags", () => {
	it("writes merged tags into the frontmatter field via processFrontMatter", async () => {
		const { app, frontmatter } = mockAppWithFrontmatter({ tags: ["existing"] });
		const file = {} as import("obsidian").TFile;

		const { finalTags, addedTags } = await appendFrontmatterTags(app, file, "tags", ["new1", "new2"], { maxCount: 5 });

		expect(finalTags).toEqual(["existing", "new1", "new2"]);
		expect(addedTags).toEqual(["new1", "new2"]);
		expect(frontmatter.tags).toEqual(["existing", "new1", "new2"]);
	});

	it("creates the field when it doesn't exist yet, without touching other frontmatter keys", async () => {
		const { app, frontmatter } = mockAppWithFrontmatter({ title: "My Note" });
		const file = {} as import("obsidian").TFile;

		await appendFrontmatterTags(app, file, "tags", ["a"], { maxCount: 5 });

		expect(frontmatter.title).toBe("My Note");
		expect(frontmatter.tags).toEqual(["a"]);
	});

	it("reports no added tags when every candidate already exists", async () => {
		const { app } = mockAppWithFrontmatter({ tags: ["a", "b"] });
		const file = {} as import("obsidian").TFile;

		const { addedTags } = await appendFrontmatterTags(app, file, "tags", ["a"], { maxCount: 5 });

		expect(addedTags).toEqual([]);
	});
});
