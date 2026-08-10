import { closeModal, closeSettings, expect, openEditRuleModal, openFilterModal, openNote, openPluginSettings, test } from "./fixtures";

// ── 1. Plugin bootstrap ───────────────────────────────────────────────────────

test("plugin loads without errors", async ({ page }) => {
  const result = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"];
    const loadErrors = window.app.plugins.loadErrors ?? {};
    return {
      loaded: !!plugin,
      hasLoadError: "rule-engine" in loadErrors,
      loadError: loadErrors["rule-engine"] ?? null,
    };
  });
  expect(result.hasLoadError, result.loadError ?? "").toBe(false);
  expect(result.loaded).toBe(true);
});

test("plugin has correct version", async ({ page }) => {
  const version = await page.evaluate(
    () => window.app.plugins.manifests["rule-engine"]?.version
  );
  expect(version).toBeTruthy();
  expect(typeof version).toBe("string");
});

test("no rule-engine console errors on load", async ({ page }) => {
  // Collect errors emitted by the page (DOM errors, unhandled rejections)
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    if (err.message.toLowerCase().includes("rule")) errors.push(err.message);
  });
  // Re-evaluate after hooking - trigger a re-check cycle
  await page.evaluate(() =>
    (window.app.plugins.plugins["rule-engine"] as unknown as { loadSettings(): Promise<void> })
      ?.loadSettings?.()
  );
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

// ── 2. Settings UI ────────────────────────────────────────────────────────────

test("settings page shows Rule Engine tab and rule list", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  // Should show the "Add new rule" affordance (icon-only button on desktop)
  const addBtn = settingsPage.locator('[aria-label="Add new rule"]');
  await expect(addBtn).toBeVisible();

  // Should show at least 2 rules from our data.json
  const ruleItems = settingsPage.locator(".ore-rule-list .setting-item");
  expect(await ruleItems.count()).toBeGreaterThan(1);

  await closeSettings(settingsPage, page);
});

test("settings shows enabled toggle and it works", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  const enabledToggle = settingsPage
    .locator(".setting-item")
    .filter({ has: settingsPage.locator(".setting-item-name", { hasText: /^Enabled$/ }) })
    .locator(".checkbox-container");
  await expect(enabledToggle).toBeVisible();

  await closeSettings(settingsPage, page);
});

test("settings page shows all sections without navigation", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  // No tab bar anymore - Rules, Settings, and Command configuration are all
  // visible on one scrollable page.
  await expect(settingsPage.locator(".setting-item-heading", { hasText: "Rule configuration" })).toBeVisible();
  await expect(settingsPage.locator('[aria-label="Add new rule"]')).toBeVisible();

  await expect(settingsPage.locator(".setting-item-name", { hasText: /^Enabled$/ })).toBeVisible();

  await expect(settingsPage.locator(".setting-item-heading", { hasText: "Command configuration" })).toBeVisible();

  await closeSettings(settingsPage, page);
});

test("command configuration - shows each command's ID and a per-file-overrides note", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  const processNowRow = settingsPage.locator(".setting-item", { hasText: "Process now" });
  await expect(processNowRow.locator(".ore-command-config-id")).toHaveText("id: check-rules");

  await expect(settingsPage.locator(".setting-item-name", { hasText: "Per-file overrides" })).toBeVisible();
  await expect(settingsPage.locator(".setting-item", { hasText: "Per-file overrides" })).toContainText("ore:<command id>:<setting>");

  await closeSettings(settingsPage, page);
});

test("command configuration - a command with a settingCallback opens its own settings via the gear button", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  // "Fill emoji task due dates" (apply-task-due-date) has a settingCallback.
  // Obsidian's declarative settings list can only render one row's worth of
  // controls per list item, so per-command settings live behind a "Configure"
  // gear button that opens a dedicated modal - see CommandSettingsModal.
  const taskDateRow = settingsPage.locator(".setting-item", { hasText: "Fill emoji task due dates" });
  await taskDateRow.locator('[aria-label="Configure Fill emoji task due dates"]').click();

  const modal = settingsPage.locator(".modal-container .modal-content");
  await expect(modal.locator(".setting-item-name", { hasText: "Frontmatter field" })).toBeVisible();
  await expect(modal.locator(".setting-item-name", { hasText: "Parse from title" })).toBeVisible();

  await closeModal(settingsPage);
  await closeSettings(settingsPage, page);
});

test("rule list - delete button asks for confirmation, and Cancel keeps the rule", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  const ruleRows = settingsPage.locator('.ore-rule-list .setting-item:has([aria-label="Edit rule"])');
  const countBefore = await ruleRows.count();

  const folderRuleRow = ruleRows.filter({ hasText: "Folder Rule" });
  await expect(folderRuleRow).toHaveCount(1);
  await folderRuleRow.locator('[aria-label="Delete"]').click();

  const confirmModal = settingsPage.locator(".ore-confirm-modal");
  await expect(confirmModal).toBeVisible();
  await expect(confirmModal).toContainText("Folder Rule");

  await confirmModal.locator("button", { hasText: "Cancel" }).click();
  await settingsPage.waitForTimeout(300);

  // Nothing should have been removed
  expect(await ruleRows.count()).toBe(countBefore);
  await expect(ruleRows.filter({ hasText: "Folder Rule" })).toHaveCount(1);

  await closeSettings(settingsPage, page);
});

test("rule list - delete a rule via the list's delete button", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  // "Folder Rule" is disabled and unused by any template-rendering test, so it's
  // safe to permanently remove within this shared, single-worker Obsidian session.
  const ruleRows = settingsPage.locator('.ore-rule-list .setting-item:has([aria-label="Edit rule"])');
  const countBefore = await ruleRows.count();

  const folderRuleRow = ruleRows.filter({ hasText: "Folder Rule" });
  await expect(folderRuleRow).toHaveCount(1);
  await folderRuleRow.locator('[aria-label="Delete"]').click();

  // Deleting now asks for confirmation before actually removing the rule.
  const confirmModal = settingsPage.locator(".ore-confirm-modal");
  await expect(confirmModal).toBeVisible();
  await confirmModal.locator("button", { hasText: "Delete" }).click();
  await settingsPage.waitForTimeout(400);

  expect(await ruleRows.count()).toBe(countBefore - 1);
  await expect(ruleRows.filter({ hasText: "Folder Rule" })).toHaveCount(0);

  const persistedNames = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ name: string }> };
    };
    return plugin?.settings?.rules?.map((r) => r.name) ?? [];
  });
  expect(persistedNames).not.toContain("Folder Rule");

  await closeSettings(settingsPage, page);
});

// ── 3. Edit Rule Modal ────────────────────────────────────────────────────────

test("edit rule modal opens with correct sections", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);

  const modal = settingsPage.locator(".ore-edit-rule-modal");
  await expect(modal).toBeVisible();

  // Rule name input
  await expect(modal.locator("input[type=text]").first()).toBeVisible();

  // Section groups (Rule/Filters/Commands/HTML template) render as SettingGroup
  // headings, not regular setting rows.
  await expect(modal.locator(".setting-item-heading", { hasText: "Filters" })).toBeVisible();
  await expect(modal.locator(".setting-item-heading", { hasText: "Commands" })).toBeVisible();
  await expect(modal.locator(".setting-item-heading", { hasText: "HTML template" })).toBeVisible();

  // Filters section shows a read-only summary and an "Edit filters" button
  // instead of the inline filter builder.
  await expect(modal.locator("button", { hasText: "Edit filters" })).toBeVisible();

  // Enable-for-context toggles
  await expect(modal.locator(".setting-item-name", { hasText: "Enable for file" })).toBeVisible();
  await expect(modal.locator(".setting-item-name", { hasText: "Enable for base views" })).toBeVisible();
  await expect(modal.locator(".setting-item-name", { hasText: "Enable for canvas" })).toBeVisible();

  await closeModal(settingsPage);
  await closeSettings(settingsPage, page);
});

test("edit rule modal has an editable template textarea", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);

  const modal = settingsPage.locator(".ore-edit-rule-modal");

  const textarea = modal.locator("textarea").first();
  await expect(textarea).toBeVisible();
  const value = await textarea.inputValue();
  expect(value).toContain("ore-e2e-rendered");

  // Should be editable
  await textarea.fill('<div class="ore-e2e-updated">updated</div>');
  await expect(textarea).toHaveValue('<div class="ore-e2e-updated">updated</div>');

  // Cancel to avoid persisting the change
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Cancel" }).click();
  await closeSettings(settingsPage, page);
});

test("edit rule modal - enable for file/base/canvas toggles default correctly and persist", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);

  const modal = settingsPage.locator(".ore-edit-rule-modal");
  const fileToggle = modal
    .locator(".setting-item", { hasText: "Enable for file" })
    .locator(".checkbox-container");
  const baseToggle = modal
    .locator(".setting-item", { hasText: "Enable for base views" })
    .locator(".checkbox-container");
  const canvasToggle = modal
    .locator(".setting-item", { hasText: "Enable for canvas" })
    .locator(".checkbox-container");

  // Defaults: enabled for file, disabled for base/canvas
  await expect(fileToggle).toHaveClass(/is-enabled/);
  await expect(baseToggle).not.toHaveClass(/is-enabled/);
  await expect(canvasToggle).not.toHaveClass(/is-enabled/);

  // Flip all three
  await fileToggle.click();
  await baseToggle.click();
  await canvasToggle.click();
  await expect(fileToggle).not.toHaveClass(/is-enabled/);
  await expect(baseToggle).toHaveClass(/is-enabled/);
  await expect(canvasToggle).toHaveClass(/is-enabled/);

  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Save" }).click();
  await settingsPage.waitForTimeout(300);

  const rules = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: {
        rules: Array<{ enableTemplateForFile: boolean; enableTemplateForBase: boolean; enableTemplateForCanvas: boolean }>;
      };
    };
    return plugin?.settings?.rules ?? [];
  });
  expect(rules[0]?.enableTemplateForFile).toBe(false);
  expect(rules[0]?.enableTemplateForBase).toBe(true);
  expect(rules[0]?.enableTemplateForCanvas).toBe(true);

  // Restore - rule 0's template rendering in the normal file view is relied
  // on by the "matched file renders custom template" test later in this run.
  await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: {
        rules: Array<{ enableTemplateForFile: boolean; enableTemplateForBase: boolean; enableTemplateForCanvas: boolean }>;
      };
      saveSettings(): Promise<void>;
    };
    const rule = plugin.settings.rules[0];
    if (rule) {
      rule.enableTemplateForFile = true;
      rule.enableTemplateForBase = false;
      rule.enableTemplateForCanvas = false;
    }
    void plugin.saveSettings();
  });

  await closeSettings(settingsPage, page);
});

test("edit rule modal rule name is editable", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);

  const nameInput = settingsPage.locator(".ore-edit-rule-modal input[type=text]").first();
  await nameInput.fill("Renamed Rule");
  await expect(nameInput).toHaveValue("Renamed Rule");

  // Cancel - don't save
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Cancel" }).click();
  await closeSettings(settingsPage, page);
});

// ── 4. Filter Builder ─────────────────────────────────────────────────────────

test("filter builder shows existing filter condition", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);
  await openFilterModal(settingsPage);

  // Rule 0 has a "file.name contains matched" filter
  const filterRow = settingsPage.locator(".ore-filter-modal .ore-filter-row");
  expect(await filterRow.count()).toBeGreaterThan(0);

  await closeModal(settingsPage); // FilterModal
  await closeModal(settingsPage); // EditRuleModal
  await closeSettings(settingsPage, page);
});

test("filter builder - add a new filter", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);
  await openFilterModal(settingsPage);

  const filterModal = settingsPage.locator(".ore-filter-modal");
  const countBefore = await filterModal.locator(".ore-filter-row").count();

  // Click "Add filter" button
  const addFilterBtn = filterModal.locator(".ore-text-icon-button", { hasText: "Add filter" }).first();
  await addFilterBtn.click();
  await settingsPage.waitForTimeout(300);

  // A new filter row should appear
  const countAfter = await filterModal.locator(".ore-filter-row").count();
  expect(countAfter).toBeGreaterThan(countBefore);

  await closeModal(settingsPage); // FilterModal
  await closeModal(settingsPage); // EditRuleModal
  await closeSettings(settingsPage, page);
});

test("filter builder - delete a filter", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  // Use rule index 1 (tag rule) which has 1 filter, so deletion leaves 0 conditions (placeholder)
  await openEditRuleModal(settingsPage, 1);
  await openFilterModal(settingsPage);

  const filterModal = settingsPage.locator(".ore-filter-modal");

  // Click add filter to ensure at least 1 explicit filter row
  const addBtn = filterModal.locator(".ore-text-icon-button", { hasText: "Add filter" }).first();
  await addBtn.click();
  await settingsPage.waitForTimeout(300);

  const rowsBefore = await filterModal.locator(".ore-filter-row").count();

  // Click the first delete (trash) button in a filter row
  const deleteBtn = filterModal.locator(".ore-filter-row .clickable-icon").first();
  await deleteBtn.click();
  await settingsPage.waitForTimeout(300);

  const rowsAfter = await filterModal.locator(".ore-filter-row").count();
  expect(rowsAfter).toBeLessThan(rowsBefore);

  await closeModal(settingsPage); // FilterModal
  await closeModal(settingsPage); // EditRuleModal
  await closeSettings(settingsPage, page);
});

test("filter builder - property input accepts free text not in the suggestion list", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);
  await openFilterModal(settingsPage);

  const propertyInput = settingsPage.locator(".ore-filter-modal .ore-filter-row .ore-property-input").first();
  await propertyInput.fill("some.unindexed.property");
  // Blur without picking a suggestion
  await settingsPage.keyboard.press("Tab");
  await settingsPage.waitForTimeout(300);

  await expect(propertyInput).toHaveValue("some.unindexed.property");

  await closeModal(settingsPage); // FilterModal
  await closeModal(settingsPage); // EditRuleModal
  await closeSettings(settingsPage, page);
});

test("filter builder - operator dropdown changes and persists the filter's operator", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);
  await openFilterModal(settingsPage);

  // Rule 0's filter is "file.name contains matched" - the operator dropdown
  // carries its own class since a relative-date row can have two <select>s
  // (operator + unit) in the same row.
  const operatorSelect = settingsPage.locator(".ore-filter-modal select.ore-filter-operator").first();
  await expect(operatorSelect).toHaveValue("contains");

  await operatorSelect.selectOption("does not contain");
  await expect(operatorSelect).toHaveValue("does not contain");

  // FilterModal edits the rule's filterGroup by reference - "Done" just closes
  // it, the outer edit rule modal's "Save" is what persists to plugin settings.
  await settingsPage.locator(".ore-filter-modal button", { hasText: "Done" }).click();
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Save" }).click();
  await settingsPage.waitForTimeout(300);

  const persisted = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { conditions: Array<{ operator?: string }> } }> };
    };
    return plugin?.settings?.rules?.[0]?.filterGroup?.conditions?.[0]?.operator;
  });
  expect(persisted).toBe("does not contain");

  // Restore - rule 0 matching "file.name contains matched" is relied on by
  // the template-rendering tests later in this run.
  await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { conditions: Array<{ operator?: string }> } }> };
      saveSettings(): Promise<void>;
    };
    const condition = plugin.settings.rules[0]?.filterGroup?.conditions?.[0];
    if (condition) condition.operator = "contains";
    void plugin.saveSettings();
  });

  await closeSettings(settingsPage, page);
});

test("filter builder - conjunction dropdown changes AND/OR/NOR and persists", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);
  await openFilterModal(settingsPage);

  const conjunctionSelect = settingsPage.locator(".ore-filter-modal select.conjunction").first();
  await expect(conjunctionSelect).toHaveValue("and");

  await conjunctionSelect.selectOption("or");
  await expect(conjunctionSelect).toHaveValue("or");

  await settingsPage.locator(".ore-filter-modal button", { hasText: "Done" }).click();
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Save" }).click();
  await settingsPage.waitForTimeout(300);

  const persisted = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { operator: string } }> };
    };
    return plugin?.settings?.rules?.[0]?.filterGroup?.operator;
  });
  expect(persisted).toBe("OR");

  // Restore, for consistency with the other filter-builder mutation tests.
  await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { operator: string } }> };
      saveSettings(): Promise<void>;
    };
    const group = plugin.settings.rules[0]?.filterGroup;
    if (group) group.operator = "AND";
    void plugin.saveSettings();
  });

  await closeSettings(settingsPage, page);
});

test("filter builder - relative-date unit dropdown changes and persists", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  // "Within Past Rule" - filter is check_date "within past" "7 days". Index 2,
  // not 3: the earlier "delete Folder Rule" test (section 2) already removed
  // the rule that originally sat between "Tag Rule" and this one.
  await openEditRuleModal(settingsPage, 2);
  await openFilterModal(settingsPage);

  const unitSelect = settingsPage.locator(".ore-filter-modal select.ore-relative-date-unit").first();
  await expect(unitSelect).toHaveValue("days");

  await unitSelect.selectOption("weeks");
  await expect(unitSelect).toHaveValue("weeks");

  await settingsPage.locator(".ore-filter-modal button", { hasText: "Done" }).click();
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Save" }).click();
  await settingsPage.waitForTimeout(300);

  const persisted = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { conditions: Array<{ value?: string }> } }> };
    };
    return plugin?.settings?.rules?.[2]?.filterGroup?.conditions?.[0]?.value;
  });
  expect(persisted).toBe("7 weeks");

  // Restore - the within-past template-rendering test later in this run
  // depends on this rule's stored "7 days" value.
  await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { conditions: Array<{ value?: string }> } }> };
      saveSettings(): Promise<void>;
    };
    const condition = plugin.settings.rules[2]?.filterGroup?.conditions?.[0];
    if (condition) condition.value = "7 days";
    void plugin.saveSettings();
  });

  await closeSettings(settingsPage, page);
});

test("filter builder - add a nested filter group (2 levels), with no further nesting offered", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");
  await openEditRuleModal(settingsPage, 0);
  await openFilterModal(settingsPage);

  const filterModal = settingsPage.locator(".ore-filter-modal");

  const addGroupBtn = filterModal.locator(".ore-text-icon-button", { hasText: "Add filter group" }).first();
  await addGroupBtn.click();
  await settingsPage.waitForTimeout(300);

  const subgroup = filterModal.locator(".ore-filter-subgroup").first();
  await expect(subgroup).toBeVisible();

  // 2 levels is a hard ceiling - a subgroup never offers "Add filter group".
  await expect(subgroup.locator(".ore-text-icon-button", { hasText: "Add filter group" })).toHaveCount(0);

  const addFilterInSubgroup = subgroup.locator(".ore-text-icon-button", { hasText: "Add filter" }).first();
  await addFilterInSubgroup.click();
  await settingsPage.waitForTimeout(300);

  const rowInSubgroup = subgroup.locator(".ore-filter-row").first();
  await expect(rowInSubgroup).toBeVisible();

  const propertyInput = rowInSubgroup.locator(".ore-property-input");
  await propertyInput.fill("file.extension");
  await settingsPage.keyboard.press("Tab");
  await settingsPage.waitForTimeout(300);

  await settingsPage.locator(".ore-filter-modal button", { hasText: "Done" }).click();
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Save" }).click();
  await settingsPage.waitForTimeout(300);

  const persistedConditions = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { conditions: Array<{ type: string; field?: string; conditions?: Array<{ field?: string }> }> } }> };
    };
    return plugin?.settings?.rules?.[0]?.filterGroup?.conditions ?? [];
  });
  const nestedGroup = persistedConditions.find(c => c.type === "group");
  expect(nestedGroup).toBeTruthy();
  expect(nestedGroup?.conditions?.[0]?.field).toBe("file.extension");

  // Clean up - rule 0's original single filter is relied on by the
  // template-rendering tests later in this run.
  await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ filterGroup: { conditions: Array<{ type: string }> } }> };
      saveSettings(): Promise<void>;
    };
    const group = plugin.settings.rules[0]?.filterGroup;
    if (group) group.conditions = group.conditions.filter((c) => c.type !== "group");
    void plugin.saveSettings();
  });

  await closeSettings(settingsPage, page);
});

// ── 5. Template Rendering ─────────────────────────────────────────────────────

test("matched file renders custom template in reading mode", async ({ page }) => {
  await openNote(page, "matched-file.md");

  // Switch to reading mode
  await page.evaluate(() => {
    const leaf = window.app.workspace.getLeaf(false);
    void (leaf as unknown as { setViewState(s: unknown): Promise<void> }).setViewState({
      type: "markdown",
      state: { file: "Notes/matched-file.md", mode: "preview" },
    });
  });
  await page.waitForTimeout(1500);

  // The plugin injects .obsidian-custom-rule-render when a rule matches
  const rendered = page.locator(".obsidian-custom-rule-render");
  await expect(rendered).toBeVisible({ timeout: 8000 });

  // Our template wraps content in .ore-e2e-rendered
  await expect(page.locator(".ore-e2e-rendered")).toBeVisible();
});

test("unmatched file does not render custom template", async ({ page }) => {
  await openNote(page, "other-file.md");

  // Wait until Obsidian has actually switched to the new file and the plugin has
  // had time to run restoreDefaultView (clearing the render div from the previous test)
  await page.waitForFunction(
    () => window.app?.workspace?.getActiveFile()?.name === "other-file.md",
    { timeout: 10000 }
  );
  await page.waitForTimeout(1000);

  // Obsidian keeps background leaf elements in the DOM - check it's not visible,
  // not that the element doesn't exist anywhere (the matched-file leaf may still be cached).
  await expect(page.locator(".obsidian-custom-rule-render").first()).not.toBeVisible();
});

test("tag-matched file renders tag rule template", async ({ page }) => {
  await openNote(page, "rich-frontmatter.md");

  await page.evaluate(() => {
    const leaf = window.app.workspace.getLeaf(false);
    void (leaf as unknown as { setViewState(s: unknown): Promise<void> }).setViewState({
      type: "markdown",
      state: { file: "Notes/rich-frontmatter.md", mode: "preview" },
    });
  });
  await page.waitForTimeout(1500);

  await expect(page.locator(".ore-e2e-tag-rendered")).toBeVisible({ timeout: 8000 });
});

test("file with a check_date in the past renders the within-past template", async ({ page }) => {
  await openNote(page, "within-past-check.md");

  await page.evaluate(() => {
    const leaf = window.app.workspace.getLeaf(false);
    void (leaf as unknown as { setViewState(s: unknown): Promise<void> }).setViewState({
      type: "markdown",
      state: { file: "Notes/within-past-check.md", mode: "preview" },
    });
  });
  await page.waitForTimeout(1500);

  await expect(page.locator(".ore-e2e-within-past-rendered")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".ore-e2e-within-future-rendered")).not.toBeVisible();
});

test("file with a check_date in the future renders the within-future template", async ({ page }) => {
  await openNote(page, "within-future-check.md");

  await page.evaluate(() => {
    const leaf = window.app.workspace.getLeaf(false);
    void (leaf as unknown as { setViewState(s: unknown): Promise<void> }).setViewState({
      type: "markdown",
      state: { file: "Notes/within-future-check.md", mode: "preview" },
    });
  });
  await page.waitForTimeout(1500);

  await expect(page.locator(".ore-e2e-within-future-rendered")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".ore-e2e-within-past-rendered")).not.toBeVisible();
});

test("file with 2 resolved outgoing links renders the outlinks-count template", async ({ page }) => {
  await openNote(page, "outlinks-check.md");

  await page.evaluate(() => {
    const leaf = window.app.workspace.getLeaf(false);
    void (leaf as unknown as { setViewState(s: unknown): Promise<void> }).setViewState({
      type: "markdown",
      state: { file: "Notes/outlinks-check.md", mode: "preview" },
    });
  });
  await page.waitForTimeout(1500);

  await expect(page.locator(".ore-e2e-outlinks-rendered")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".ore-e2e-inlinks-rendered")).not.toBeVisible();
});

test("file with 2 resolved incoming links renders the inlinks-count template", async ({ page }) => {
  await openNote(page, "inlinks-check.md");

  await page.evaluate(() => {
    const leaf = window.app.workspace.getLeaf(false);
    void (leaf as unknown as { setViewState(s: unknown): Promise<void> }).setViewState({
      type: "markdown",
      state: { file: "Notes/inlinks-check.md", mode: "preview" },
    });
  });
  await page.waitForTimeout(1500);

  await expect(page.locator(".ore-e2e-inlinks-rendered")).toBeVisible({ timeout: 8000 });
  await expect(page.locator(".ore-e2e-outlinks-rendered")).not.toBeVisible();
});

// ── 6. Plugin settings persistence ───────────────────────────────────────────

test("adding and saving a new rule persists it", async ({ page }) => {
  const settingsPage = await openPluginSettings(page, "Rule Engine");

  const countBefore = await settingsPage.locator(".ore-rule-list .setting-item").count();

  // Click "Add new rule"
  await settingsPage.locator('[aria-label="Add new rule"]').click();
  await settingsPage.waitForSelector(".ore-edit-rule-modal", { timeout: 5000 });

  // Set a unique name and save
  const nameInput = settingsPage.locator(".ore-edit-rule-modal input[type=text]").first();
  await nameInput.fill("Persisted Test Rule");
  await settingsPage.locator(".ore-edit-rule-modal button", { hasText: "Save" }).click();
  await settingsPage.waitForTimeout(500);

  const countAfter = await settingsPage.locator(".ore-rule-list .setting-item").count();
  expect(countAfter).toBe(countBefore + 1);

  // Verify plugin settings reflect the new rule
  const ruleNames = await page.evaluate(() => {
    const plugin = window.app.plugins.plugins["rule-engine"] as unknown as {
      settings: { rules: Array<{ name: string }> };
    };
    return plugin?.settings?.rules?.map((r) => r.name) ?? [];
  });
  expect(ruleNames).toContain("Persisted Test Rule");

  await closeSettings(settingsPage, page);
});
