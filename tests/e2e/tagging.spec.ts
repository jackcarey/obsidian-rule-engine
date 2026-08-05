import type { Page } from "@playwright/test";
import { expect, openNote, test } from "./fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

const TFIDF_COMMAND_ID = "generate-tfidf-tags";
const SEMANTIC_COMMAND_ID = "generate-semantic-tags";
const FIXTURE_NOTE = "tag-generation-fixture.md";

type CommandParams = Record<string, unknown>;

/** Enables a rule-engine command and sets its params, via the plugin's own config API. */
async function configureCommand(page: Page, commandId: string, params: CommandParams): Promise<void> {
  await page.evaluate(
    async ({ commandId, params }) => {
      const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
        updateCommandConfig(id: string, cfg: { enabled: boolean; params: CommandParams }): Promise<void>;
      };
      await plugin.updateCommandConfig(commandId, { enabled: true, params });
    },
    { commandId, params }
  );
}

/** Restores a command back to disabled (the default) so later tests aren't affected. */
async function disableCommand(page: Page, commandId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      updateCommandConfig(id: string, cfg: { enabled: boolean }): Promise<void>;
    };
    await plugin.updateCommandConfig(id, { enabled: false });
  }, commandId);
}

/** Executes a rule-engine command by its short id (Obsidian prefixes it with the plugin id). */
async function runCommand(page: Page, commandId: string): Promise<void> {
  const ok = await page.evaluate((id) => {
    const app = window.app as unknown as { commands: { executeCommandById(id: string): boolean } };
    return app.commands.executeCommandById(`rule-engine:${id}`);
  }, commandId);
  expect(ok, `command "${commandId}" should be found and its check pass`).toBe(true);
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

/** Directly sets a note's frontmatter tags field via processFrontMatter, bypassing the UI. */
async function setFrontmatterTags(page: Page, filename: string, tags: string[]): Promise<void> {
  await page.evaluate(
    async ({ name, tags }) => {
      const file = window.app.vault.getMarkdownFiles().find((f) => f.name === name);
      if (!file) throw new Error(`File not found: ${name}`);
      const app = window.app as unknown as {
        fileManager: { processFrontMatter(f: unknown, fn: (fm: Record<string, unknown>) => void): Promise<void> };
      };
      await app.fileManager.processFrontMatter(file, (fm) => {
        fm.tags = tags;
      });
    },
    { name: filename, tags }
  );
}

/** Polls the note's frontmatter tags until the predicate passes or the timeout elapses. */
async function waitForTags(
  page: Page,
  filename: string,
  predicate: (tags: string[] | undefined) => boolean,
  timeoutMs: number
): Promise<string[] | undefined> {
  const start = Date.now();
  let tags = await getFrontmatterTags(page, filename);
  while (!predicate(tags) && Date.now() - start < timeoutMs) {
    await page.waitForTimeout(500);
    tags = await getFrontmatterTags(page, filename);
  }
  return tags;
}

test.beforeEach(async ({ page }) => {
  await setFrontmatterTags(page, FIXTURE_NOTE, ["existing-tag"]);
});

test.afterEach(async ({ page }) => {
  await disableCommand(page, TFIDF_COMMAND_ID);
  await disableCommand(page, SEMANTIC_COMMAND_ID);
  await setFrontmatterTags(page, FIXTURE_NOTE, ["existing-tag"]);
});

// ── TF-IDF tags ────────────────────────────────────────────────────────────

test("generate TF-IDF tags — appends a distinctive term without dropping the existing tag", async ({ page }) => {
  await configureCommand(page, TFIDF_COMMAND_ID, { frontmatterField: "tags", maxTags: 10, corpusScope: "vault" });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, TFIDF_COMMAND_ID);

  const tags = await waitForTags(page, FIXTURE_NOTE, (t) => !!t && t.length > 1, 15000);
  expect(tags).toContain("existing-tag");
  // "xylophone" is repeated throughout the fixture note and appears nowhere
  // else in the vault, so it should score highest and be included.
  expect(tags?.some((t) => t.toLowerCase().includes("xylophone"))).toBe(true);
});

test("generate TF-IDF tags — respects the max tag count", async ({ page }) => {
  await configureCommand(page, TFIDF_COMMAND_ID, { frontmatterField: "tags", maxTags: 2, corpusScope: "vault" });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, TFIDF_COMMAND_ID);

  const tags = await waitForTags(page, FIXTURE_NOTE, (t) => !!t && t.length >= 2, 15000);
  expect(tags?.length).toBeLessThanOrEqual(2);
});

test("generate TF-IDF tags — running twice does not keep growing the field past the limit", async ({ page }) => {
  await configureCommand(page, TFIDF_COMMAND_ID, { frontmatterField: "tags", maxTags: 3, corpusScope: "vault" });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, TFIDF_COMMAND_ID);
  await waitForTags(page, FIXTURE_NOTE, (t) => !!t && t.length >= 1, 15000);
  await runCommand(page, TFIDF_COMMAND_ID);
  await page.waitForTimeout(1000);

  const tags = await getFrontmatterTags(page, FIXTURE_NOTE);
  expect(tags?.length).toBeLessThanOrEqual(3);
});

test("generate TF-IDF tags — already at/over the max: adds nothing and removes nothing", async ({ page }) => {
  const overCapacity = ["existing-tag", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"];
  await setFrontmatterTags(page, FIXTURE_NOTE, overCapacity);
  await configureCommand(page, TFIDF_COMMAND_ID, { frontmatterField: "tags", maxTags: 5, corpusScope: "vault" });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, TFIDF_COMMAND_ID);
  await page.waitForTimeout(1500);

  const tags = await getFrontmatterTags(page, FIXTURE_NOTE);
  expect(tags).toEqual(overCapacity);
});

// ── Semantic tags ────────────────────────────────────────────────────────────
// The embedding model downloads from Hugging Face (and its WASM runtime
// instantiates) on first use inside the real Electron/Chromium window, so
// these are the tests that actually prove the runtime-download approach
// works, not just unit tests with the model mocked out. Generous timeouts
// account for a cold model download on top of a cold model load.

test("generate semantic tags — vocabularyWeight=1 only adds tags already used elsewhere in the vault", async ({ page }) => {
  test.setTimeout(150000);
  await configureCommand(page, SEMANTIC_COMMAND_ID, { frontmatterField: "tags", maxTags: 10, vocabularyWeight: 1 });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, SEMANTIC_COMMAND_ID);

  const tags = await waitForTags(page, FIXTURE_NOTE, (t) => !!t && t.length > 1, 120000);
  expect(tags).toContain("existing-tag");
  // "xylophone" appears nowhere else in the vault's tag vocabulary, so a
  // pure vocabularyWeight=1 run should never invent it.
  expect(tags?.some((t) => t.toLowerCase().includes("xylophone"))).toBe(false);
});

test("generate semantic tags — vocabularyWeight=0 invents tags from the file's own content instead of reusing the vault's", async ({ page }) => {
  test.setTimeout(150000);
  await configureCommand(page, SEMANTIC_COMMAND_ID, { frontmatterField: "tags", maxTags: 10, vocabularyWeight: 0 });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, SEMANTIC_COMMAND_ID);

  const tags = await waitForTags(page, FIXTURE_NOTE, (t) => !!t && t.length > 1, 120000);
  expect(tags).toContain("existing-tag");
  // With vocabularyWeight=0 every new tag comes from the TF-IDF-invented pool,
  // and "xylophone" is by far the fixture note's most distinctive term.
  expect(tags?.some((t) => t.toLowerCase().includes("xylophone"))).toBe(true);
});

test("generate semantic tags — respects the max tag count", async ({ page }) => {
  test.setTimeout(150000);
  await configureCommand(page, SEMANTIC_COMMAND_ID, { frontmatterField: "tags", maxTags: 2, vocabularyWeight: 1 });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, SEMANTIC_COMMAND_ID);

  await waitForTags(page, FIXTURE_NOTE, (t) => !!t && t.length >= 1, 120000);
  const tags = await getFrontmatterTags(page, FIXTURE_NOTE);
  expect(tags?.length).toBeLessThanOrEqual(2);
});

test("generate semantic tags — already at/over the max: adds nothing and removes nothing", async ({ page }) => {
  test.setTimeout(150000);
  const overCapacity = ["existing-tag", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"];
  await setFrontmatterTags(page, FIXTURE_NOTE, overCapacity);
  await configureCommand(page, SEMANTIC_COMMAND_ID, { frontmatterField: "tags", maxTags: 5, vocabularyWeight: 0.5 });
  await openNote(page, FIXTURE_NOTE);

  await runCommand(page, SEMANTIC_COMMAND_ID);
  await page.waitForTimeout(3000);

  const tags = await getFrontmatterTags(page, FIXTURE_NOTE);
  expect(tags).toEqual(overCapacity);
});
