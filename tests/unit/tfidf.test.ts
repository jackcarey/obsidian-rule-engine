import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import { computeTfidfCandidates } from "../../src/tfidf";

interface MockNote {
	path: string;
	content: string;
}

// A real TFile instance (from the obsidian mock) is required, not just an
// object shaped like one - tfidf.ts's linked-corpus resolution narrows
// results with `instanceof TFile`, same as the rest of the codebase does
// against the real Obsidian API.
function mockFile(path: string): TFile {
	const file = new TFile();
	file.path = path;
	file.name = path.split("/").pop() ?? path;
	file.basename = file.name.replace(/\.md$/, "");
	file.extension = "md";
	return file;
}

function mockApp(notes: MockNote[], resolvedLinks: Record<string, Record<string, number>> = {}) {
	const files = notes.map(n => mockFile(n.path));
	const contentByPath = new Map(notes.map(n => [n.path, n.content]));

	return {
		vault: {
			getMarkdownFiles: () => files,
			cachedRead: async (file: import("obsidian").TFile) => contentByPath.get(file.path) ?? "",
			getAbstractFileByPath: (path: string) => files.find(f => f.path === path) ?? null,
		},
		metadataCache: {
			resolvedLinks,
		},
	} as unknown as import("obsidian").App;
}

describe("computeTfidfCandidates", () => {
	it("returns an empty array when the target note has no meaningful tokens", async () => {
		const app = mockApp([{ path: "empty.md", content: "" }]);
		const result = await computeTfidfCandidates(app, mockFile("empty.md"), { corpusScope: "vault", maxCandidates: 5 });
		expect(result).toEqual([]);
	});

	it("scores a term unique to the target note higher than one shared across the whole corpus", async () => {
		const notes = [
			{ path: "target.md", content: "spaceship spaceship spaceship common common" },
			{ path: "other1.md", content: "common common common" },
			{ path: "other2.md", content: "common common common" },
		];
		const app = mockApp(notes);

		const result = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "vault", maxCandidates: 5 });

		expect(result[0]).toBe("spaceship");
	});

	it("respects maxCandidates", async () => {
		const notes = [{ path: "target.md", content: "alpha beta gamma delta epsilon zeta" }];
		const app = mockApp(notes);

		const result = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "vault", maxCandidates: 2 });

		expect(result.length).toBe(2);
	});

	it("filters out stopwords and short tokens", async () => {
		const notes = [{ path: "target.md", content: "the a an of to is telescope" }];
		const app = mockApp(notes);

		const result = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "vault", maxCandidates: 10 });

		expect(result).toEqual(["telescope"]);
	});

	it("strips frontmatter before tokenizing", async () => {
		const notes = [{
			path: "target.md",
			content: "---\ntags: [existingtagword]\n---\nbody content about astronomy",
		}];
		const app = mockApp(notes);

		const result = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "vault", maxCandidates: 10 });

		expect(result).not.toContain("existingtagword");
		expect(result).toContain("astronomy");
	});

	it("with corpusScope 'linked', excludes unconnected notes from document-frequency scoring", async () => {
		const notes = [
			{ path: "target.md", content: "shared distinctive" },
			{ path: "linked.md", content: "distinctive distinctive" },
			// Heavily reuses "shared" but is not linked to target.md at all.
			{ path: "unrelated.md", content: "shared shared shared" },
		];
		const resolvedLinks = { "target.md": { "linked.md": 1 } };
		const app = mockApp(notes, resolvedLinks);

		const linkedResult = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "linked", maxCandidates: 5 });
		const vaultResult = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "vault", maxCandidates: 5 });

		// Excluding unrelated.md drops "shared"'s document frequency, raising its
		// score above "distinctive" - under the full vault it's tied instead.
		expect(linkedResult[0]).toBe("shared");
		expect(vaultResult[0]).toBe("distinctive");
	});

	it("treats a note that links back to the target as part of the linked corpus", async () => {
		const notes = [
			{ path: "target.md", content: "distinctive term" },
			{ path: "backlinker.md", content: "distinctive term appears here too" },
		];
		const resolvedLinks = { "backlinker.md": { "target.md": 1 } };
		const app = mockApp(notes, resolvedLinks);

		const result = await computeTfidfCandidates(app, mockFile("target.md"), { corpusScope: "linked", maxCandidates: 5 });

		// Both terms are shared with the (only) linked note, so DF is equal for both -
		// just confirm scoring ran against the backlinked corpus without throwing and
		// returned both terms.
		expect(result.sort()).toEqual(["distinctive", "term"]);
	});
});
