import { describe, expect, it } from "vitest";
import { describeSample, findSample, referenceCandidates } from "../../src/sampleValue";

type F = import("obsidian").TFile;
type A = import("obsidian").App;

const file = (path: string, extra: Record<string, unknown> = {}) =>
	({
		path,
		name: path.split("/").pop(),
		basename: (path.split("/").pop() ?? "").replace(/\.[^.]+$/, ""),
		extension: path.split(".").pop(),
		stat: { ctime: new Date(2026, 0, 5).getTime(), mtime: new Date(2026, 1, 9).getTime(), size: 1234 },
		parent: { path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "" },
		...extra,
	}) as unknown as F;

const app = (opts: {
	frontmatter?: Record<string, unknown>;
	tags?: Array<{ tag: string }>;
	embeds?: Array<{ link: string }>;
	resolvedLinks?: Record<string, Record<string, number>>;
} = {}) =>
	({
		metadataCache: {
			getFileCache: () => ({
				frontmatter: opts.frontmatter,
				tags: opts.tags ?? [],
				embeds: opts.embeds ?? [],
			}),
			resolvedLinks: opts.resolvedLinks ?? {},
		},
	}) as unknown as A;

describe("referenceCandidates", () => {
	const paths = (files: F[]) => files.map((f) => f.path);
	const none = () => null;

	it("orders active, then recents, then the rest newest-edited first", () => {
		const active = file("Notes/a.md");
		const recent = file("r.md");
		const older = file("old.md", { stat: { ctime: 0, mtime: 1, size: 1 } });
		const newer = file("new.md", { stat: { ctime: 0, mtime: 99, size: 1 } });
		const lookup = (p: string) => (p === "r.md" ? recent : null);
		expect(paths(referenceCandidates(active, ["r.md"], lookup, [older, newer, active, recent]))).toEqual([
			"Notes/a.md",
			"r.md",
			"new.md",
			"old.md",
		]);
	});
	it("skips non-markdown and missing files", () => {
		const md = file("b.md");
		const out = referenceCandidates(file("x.canvas"), ["gone.md"], none, [md, file("y.pdf")]);
		expect(paths(out)).toEqual(["b.md"]);
	});
	it("returns nothing when there are no notes", () => {
		expect(referenceCandidates(null, [], none, [])).toEqual([]);
	});
});

describe("findSample", () => {
	it("uses the first file that has a value", () => {
		const withValue = file("has.md");
		const without = file("none.md");
		const a = {
			metadataCache: {
				getFileCache: (f: F) => ({ frontmatter: f.path === "has.md" ? { status: "done" } : {} }),
				resolvedLinks: {},
			},
		} as unknown as A;
		const found = findSample(a, [without, withValue], "status");
		expect(found?.text).toBe("done");
		expect(found?.file.path).toBe("has.md");
	});
	it("prefers the first file when it has a value", () => {
		const a = app({ frontmatter: { status: "x" } });
		expect(findSample(a, [file("one.md"), file("two.md")], "status")?.file.path).toBe("one.md");
	});
	it("returns null when no file has one", () => {
		expect(findSample(app(), [file("a.md"), file("b.md")], "missing")).toBeNull();
		expect(findSample(app(), [], "file.name")).toBeNull();
	});
});

describe("describeSample", () => {
	const f = file("Notes/Sub/note.md");
	it("describes file properties", () => {
		const a = app();
		expect(describeSample(a, f, "file.name")).toBe("note.md");
		expect(describeSample(a, f, "file.basename")).toBe("note");
		expect(describeSample(a, f, "file.extension")).toBe("md");
		expect(describeSample(a, f, "file.folder")).toBe("Notes/Sub");
		expect(describeSample(a, f, "file.size")).toBe("1234 bytes");
		expect(describeSample(a, f, "file.ctime")).toBe("2026-01-05");
		expect(describeSample(a, f, "file.mtime")).toBe("2026-02-09");
	});
	it("uses / for a root-level folder", () => {
		expect(describeSample(app(), file("root.md"), "file.folder")).toBe("/");
	});
	it("counts and lists links", () => {
		const a = app({
			resolvedLinks: {
				"Notes/Sub/note.md": { "a.md": 1, "b.md": 1, "c.md": 1, "d.md": 1 },
				"x.md": { "Notes/Sub/note.md": 1 },
			},
		});
		expect(describeSample(a, f, "file.outlinks")).toBe("4");
		expect(describeSample(a, f, "file.inlinks")).toBe("1");
		expect(describeSample(a, f, "file.links")).toBe("a.md, b.md, c.md (+1 more)");
		expect(describeSample(a, f, "file.backlinks")).toBe("x.md");
	});
	it("gives no example for empty lists so the search can move on", () => {
		const a = app();
		expect(describeSample(a, f, "file.embeds")).toBeNull();
		expect(describeSample(a, f, "file tags")).toBeNull();
		expect(describeSample(a, f, "aliases")).toBeNull();
		expect(describeSample(a, f, "file.links")).toBeNull();
		expect(describeSample(a, f, "file.backlinks")).toBeNull();
	});
	it("summarises the bare file field", () => {
		const a = app({ frontmatter: { status: "x", position: {} }, tags: [{ tag: "#one" }] });
		const text = describeSample(a, f, "file") ?? "";
		expect(text).toContain("folder: Notes/Sub");
		expect(text).toContain("tags: one");
		expect(text).toContain("properties: status");
		expect(text).not.toContain("position");
	});
	it("reads frontmatter properties", () => {
		const a = app({ frontmatter: { status: "draft", list: ["a", "b"], n: 3, empty: "" } });
		expect(describeSample(a, f, "status")).toBe("draft");
		expect(describeSample(a, f, "list")).toBe("a, b");
		expect(describeSample(a, f, "n")).toBe("3");
		expect(describeSample(a, f, "empty")).toBeNull();
		expect(describeSample(a, f, "missing")).toBeNull();
	});
	it("handles a single-string alias", () => {
		expect(describeSample(app({ frontmatter: { aliases: "Alt" } }), f, "aliases")).toBe("Alt");
	});
	it("truncates long values", () => {
		const long = "x".repeat(200);
		const out = describeSample(app({ frontmatter: { s: long } }), f, "s") ?? "";
		expect(out.length).toBeLessThanOrEqual(80);
		expect(out.endsWith("…")).toBe(true);
	});
});
