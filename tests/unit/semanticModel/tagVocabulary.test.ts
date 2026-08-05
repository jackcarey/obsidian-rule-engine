import { describe, it, expect } from "vitest";
import { getVaultTagVocabulary } from "../../../src/semanticModel/tagVocabulary";

interface MockFileCache {
	tags?: Array<{ tag: string }>;
	frontmatter?: Record<string, unknown>;
}

function mockApp(filesCaches: MockFileCache[]) {
	const files = filesCaches.map((_, i) => ({ path: `note${i}.md` } as unknown as import("obsidian").TFile));
	return {
		vault: {
			getMarkdownFiles: () => files,
		},
		metadataCache: {
			getFileCache: (file: import("obsidian").TFile) => {
				const index = files.indexOf(file);
				return filesCaches[index];
			},
		},
	} as unknown as import("obsidian").App;
}

describe("getVaultTagVocabulary", () => {
	it("collects body tags, stripping the leading #", () => {
		const app = mockApp([{ tags: [{ tag: "#movies" }, { tag: "#action" }] }]);
		expect(getVaultTagVocabulary(app)).toEqual(["action", "movies"]);
	});

	it("collects frontmatter tags given as an array", () => {
		const app = mockApp([{ frontmatter: { tags: ["books", "fiction"] } }]);
		expect(getVaultTagVocabulary(app)).toEqual(["books", "fiction"]);
	});

	it("collects frontmatter tags given as a single string", () => {
		const app = mockApp([{ frontmatter: { tags: "solo" } }]);
		expect(getVaultTagVocabulary(app)).toEqual(["solo"]);
	});

	it("dedupes across body and frontmatter tags, case-insensitively", () => {
		const app = mockApp([
			{ tags: [{ tag: "#Movies" }] },
			{ frontmatter: { tags: ["movies"] } },
		]);
		expect(getVaultTagVocabulary(app)).toEqual(["Movies"]);
	});

	it("returns tags sorted alphabetically", () => {
		const app = mockApp([{ tags: [{ tag: "#zebra" }, { tag: "#apple" }] }]);
		expect(getVaultTagVocabulary(app)).toEqual(["apple", "zebra"]);
	});

	it("returns an empty array when the vault has no tags", () => {
		const app = mockApp([{}]);
		expect(getVaultTagVocabulary(app)).toEqual([]);
	});
});
