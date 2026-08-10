import {
  type Browser,
  test as base,
  chromium,
  type Page,
} from "@playwright/test";
import { CDP_PORT } from "./global-setup";

declare global {
  interface Window {
    app: {
      workspace: {
        containerEl: HTMLElement;
        getActiveFile(): {
          path: string;
          name: string;
          basename: string;
        } | null;
        openLinkText(linkText: string, sourcePath: string): Promise<void>;
        getLeaf(newLeaf?: boolean): { view: { getViewType(): string } };
      };
      vault: {
        getMarkdownFiles(): Array<{
          path: string;
          name: string;
          basename: string;
        }>;
      };
      plugins: {
        plugins: Record<
          string,
          { settings: Record<string, unknown> } | undefined
        >;
        manifests: Record<string, { version: string }>;
        loadErrors: Record<string, string>;
      };
    };
  }
}

type WorkerFixtures = { obsidianBrowser: Browser };
type TestFixtures = { page: Page };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Shared per-worker browser connection to Obsidian
  obsidianBrowser: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the literal destructuring pattern here
    async ({ }, use) => {
      const browser = await chromium.connectOverCDP(
        `http://localhost:${CDP_PORT}`,
      );
      await use(browser);
      // close() disconnects CDP without killing Obsidian
      await browser.close();
    },
    { scope: "worker" },
  ],

  // Per-test page - resolves to the live Obsidian window
  page: async ({ obsidianBrowser }, use) => {
    const context = obsidianBrowser.contexts()[0];
    let page = context.pages().find((p) => p.url().includes("obsidian.md"));
    if (!page) {
      page = await context.waitForEvent("page", {
        predicate: (p) => p.url().includes("obsidian.md"),
        timeout: 15000,
      });
    }
    // Wait for Obsidian workspace to be fully ready
    await page.waitForFunction(() => !!window.app?.workspace?.containerEl, {
      timeout: 30000,
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Open a note by its filename (e.g. "matched-file.md") via Obsidian's API. */
export async function openNote(page: Page, filename: string): Promise<void> {
  await page.evaluate(async (name) => {
    const file = window.app.vault
      .getMarkdownFiles()
      .find((f) => f.name === name);
    if (!file) throw new Error(`File not found in vault: ${name}`);
    await window.app.workspace.openLinkText(file.path, "");
  }, filename);
  // Allow the view to render
  await page.waitForTimeout(800);
}

/**
 * Open Obsidian Settings then navigate to a named plugin/tab, and return the
 * Page the settings UI actually rendered into.
 *
 * As of Obsidian 1.13, Settings opens in its own popout OS window (a second
 * CDP target/Page) rather than as a `.modal-container` overlay in the main
 * window. That popout is a singleton - `setting.open()` re-shows the same
 * window on subsequent calls instead of creating a new one, so callers must
 * always use the returned Page for further interaction, not the original
 * `page` passed in.
 */
export async function openPluginSettings(
  page: Page,
  tabLabel: string,
): Promise<Page> {
  const context = page.context();

  await page.evaluate(() => {
    (window.app as unknown as { setting: { open(): void } }).setting?.open();
  });

  let settingsPage = context.pages().find((p) => p !== page);
  if (!settingsPage) {
    settingsPage = await context
      .waitForEvent("page", { timeout: 5000 })
      .catch(() => undefined);
  }
  // Fallback: some platforms/older Obsidian versions render settings inline
  // in the main window instead of a popout.
  if (!settingsPage) {
    await page.waitForSelector(".modal-container", { timeout: 10000 });
    settingsPage = page;
  } else {
    await settingsPage.waitForSelector(".mod-settings", { timeout: 10000 });
  }

  // Click the tab in the vertical nav
  await settingsPage.evaluate((label) => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".vertical-tab-nav-item"),
    );
    const tab = items.find((el) => el.textContent?.trim() === label);
    if (!tab) throw new Error(`Settings tab not found: ${label}`);
    tab.click();
  }, tabLabel);

  await settingsPage.waitForTimeout(400);
  return settingsPage;
}

/** Close any open modal (or nested modal within the settings window) by pressing Escape. */
export async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

/**
 * Close the settings window opened by {@link openPluginSettings}. If it's a
 * separate popout page, closes that window; if settings rendered inline in
 * the main page (fallback case), just presses Escape instead of closing the
 * whole Obsidian window.
 */
export async function closeSettings(
  settingsPage: Page,
  mainPage: Page,
): Promise<void> {
  if (settingsPage !== mainPage) {
    await settingsPage.close().catch(() => undefined);
  } else {
    await closeModal(settingsPage);
  }
}

/**
 * Click the edit (pencil) icon on the nth rule in the Rule Engine settings
 * list. The list's "Add new rule" affordance renders as the first
 * `.setting-item` row (it has no edit button), so this selects directly by
 * edit-button presence rather than indexing into all `.setting-item` rows.
 */
export async function openEditRuleModal(
  page: Page,
  ruleIndex = 0,
): Promise<void> {
  await page.evaluate((idx) => {
    const editButtons = document.querySelectorAll<HTMLElement>(
      '.ore-rule-list .setting-item button[aria-label="Edit rule"]',
    );
    const editBtn = editButtons[idx];
    if (!editBtn) throw new Error(`Rule at index ${idx} not found`);
    editBtn.click();
  }, ruleIndex);
  await page.waitForSelector(".ore-edit-rule-modal", { timeout: 5000 });
}

/**
 * Click the "Edit filters" button in an already-open edit rule modal and wait
 * for FilterModal (the standalone modal hosting the actual filter builder) to
 * open on top of it. The edit rule modal itself only shows a read-only
 * summary - the interactive .filter-row/.filter-group-header controls this
 * test suite drives all live inside FilterModal now.
 */
export async function openFilterModal(page: Page): Promise<void> {
  await page
    .locator(".ore-edit-rule-modal button", { hasText: "Edit filters" })
    .click();
  await page.waitForSelector(".ore-filter-modal", { timeout: 5000 });
}
