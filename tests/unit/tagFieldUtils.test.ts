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
	it("keeps all existing tags and fills remaining capacity with new ones by default (weight=1)", () => {
		const result = mergeTagLists(["a", "b"], ["c", "d", "e"], { maxCount: 4 });
		expect(result).toEqual(["a", "b", "c", "d"]);
	});

	it("never exceeds maxCount", () => {
		const result = mergeTagLists(["a", "b", "c"], ["d", "e"], { maxCount: 3 });
		expect(result.length).toBeLessThanOrEqual(3);
	});

	it("does not duplicate a candidate that already exists (case-insensitive)", () => {
		const result = mergeTagLists(["Movies"], ["movies", "action"], { maxCount: 5 });
		expect(result).toEqual(["Movies", "action"]);
	});

	it("weight=0 prioritizes new candidates, backfilling with existing tags if room remains", () => {
		const result = mergeTagLists(["old"], ["new"], { maxCount: 3, weight: 0 });
		expect(result).toEqual(["new", "old"]);
	});

	it("weight=0 can drop existing tags once at capacity", () => {
		const result = mergeTagLists(["old1", "old2", "old3"], ["new1", "new2", "new3"], { maxCount: 3, weight: 0 });
		expect(result).toEqual(["new1", "new2", "new3"]);
	});

	it("weight=0.5 splits capacity between existing and new", () => {
		const result = mergeTagLists(["e1", "e2", "e3", "e4"], ["n1", "n2", "n3", "n4"], { maxCount: 4, weight: 0.5 });
		expect(result).toEqual(["e1", "e2", "n1", "n2"]);
	});

	it("never drops existing tags when maxCount has room for everything, even at weight=0", () => {
		const result = mergeTagLists(["e1", "e2", "e3"], ["n1"], { maxCount: 4, weight: 0 });
		expect(result.slice().sort()).toEqual(["e1", "e2", "e3", "n1"].sort());
	});

	it("normalizes both existing and candidate tags", () => {
		const result = mergeTagLists(["#Old Tag"], ["#New Tag"], { maxCount: 4 });
		expect(result).toEqual(["Old-Tag", "New-Tag"]);
	});

	it("returns an empty array when maxCount is 0", () => {
		expect(mergeTagLists(["a"], ["b"], { maxCount: 0 })).toEqual([]);
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
