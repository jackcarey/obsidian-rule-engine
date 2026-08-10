import type { Page } from "@playwright/test";
import { expect, openNote, test } from "./fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

const AUTO_MOC_ID = "generate-auto-moc";
const SOURCE_NOTE = "moc-source.md";
const NO_TAGS_NOTE = "moc-no-tags.md";

const SOURCE_ORIGINAL_CONTENT = [
	"---",
	"tags:",
	"  - moc-a",
	"  - moc-b",
	"---",
	"",
	"# MOC Source",
	"",
	"Some intro text.",
	"",
	"## Related notes",
	"",
	"placeholder",
	"",
	"## Footer",
	"",
	"keep this",
	"",
].join("\n");

const NO_TAGS_ORIGINAL_CONTENT = [
	"# MOC No Tags",
	"",
	"## Related notes",
	"",
	"should stay untouched",
	"",
].join("\n");

type CommandParams = Record<string, unknown>;

async function configureCommand(page: Page, params: CommandParams): Promise<void> {
	await page.evaluate(
		async ({ params }) => {
			const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
				updateCommandConfig(id: string, cfg: { enabled: boolean; params: CommandParams }): Promise<void>;
			};
			await plugin.updateCommandConfig("generate-auto-moc", { enabled: true, params });
		},
		{ params }
	);
}

async function disableCommand(page: Page): Promise<void> {
	await page.evaluate(async (id) => {
		const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
			updateCommandConfig(id: string, cfg: { enabled: boolean }): Promise<void>;
		};
		await plugin.updateCommandConfig(id, { enabled: false });
	}, AUTO_MOC_ID);
}

async function runCommand(page: Page): Promise<void> {
	const ok = await page.evaluate((id) => {
		const app = window.app as unknown as { commands: { executeCommandById(id: string): boolean } };
		return app.commands.executeCommandById(`rule-engine:${id}`);
	}, AUTO_MOC_ID);
	expect(ok, "auto-moc command should be found and its check pass").toBe(true);
}

async function getFileContent(page: Page, filename: string): Promise<string> {
	return page.evaluate(async (name) => {
		const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
		if (!file) throw new Error(`File not found: ${name}`);
		const app = window.app as unknown as { vault: { read(f: unknown): Promise<string> } };
		return app.vault.read(file);
	}, filename);
}

async function setFileContent(page: Page, filename: string, content: string): Promise<void> {
	await page.evaluate(
		async ({ name, content }) => {
			const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
			if (!file) throw new Error(`File not found: ${name}`);
			const app = window.app as unknown as { vault: { modify(f: unknown, data: string): Promise<void> } };
			await app.vault.modify(file, content);
		},
		{ name: filename, content }
	);
}

async function waitForContentChange(page: Page, filename: string, original: string, timeoutMs: number): Promise<string> {
	const start = Date.now();
	let content = await getFileContent(page, filename);
	while (content === original && Date.now() - start < timeoutMs) {
		await page.waitForTimeout(300);
		content = await getFileContent(page, filename);
	}
	return content;
}

test.beforeEach(async ({ page }) => {
	await setFileContent(page, SOURCE_NOTE, SOURCE_ORIGINAL_CONTENT);
	await setFileContent(page, NO_TAGS_NOTE, NO_TAGS_ORIGINAL_CONTENT);
});

test.afterEach(async ({ page }) => {
	await disableCommand(page);
	await setFileContent(page, SOURCE_NOTE, SOURCE_ORIGINAL_CONTENT);
	await setFileContent(page, NO_TAGS_NOTE, NO_TAGS_ORIGINAL_CONTENT);
});

// ── Tests ────────────────────────────────────────────────────────────────────

test("'any' mode lists every note sharing at least one tag, under the existing heading", async ({ page }) => {
	await configureCommand(page, { mode: "any", heading: "Related notes" });
	await openNote(page, SOURCE_NOTE);

	await runCommand(page);
	const content = await waitForContentChange(page, SOURCE_NOTE, SOURCE_ORIGINAL_CONTENT, 15000);

	expect(content).toContain("[[moc-match-any]]");
	expect(content).toContain("[[moc-match-all]]");
	expect(content).not.toContain("[[moc-no-match]]");
	// Other sections are untouched.
	expect(content).toContain("Some intro text.");
	expect(content).toContain("## Footer\n\nkeep this");
	// Stale placeholder content is gone.
	expect(content).not.toContain("placeholder");
});

test("'all' mode only lists notes that have every one of the source's tags", async ({ page }) => {
	await configureCommand(page, { mode: "all", heading: "Related notes" });
	await openNote(page, SOURCE_NOTE);

	await runCommand(page);
	const content = await waitForContentChange(page, SOURCE_NOTE, SOURCE_ORIGINAL_CONTENT, 15000);

	expect(content).toContain("[[moc-match-all]]");
	expect(content).not.toContain("[[moc-match-any]]");
	expect(content).not.toContain("[[moc-no-match]]");
});

test("heading matching is case-insensitive and updates the same section", async ({ page }) => {
	await configureCommand(page, { mode: "any", heading: "RELATED NOTES" });
	await openNote(page, SOURCE_NOTE);

	await runCommand(page);
	const content = await waitForContentChange(page, SOURCE_NOTE, SOURCE_ORIGINAL_CONTENT, 15000);

	// Original casing of the heading itself is preserved - only its content changed.
	expect(content).toContain("## Related notes");
	expect((content.match(/related notes/gi) ?? []).length).toBe(1);
	expect(content).toContain("[[moc-match-any]]");
});

test("creates the heading when it doesn't exist, at the default level (2)", async ({ page }) => {
	const noHeadingContent = ["---", "tags:", "  - moc-a", "---", "", "# Title", "", "## Existing", "", "body text", ""].join("\n");
	await setFileContent(page, SOURCE_NOTE, noHeadingContent);
	await configureCommand(page, { mode: "any", heading: "New Links" });
	await openNote(page, SOURCE_NOTE);

	await runCommand(page);
	const content = await waitForContentChange(page, SOURCE_NOTE, noHeadingContent, 15000);

	expect(content).toContain("## New Links");
	expect(content).toContain("[[moc-match-any]]");
	// Existing content untouched.
	expect(content).toContain("## Existing");
	expect(content).toContain("body text");
});

test("creates the heading at a configured custom level", async ({ page }) => {
	const noHeadingContent = ["---", "tags:", "  - moc-a", "---", "", "# Title", "", "## Existing", "", "body text", ""].join("\n");
	await setFileContent(page, SOURCE_NOTE, noHeadingContent);
	await configureCommand(page, { mode: "any", heading: "New Links", headingLevel: 4 });
	await openNote(page, SOURCE_NOTE);

	await runCommand(page);
	const content = await waitForContentChange(page, SOURCE_NOTE, noHeadingContent, 15000);

	expect(content).toContain("#### New Links");
	// "#### New Links" contains "## New Links" as a raw substring (the last two
	// hashes + text), so this must check for a *line* that's exactly level 2,
	// not use toContain.
	expect(content).not.toMatch(/^## New Links$/m);
	expect(content).toContain("[[moc-match-any]]");
});

test("running twice is idempotent - content doesn't drift or duplicate", async ({ page }) => {
	await configureCommand(page, { mode: "any", heading: "Related notes" });
	await openNote(page, SOURCE_NOTE);

	await runCommand(page);
	const firstRun = await waitForContentChange(page, SOURCE_NOTE, SOURCE_ORIGINAL_CONTENT, 15000);

	await runCommand(page);
	await page.waitForTimeout(1000);
	const secondRun = await getFileContent(page, SOURCE_NOTE);

	expect(secondRun).toBe(firstRun);
});

test("does nothing when the active file has no tags", async ({ page }) => {
	await configureCommand(page, { mode: "any", heading: "Related notes" });
	await openNote(page, NO_TAGS_NOTE);

	await runCommand(page);
	await page.waitForTimeout(1500);

	const content = await getFileContent(page, NO_TAGS_NOTE);
	expect(content).toBe(NO_TAGS_ORIGINAL_CONTENT);
});
