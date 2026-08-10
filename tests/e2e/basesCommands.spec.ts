import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// A Base's query results are processed by ruleEngineBasesView.processView(),
// which - unlike a user pressing a hotkey - never goes through Obsidian's own
// app.commands.executeCommandById(). It calls plugin.executeCommands()
// directly, once per matched entry, sharing a single split-pane "group leaf"
// across the whole loop (open the entry's file into it, make it active, then
// run the command). That loop, and executeCommands()'s own doCmds() dispatch
// (including the editorCallback fallback for checkCallback/callback-less
// commands like taskDate), is exercised nowhere else in the test suite -
// every other command test drives the command via executeCommandById on
// whatever file the user already has open. This suite calls
// plugin.executeCommands() the same way processView() does, across two
// files in one run, to prove each command both works on that path and
// doesn't cross-contaminate between files sharing the same command loop.

const TASK_DATE_ID = "apply-task-due-date";
const AUTO_MOC_ID = "generate-auto-moc";
const TFIDF_TAGS_ID = "generate-tfidf-tags";

const FILE_A = "bases-cmd-a.md";
const FILE_B = "bases-cmd-b.md";

const PLACEHOLDER_A = "# Bases Command Test A\n\nPlaceholder content - overwritten by tests/e2e/basesCommands.spec.ts before each test.\n";
const PLACEHOLDER_B = "# Bases Command Test B\n\nPlaceholder content - overwritten by tests/e2e/basesCommands.spec.ts before each test.\n";

type CommandParams = Record<string, unknown>;

async function configureCommand(page: Page, commandId: string, params: CommandParams): Promise<void> {
	await page.evaluate(
		async ({ commandId, params }) => {
			const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
				updateCommandConfig(id: string, cfg: { enabled: boolean; params: CommandParams }): Promise<void>;
			};
			await plugin.updateCommandConfig(commandId, { enabled: true, params });
		},
		{ commandId, params },
	);
}

async function disableCommand(page: Page, commandId: string): Promise<void> {
	await page.evaluate(async (id) => {
		const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
			updateCommandConfig(id: string, cfg: { enabled: boolean }): Promise<void>;
		};
		await plugin.updateCommandConfig(id, { enabled: false });
	}, commandId);
}

async function setFileContent(page: Page, filename: string, content: string): Promise<void> {
	await page.evaluate(
		async ({ name, content }) => {
			const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
			if (!file) throw new Error(`File not found: ${name}`);
			const app = window.app as unknown as { vault: { modify(f: unknown, data: string): Promise<void> } };
			await app.vault.modify(file, content);
		},
		{ name: filename, content },
	);
}

async function getFileContent(page: Page, filename: string): Promise<string> {
	return page.evaluate(async (name) => {
		const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
		if (!file) throw new Error(`File not found: ${name}`);
		const app = window.app as unknown as { vault: { read(f: unknown): Promise<string> } };
		return app.vault.read(file);
	}, filename);
}

async function getFrontmatterTags(page: Page, filename: string): Promise<string[] | undefined> {
	return page.evaluate((name) => {
		const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
		if (!file) return undefined;
		const app = window.app as unknown as {
			metadataCache: { getFileCache(f: unknown): { frontmatter?: { tags?: string[] } } | null };
		};
		return app.metadataCache.getFileCache(file)?.frontmatter?.tags;
	}, filename);
}

/**
 * Runs a command against each of the given files via plugin.executeCommands()
 * directly - the same call ruleEngineBasesView.processView() makes per Base
 * query entry, sharing one group leaf across the whole loop and detaching it
 * afterward, same as the real integration.
 */
async function runViaBaseResultsPath(page: Page, commandId: string, filenames: string[]): Promise<void> {
	await page.evaluate(
		async ({ commandId, filenames }) => {
			const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
				executeCommands(mode: string, commandIds: string[], file?: unknown, groupLeaf?: unknown): Promise<void>;
			};
			const workspace = window.app.workspace as unknown as {
				getLeaf(newLeaf?: string, direction?: string): { setGroup(id: string): void; detach(): void };
			};
			const groupLeaf = workspace.getLeaf("split", "vertical");
			groupLeaf.setGroup("ore-leaf-group");
			try {
				for (const name of filenames) {
					const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
					if (!file) throw new Error(`File not found: ${name}`);
					// rule.commandIds (and this.obsidianCommands' keys) store the
					// full Obsidian-prefixed id, not the plugin's own short id -
					// see stripCommandIdPrefix's usage in main.ts.
					await plugin.executeCommands("file", [`rule-engine:${commandId}`], file, groupLeaf);
				}
			} finally {
				groupLeaf.detach();
			}
		},
		{ commandId, filenames },
	);
}

async function waitFor<T>(check: () => Promise<T>, predicate: (val: T) => boolean, timeoutMs: number): Promise<T> {
	const start = Date.now();
	let val = await check();
	while (!predicate(val) && Date.now() - start < timeoutMs) {
		await new Promise((r) => setTimeout(r, 300));
		val = await check();
	}
	return val;
}

test.afterEach(async ({ page }) => {
	await disableCommand(page, TASK_DATE_ID);
	await disableCommand(page, AUTO_MOC_ID);
	await disableCommand(page, TFIDF_TAGS_ID);
	await setFileContent(page, FILE_A, PLACEHOLDER_A);
	await setFileContent(page, FILE_B, PLACEHOLDER_B);
});

// ── Task date (editorCallback-only command - no checkCallback/callback) ────

test("task date fills each file's own tasks independently via the base-results path", async ({ page }) => {
	await setFileContent(page, FILE_A, "- [ ] Task A1\n- [ ] Task A2\n");
	await setFileContent(page, FILE_B, "- [ ] Task B1\n");
	await configureCommand(page, TASK_DATE_ID, {});

	await runViaBaseResultsPath(page, TASK_DATE_ID, [FILE_A, FILE_B]);

	const contentA = await waitFor(() => getFileContent(page, FILE_A), (c) => /📅/.test(c), 15000);
	const contentB = await waitFor(() => getFileContent(page, FILE_B), (c) => /📅/.test(c), 15000);

	expect(contentA).toMatch(/- \[ \] Task A1 📅 \d{4}-\d{2}-\d{2}/);
	expect(contentA).toMatch(/- \[ \] Task A2 📅 \d{4}-\d{2}-\d{2}/);
	// Cross-contamination check: A's tasks must not have leaked onto B, and B
	// must have been processed independently rather than skipped/duplicated.
	expect(contentA).not.toContain("Task B1");
	expect(contentB).toMatch(/- \[ \] Task B1 📅 \d{4}-\d{2}-\d{2}/);
	expect(contentB).not.toContain("Task A1");
});

// ── Auto MOC (checkCallback command) ────────────────────────────────────────

test("auto MOC gives each file its own distinct match set via the base-results path", async ({ page }) => {
	await setFileContent(
		page,
		FILE_A,
		["---", "tags:", "  - moc-a", "---", "", "## Related notes", "", "placeholder", ""].join("\n"),
	);
	await setFileContent(
		page,
		FILE_B,
		["---", "tags:", "  - moc-c", "---", "", "## Related notes", "", "placeholder", ""].join("\n"),
	);
	await configureCommand(page, AUTO_MOC_ID, { mode: "any", heading: "Related notes" });

	await runViaBaseResultsPath(page, AUTO_MOC_ID, [FILE_A, FILE_B]);

	const contentA = await waitFor(() => getFileContent(page, FILE_A), (c) => !c.includes("placeholder"), 15000);
	const contentB = await waitFor(() => getFileContent(page, FILE_B), (c) => !c.includes("placeholder"), 15000);

	// FILE_A is tagged moc-a: matches moc-match-any (moc-a) and moc-match-all
	// (moc-a, moc-b, moc-c), not moc-no-match (moc-z).
	expect(contentA).toContain("[[moc-match-any]]");
	expect(contentA).toContain("[[moc-match-all]]");
	expect(contentA).not.toContain("[[moc-no-match]]");
	// FILE_B is tagged moc-c: only moc-match-all carries that tag.
	expect(contentB).toContain("[[moc-match-all]]");
	expect(contentB).not.toContain("[[moc-match-any]]");
	expect(contentB).not.toContain("[[moc-no-match]]");
});

// ── TF-IDF tags (checkCallback command with its own tag-merge logic) ───────

test("TF-IDF tags scores each file against the vault independently via the base-results path", async ({ page }) => {
	await setFileContent(
		page,
		FILE_A,
		["---", "tags:", "  - existing-a", "---", "", "aardvark ".repeat(40)].join("\n"),
	);
	await setFileContent(
		page,
		FILE_B,
		["---", "tags:", "  - existing-b", "---", "", "zeppelin ".repeat(40)].join("\n"),
	);
	await configureCommand(page, TFIDF_TAGS_ID, { frontmatterField: "tags", maxTags: 5, corpusScope: "vault" });

	await runViaBaseResultsPath(page, TFIDF_TAGS_ID, [FILE_A, FILE_B]);

	const tagsA = await waitFor(() => getFrontmatterTags(page, FILE_A), (t) => !!t && t.length > 1, 15000);
	const tagsB = await waitFor(() => getFrontmatterTags(page, FILE_B), (t) => !!t && t.length > 1, 15000);

	expect(tagsA).toContain("existing-a");
	expect(tagsA?.some((t) => t.toLowerCase().includes("aardvark"))).toBe(true);
	expect(tagsA?.some((t) => t.toLowerCase().includes("zeppelin"))).toBe(false);

	expect(tagsB).toContain("existing-b");
	expect(tagsB?.some((t) => t.toLowerCase().includes("zeppelin"))).toBe(true);
	expect(tagsB?.some((t) => t.toLowerCase().includes("aardvark"))).toBe(false);
});
