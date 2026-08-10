import {
  expect,
  openEditRuleModal,
  openPluginSettings,
  test,
} from "./fixtures";

// Visual regression coverage for the combobox-styled command picker modal -
// its positioning/background are set as inline styles (see comboSuggestModal.ts)
// specifically to beat Obsidian's own inline modal-animation styles, which is
// easy to silently break. These baselines catch that without needing exact
// pixel-value assertions in JS.
//
// Baselines are platform-sensitive (font rendering differs between the CI
// Docker/Linux image and local dev) - regenerate them by running this file
// inside Dockerfile.e2e with --update-snapshots, not locally on Windows.

test("visual: command picker combobox opens as a compact anchored dropdown", async ({
  page,
}) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);

  const commandsRow = settingsPage.locator(".setting-item", {
    hasText: "Commands",
  });
  await commandsRow.locator("button", { hasText: "Add" }).click();
  await settingsPage.waitForTimeout(200);
  const commandRowButton = settingsPage
    .locator(".ore-command-id-list-item button")
    .first();
  await commandRowButton.click();
  await settingsPage.waitForSelector(".ore-suggestion-container", {
    timeout: 5000,
  });
  await settingsPage.waitForTimeout(300);

  await expect(
    settingsPage.locator(".ore-suggestion-container"),
  ).toHaveScreenshot("combobox-open.png");

  // Typing exercises the clear-button show/hide toggle.
  await settingsPage.keyboard.type("process");
  await settingsPage.waitForTimeout(200);
  await expect(
    settingsPage.locator(".ore-suggestion-container"),
  ).toHaveScreenshot("combobox-typed.png");

  await settingsPage.keyboard.press("Escape");
  await settingsPage.waitForTimeout(200);
  await settingsPage
    .locator(".ore-edit-rule-modal button", { hasText: "Cancel" })
    .click();
  await settingsPage.close();
});

test("visual: a normal modal isn't left transparent after the combobox reuses modal-container", async ({
  page,
}) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);

  // Open and close the combobox first - it sets inline styles on the shared
  // .modal-container/.modal-bg elements Obsidian reuses across modals.
  const commandsRow = settingsPage.locator(".setting-item", {
    hasText: "Commands",
  });
  await commandsRow.locator("button", { hasText: "Add" }).click();
  await settingsPage.waitForTimeout(200);
  await settingsPage
    .locator(".ore-command-id-list-item button")
    .first()
    .click();
  await settingsPage.waitForSelector(".ore-suggestion-container", {
    timeout: 5000,
  });
  await settingsPage.keyboard.press("Escape");
  await settingsPage.waitForTimeout(200);
  await settingsPage
    .locator(".ore-edit-rule-modal button", { hasText: "Cancel" })
    .click();
  await settingsPage.waitForTimeout(200);

  // Now open a plain, unrelated modal that reuses the same container/bg.
  await settingsPage.locator('[aria-label="Add new rule"]').click();
  await settingsPage.waitForSelector(".ore-edit-rule-modal", { timeout: 5000 });
  await settingsPage.waitForTimeout(300);

  await expect(settingsPage.locator(".modal-container")).toHaveScreenshot(
    "modal-after-combobox-reuse.png",
  );

  await settingsPage
    .locator(".ore-edit-rule-modal button", { hasText: "Cancel" })
    .click();
  await settingsPage.close();
});
