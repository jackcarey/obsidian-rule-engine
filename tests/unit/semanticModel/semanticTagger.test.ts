import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeSemanticCandidates } from "../../../src/semanticModel/semanticTagger";

const embedTextsMock = vi.fn<(texts: string[]) => Promise<number[][]>>();

// vi.mock calls are hoisted above imports by vitest, so this applies before
// semanticTagger.ts's own `import { embedTexts } from "./semanticModel"` resolves.
vi.mock("../../../src/semanticModel/semanticModel", () => ({
	embedTexts: (texts: string[]) => embedTextsMock(texts),
}));

// Deterministic stand-in for real embeddings: texts containing a keyword
// point in a distinct 2D direction so cosine similarity is easy to reason about.
function fakeVector(text: string): number[] {
	if (text.includes("cat")) return [1, 0];
	if (text.includes("dog")) return [0, 1];
	return [0.5, 0.5];
}

interface MockFileCache {
	tags?: Array<{ tag: string }>;
	frontmatter?: Record<string, unknown>;
}

function mockApp(vocabularySources: MockFileCache[], targetContent: string) {
	const vocabFiles = vocabularySources.map((_, i) => ({ path: `vocab${i}.md` } as unknown as import("obsidian").TFile));
	return {
		vault: {
			getMarkdownFiles: () => vocabFiles,
			cachedRead: async () => targetContent,
		},
		metadataCache: {
			getFileCache: (file: import("obsidian").TFile) => {
				const index = vocabFiles.indexOf(file);
				return vocabularySources[index];
			},
		},
	} as unknown as import("obsidian").App;
}

function mockTargetFile(basename = "note"): import("obsidian").TFile {
	return { path: `${basename}.md`, basename } as unknown as import("obsidian").TFile;
}

beforeEach(() => {
	embedTextsMock.mockReset();
	embedTextsMock.mockImplementation(async (texts: string[]) => texts.map(fakeVector));
});

describe("computeSemanticCandidates", () => {
	// Each test uses its own tag names - the tag-embedding cache is
	// module-level (by design, see semanticTagger.ts), so distinct names keep
	// tests independent of execution order.

	it("ranks the vault's existing tags by similarity to the note's content", async () => {
		const app = mockApp(
			[
				{ frontmatter: { tags: ["cats-a"] } },
				{ frontmatter: { tags: ["dogs-a"] } },
				{ frontmatter: { tags: ["birds-a"] } },
			],
			"a note about my pet cat",
		);

		const result = await computeSemanticCandidates(app, mockTargetFile(), { maxCandidates: 10 });

		expect(result).toEqual(["cats-a", "birds-a", "dogs-a"]);
	});

	it("respects maxCandidates", async () => {
		const app = mockApp(
			[{ frontmatter: { tags: ["cats-b"] } }, { frontmatter: { tags: ["dogs-b"] } }, { frontmatter: { tags: ["birds-b"] } }],
			"cat content",
		);

		const result = await computeSemanticCandidates(app, mockTargetFile(), { maxCandidates: 1 });

		expect(result).toEqual(["cats-b"]);
	});

	it("returns an empty array without embedding anything when the vault has no existing tags", async () => {
		const app = mockApp([], "cat content");

		const result = await computeSemanticCandidates(app, mockTargetFile(), { maxCandidates: 5 });

		expect(result).toEqual([]);
		expect(embedTextsMock).not.toHaveBeenCalled();
	});

	it("caches tag embeddings across calls, only embedding newly seen tags", async () => {
		const app = mockApp([{ frontmatter: { tags: ["cats-c"] } }], "cat content");

		await computeSemanticCandidates(app, mockTargetFile("first"), { maxCandidates: 5 });
		embedTextsMock.mockClear();
		await computeSemanticCandidates(app, mockTargetFile("second"), { maxCandidates: 5 });

		// Second call should only re-embed the note text, not "cats-c" again.
		const tagBatchCalls = embedTextsMock.mock.calls.filter(([texts]) => texts.includes("cats-c"));
		expect(tagBatchCalls.length).toBe(0);
	});
});
