import { ComboboxSuggestModal } from "comboSuggestModal";
import { CommandSettingsModal } from "commandSettingsModal";
import { FilterModal } from "filterModal";
import type ObsidianRuleEnginePlugin from "main";
import { stripCommandIdPrefix } from "main";
import {
    type App,
    ButtonComponent,
    Modal,
    Setting,
    SettingGroup,
} from "obsidian";
import type {
    AnyFilterGroup,
    BaseFileHandling,
    CommandConfig,
    FilterConjunction,
    RuleConfig,
    SuggestItem,
} from "types";

/**
 * Read-only, recursively-nested rendering of a filter tree for reviewing a
 * rule's filters at a glance. Mirrors FilterModal's FilterBuilder.renderGroup
 * recursion (same AND/OR/NOR structure, same nesting), but emits plain text
 * only - no inputs, dropdowns, or delete buttons. Actual editing happens in
 * FilterModal. Accepts a DocumentFragment too (via `createFragment`) since
 * this is used as a Setting's description, not just a standalone container.
 */
function renderFilterSummary(
    container: HTMLElement | DocumentFragment,
    plugin: ObsidianRuleEnginePlugin,
    group: AnyFilterGroup,
): void {
    const conjLabel: Record<FilterConjunction, string> = {
        AND: "All of",
        OR: "Any of",
        NOR: "None of",
    };
    const wrapper = container.createDiv({ cls: "ore-filter-summary-group" });
    wrapper.createDiv({
        cls: "ore-filter-summary-heading",
        text: conjLabel[group.operator],
    });

    if (group.conditions.length === 0) {
        wrapper.createDiv({
            cls: "ore-filter-summary-empty",
            text: "No filters - matches everything",
        });
        return;
    }

    const list = wrapper.createEl("ul", { cls: "ore-filter-summary-list" });
    for (const condition of group.conditions) {
        const item = list.createEl("li");
        if (condition.type === "group") {
            renderFilterSummary(item, plugin, condition);
        } else {
            const value = condition.value?.length ? ` "${condition.value}"` : "";
            item.setText(
                `${plugin.getPropertyLabel(condition.field)} ${condition.operator}${value}`,
            );
        }
    }
}

export class EditRuleModal extends Modal {
    rule: RuleConfig;

    openSuggestModal(
        items: { label: string; value: string; icon?: string }[],
        selectedValue: string,
        onSelect: (val: string) => void,
        anchorEl?: HTMLElement,
    ) {
        const modal = new ComboboxSuggestModal(
            this.plugin.app,
            items,
            selectedValue,
            onSelect,
            anchorEl,
        );
        modal.open();
    }

    constructor(
        app: App,
        private plugin: ObsidianRuleEnginePlugin,
        rule: RuleConfig,
        private ruleIndex: number,
        private onSave: () => void,
    ) {
        super(app);
        this.rule = JSON.parse(JSON.stringify(rule)) as RuleConfig;
        this.setTitle("Edit rule");
    }

    onOpen() {
        const { contentEl } = this;
        this.modalEl.addClass("ore-edit-rule-modal-window");
        contentEl.empty();
        contentEl.addClass("ore-edit-rule-modal");

        const ruleGroup = new SettingGroup(contentEl).setHeading("Rule");
        ruleGroup.addSetting((setting) => {
            setting
                .setName("Rule name")
                .setDesc("The name of the rule will be displayed in the rule list.")
                .addText((text) => {
                    text.setValue(this.rule.name).onChange((value) => {
                        this.rule.name = value;
                    });
                    window.requestAnimationFrame(() => {
                        text.inputEl.select();
                    });
                });
        });

        ruleGroup.addSetting((setting) => {
            setting.setName("Enabled").addToggle((toggle) => {
                toggle.setValue(this.rule.enabled).onChange((val) => {
                    this.rule.enabled = val;
                });
            });
        });

        if (this.plugin.settings.processBaseResultsAutomatically) {
            ruleGroup.addSetting((setting) => {
                setting
                    .setName("File handling")
                    .setDesc(`How should this rule execute commands?`)
                    .addDropdown((dd) => {
                        const options: Record<BaseFileHandling, string> = {
                            file: "On markdown files",
                            results: "Across .base results",
                            both: "Both",
                        };
                        dd.addOptions(options);
                        dd.setValue(this.rule.baseFileHandling);
                        dd.disabled = this.plugin.settings.processBaseResultsAutomatically;
                        dd.onChange((val) => {
                            const allowed = ["file", "results", "both"];
                            if (allowed.includes(val)) {
                                this.rule.baseFileHandling = val as BaseFileHandling;
                                this.onOpen();
                            }
                        });
                    });
            });
        }

        let filterSetting: Setting;
        const buildFilterSummary = () =>
            createFragment((frag) =>
                renderFilterSummary(frag, this.plugin, this.rule.filterGroup),
            );
        const filterGroup = new SettingGroup(contentEl).setHeading("Filters");
        filterGroup.addSetting((setting) => {
            filterSetting = setting;
            setting.setDesc(buildFilterSummary()).addButton((btn) => {
                btn
                    .setIcon("pencil")
                    .setButtonText("Edit filters")
                    .onClick(() => {
                        new FilterModal(
                            this.app,
                            this.plugin,
                            this.rule.filterGroup,
                            this.rule.name,
                            () => {
                                filterSetting.setDesc(buildFilterSummary());
                            },
                        ).open();
                    });
            });
        });

        const commandsGroup = new SettingGroup(contentEl).setHeading("Commands");
        commandsGroup.addSetting((setting) => {
            setting
                .setDesc(
                    "Executed in order. Only shows & executes commands available in the current context.",
                )
                .addButton((btn) => {
                    btn
                        .setCta()
                        .setIcon("plus")
                        .setButtonText("Add")
                        .onClick(() => {
                            const firstCmdId = Object.keys(this.plugin.obsidianCommands)[0];
                            if (firstCmdId) {
                                this.rule.commandIds.push(firstCmdId);
                                renderCommandIdList();
                            } else {
                                this.plugin.debug(`failed to add new command ID to rule`);
                            }
                        });
                });
        });

        const commandsContainer = commandsGroup.listEl.createEl("ol", {
            cls: "ore-parent-commands-container",
        });
        commandsContainer.role = "list";
        const renderCommandIdList = () => {
            commandsContainer.empty();
            this.rule.commandIds.forEach((id, idx) => {
                const childLiEl = commandsContainer.createEl("li", {
                    cls: "ore-command-id-list-item",
                });
                const setting = new Setting(childLiEl);

                // rule.commandIds stores the full Obsidian-prefixed id (e.g.
                // "rule-engine:generate-semantic-tags"), but this.plugin.commands
                // holds the plugin's own short ids - strip the prefix to match.
                const shortId = stripCommandIdPrefix(id);
                const cmdWithSetup = this.plugin.commands.find((c) => c.id === shortId);
                if (cmdWithSetup?.settingCallback) {
                    const settingCallback = cmdWithSetup.settingCallback;
                    setting.addExtraButton((btn) => {
                        btn
                            .setIcon("settings")
                            .setTooltip(`Configure ${cmdWithSetup.name}`)
                            .onClick(() => {
                                const currentConfig = this.plugin.getCommandConfig(shortId);
                                const saveFn = async (updated: Partial<CommandConfig>) => {
                                    await this.plugin.updateCommandConfig(shortId, updated);
                                };
                                new CommandSettingsModal(
                                    this.app,
                                    shortId,
                                    cmdWithSetup.name,
                                    settingCallback,
                                    currentConfig,
                                    saveFn,
                                ).open();
                            });
                    });
                }

                setting
                    .addButton((btn) => {
                        btn
                            .setIcon("terminal")
                            .setButtonText(this.plugin.obsidianCommands[id]?.name ?? id)
                            .onClick(() => {
                                const items: SuggestItem[] = Object.values(
                                    this.plugin.obsidianCommands,
                                )
                                    .map((cmd) => ({
                                        label: cmd.name,
                                        value: cmd.id,
                                        icon: cmd.icon,
                                    }))
                                    .sort((a, b) => a.label.localeCompare(b.label));
                                const selectedValue = "";
                                const onSelect = (val: string) => {
                                    this.rule.commandIds[idx] = val;
                                    renderCommandIdList();
                                };
                                this.openSuggestModal(
                                    items,
                                    selectedValue,
                                    onSelect,
                                    btn.buttonEl,
                                );
                            });
                    })
                    .addExtraButton((btn) => {
                        btn.setIcon("trash-2").onClick(() => {
                            this.rule.commandIds.splice(idx, 1);
                            renderCommandIdList();
                        });
                    });
            });
        };
        renderCommandIdList();

        const templateGroup = new SettingGroup(contentEl).setHeading(
            "HTML template",
        );
        templateGroup.addSetting((setting) => {
            setting
                .setName("Template")
                .setDesc(
                    "Leave blank for no template. Use {{mustache}} syntax for variables.",
                )
                .addTextArea((ta) => {
                    ta.setValue(this.rule.template)
                        .setPlaceholder(
                            "<h1>{{file.basename}}</h1><main>{{file.content}}</main>",
                        )
                        .onChange((val) => {
                            this.rule.template = val;
                        });
                    ta.inputEl.rows = 8;
                    ta.inputEl.addClass("ore-textarea");
                });
        });

        templateGroup.addSetting((setting) => {
            setting
                .setName("Enable for file")
                .setDesc(
                    "Apply this template when the file is rendered as a normal Markdown note.",
                )
                .addToggle((toggle) =>
                    toggle.setValue(this.rule.enableTemplateForFile).onChange((val) => {
                        this.rule.enableTemplateForFile = val;
                    }),
                );
        });

        templateGroup.addSetting((setting) => {
            setting
                .setName("Enable for base views")
                .setDesc(
                    "Also apply this template when the file is rendered in a bases query.",
                )
                .addToggle((toggle) =>
                    toggle.setValue(this.rule.enableTemplateForBase).onChange((val) => {
                        this.rule.enableTemplateForBase = val;
                    }),
                );
        });

        templateGroup.addSetting((setting) => {
            setting
                .setName("Enable for canvas")
                .setDesc(
                    "Also apply this template when the file is rendered as a canvas node.",
                )
                .addToggle((toggle) =>
                    toggle.setValue(this.rule.enableTemplateForCanvas).onChange((val) => {
                        this.rule.enableTemplateForCanvas = val;
                    }),
                );
        });

        const buttonContainer = contentEl.createDiv("modal-button-container");
        new ButtonComponent(buttonContainer)
            .setButtonText("Save")
            .setCta()
            .onClick(async () => {
                this.plugin.settings.rules[this.ruleIndex] = this.rule;
                await this.plugin.saveSettings();
                this.onSave();
                this.close();
            });

        // .modal-button-container lays out right-to-left (the CTA is added
        // first but renders rightmost), so adding this next puts it left of Save.
        new ButtonComponent(buttonContainer)
            .setButtonText("Duplicate")
            .setTooltip(
                "Save a copy of this rule (with its current unsaved edits) as a new rule",
            )
            .onClick(async () => {
                const duplicate: RuleConfig = {
                    ...(JSON.parse(JSON.stringify(this.rule)) as RuleConfig),
                    id: `${Date.now()}`,
                    name: `${this.rule.name} (copy)`,
                };
                this.plugin.settings.rules.splice(this.ruleIndex + 1, 0, duplicate);
                await this.plugin.saveSettings();
                this.onSave();
                this.close();
            });

        new ButtonComponent(buttonContainer).setButtonText("Cancel").onClick(() => {
            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
