import { App, Notice, PluginSettingTab, Setting, SettingDefinitionItem, SettingDefinitionList, SettingGroupItem } from "obsidian";
import ObsidianRuleEnginePlugin from "./main";
import { RuleConfig, FilterGroup } from "./types";
import { DEFAULT_RULES } from "./consts";
import { EditRuleModal } from "editRuleModal";
import { CommandSettingsModal } from "commandSettingsModal";
import { ConfirmModal } from "confirmModal";
import { ImportRulesModal, PickRuleFileModal } from "importRulesModal";
import { ExportRulesModal } from "exportRulesModal";
import { exportFileName, type ParsedImport, parseRuleImport, serializeRules } from "ruleImport";

export class ObsidianRuleEngineSettingTab extends PluginSettingTab {
	plugin: ObsidianRuleEnginePlugin;

	constructor(app: App, plugin: ObsidianRuleEnginePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	get ruleCount(): number {
		return this.plugin.settings.rules.length ?? 0;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		await super.setControlValue(key, value);
		if (key === "workInLivePreview") {
			const file = this.app.workspace.getActiveFile();
			if (file) {
				this.plugin.processMarkdownView(file).catch((e) => {
					this.plugin.debug(e);
				});
			}
		} else if (key === "workInCanvas") {
			if (value) {
				this.plugin.processAllCanvasNodes();
			} else {
				this.plugin.restoreAllCanvasNodes();
			}
		}
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				items: [
					{
						name: "Enabled",
						desc: "Enable rule automations",
						control: { type: "toggle", key: "enabled" },
					},
				],
			},
			this.getRuleListDefinition(),
			{
				type: "group",
				heading: "Settings",
				items: this.getSettingsGroupItems(),
			},
			{
				type: "group",
				heading: "Command configuration",
				items: this.getCommandGroupItems(),
			},
		];
	}

	private exportRules(): void {
		const { rules } = this.plugin.settings;
		if (!rules.length) {
			this.plugin.notify("No rules to export");
			return;
		}
		new ExportRulesModal(this.app, rules, (chosen) => {
			// A vault file is the only save target that works on desktop and mobile without a native dialog.
			const path = exportFileName((p) => this.app.vault.getAbstractFileByPath(p) !== null);
			this.app.vault
				.create(path, serializeRules(chosen))
				.then(() => {
					this.plugin.debug(`exported ${chosen.length} rules to ${path}`);
					this.plugin.notify(`Saved ${chosen.length} rule${chosen.length === 1 ? "" : "s"} to ${path}`);
				})
				.catch((e) => this.plugin.debug(e));
		}).open();
	}

	private importRules(): void {
		new PickRuleFileModal(this.app, (file) => {
			this.app.vault
				.read(file)
				.then((text) => {
					const result = parseRuleImport(text, () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
					if (result.error) {
						this.plugin.debug(`import failed for ${file.path}: ${result.error}`);
						new Notice(`${file.name}: ${result.error}`);
						return;
					}
					this.confirmImport(file.name, result);
				})
				.catch((e) => this.plugin.debug(e));
		}).open();
	}

	private confirmImport(fileName: string, result: ParsedImport): void {
		new ImportRulesModal(this.app, fileName, result, (parsed, replace) => {
			const apply = () => {
				const { settings } = this.plugin;
				settings.rules = replace ? parsed.rules : [...settings.rules, ...parsed.rules];
				this.plugin.debug(`imported ${parsed.rules.length} rules, skipped ${parsed.skipped}`, { replace });
				void this.plugin.saveSettings();
				this.update();
				this.plugin.notify(
					`Imported ${parsed.rules.length} rule${parsed.rules.length === 1 ? "" : "s"}` +
						(parsed.skipped ? `, skipped ${parsed.skipped} invalid` : ""),
				);
			};
			if (replace) {
				new ConfirmModal(this.app, "Replace all existing rules with the imported ones?", apply, "Replace").open();
			} else {
				apply();
			}
		}).open();
	}

	private getRuleListDefinition(): SettingDefinitionList {
		return {
			type: "list",
			heading: "Rule configuration",
			cls: "ore-rule-list",
			emptyState: "No rules yet.",
			// Left to right: import, export, then add.
			extraButtons: [
				(btn) => btn.setIcon("download").setTooltip("Import rules").onClick(() => this.importRules()),
				(btn) => btn.setIcon("upload").setTooltip("Export rules").onClick(() => this.exportRules()),
			],
			search: {
				placeholder: "Search rules...",
				match: (def, query) => def.name.toLowerCase().includes(query.toLowerCase()),
			},
			onReorder: (oldIndex, newIndex) => {
				const rule = this.plugin.settings.rules.splice(oldIndex, 1)?.[0];
				this.plugin.debug(`reorder rule`, { oldIndex, newIndex, rule });
				this.plugin.settings.rules.splice(newIndex, 0, rule!);
				void this.plugin.saveSettings();
				this.update();
			},
			onDelete: (index) => {
				const rule = this.plugin.settings.rules[index];
				new ConfirmModal(
					this.app,
					`Delete rule "${rule?.name ?? "this rule"}"? This can't be undone.`,
					() => {
						this.plugin.settings.rules.splice(index, 1);
						void this.plugin.saveSettings();
						this.update();
					}
				).open();
			},
			addItem: {
				name: "Add new rule",
				action: () => {
					const newRule: RuleConfig = {
						id: `${Date.now()}`,
						name: `Rule ${this.ruleCount + 1}`,
						filterGroup: JSON.parse(JSON.stringify(DEFAULT_RULES)) as FilterGroup,
						template: "<h1>{{file.basename}}</h1>",
						enableTemplateForFile: true,
						enableTemplateForBase: false,
						enableTemplateForCanvas: false,
						enabled: true,
						commandIds: [],
						baseFileHandling: "file"
					};
					this.plugin.settings.rules.push(newRule);
					void this.plugin.saveSettings();
					this.update();

					const newIndex = this.plugin.settings.rules.length - 1;
					new EditRuleModal(this.app, this.plugin, newRule, newIndex, () => {
						this.update();
					}).open();
				},
			},
			items: this.plugin.settings.rules.map((rule, index) => ({
				name: rule.name,
				render: (setting: Setting) => {
					const templateActive = !!rule.template?.trim().length
						&& (rule.enableTemplateForFile || rule.enableTemplateForBase || rule.enableTemplateForCanvas);
					const summary = [
						`${rule.commandIds.length} command${rule.commandIds.length === 1 ? "" : "s"}`,
						templateActive ? "has template" : "no template",
						rule.enabled ? undefined : "disabled",
					].filter((str): str is string => Boolean(str?.length)).join(" · ");
					setting
						.setName(rule.name)
						.setDesc(summary)
						.addButton(btn => {
							btn.setIcon("pencil")
								.setTooltip("Edit rule")
								.onClick(() => {
									new EditRuleModal(this.app, this.plugin, rule, index, () => {
										this.update();
									}).open();
								});
							btn.buttonEl.setAttribute("aria-label", "Edit rule");
						});
				},
			})),
		};
	}

	private getSettingsGroupItems(): SettingGroupItem[] {
		return [
			{
				name: "Template in live preview",
				desc: "Enable to use templates in both live preview and reading view. Disable to limit them to reading view only.",
				control: { type: "toggle", key: "workInLivePreview" },
			},
			{
				name: "Template in canvas (experimental)",
				desc: "Apply templates to Markdown file nodes in canvas files",
				control: { type: "toggle", key: "workInCanvas" },
			},
			{
				name: "Process on settings change",
				desc: "Trigger processing of rule engine results when plugin settings or rules change.",
				render: (setting) => {
					setting
						.setTooltip(this.plugin.isBasesViewRegistered ? '' : 'Rule engine view could not be registered')
						.addToggle(toggle => toggle
							.setValue(this.plugin.settings.processOnSave)
							.setDisabled(!this.plugin.isBasesViewRegistered)
							.onChange(async (value) => {
								this.plugin.settings.processOnSave = value;
								await this.plugin.saveSettings();
							}));
				},
			},
			{
				name: "Process .base files automatically",
				desc: "Allow rules to execute across the 'rule engine' view in .base files automatically when data changes.",
				render: (setting) => {
					setting
						.setTooltip(this.plugin.isBasesViewRegistered ? '' : 'Rule engine view could not be registered')
						.addToggle(toggle => toggle
							.setValue(this.plugin.settings.processBaseResultsAutomatically)
							.setDisabled(!this.plugin.isBasesViewRegistered)
							.onChange(async (value) => {
								this.plugin.settings.processBaseResultsAutomatically = value;
								await this.plugin.saveSettings();
							}));
				},
			},
			{
				name: "Show notices",
				desc: "Show popup notices for command results (e.g. tags added, MOC updated) and the enable/disable toggle. Errors are always shown regardless of this setting.",
				control: { type: "toggle", key: "showNotices" },
			},
			{
				name: "Debug",
				desc: "Log debug messages to the developer tools",
				control: { type: "toggle", key: "debug" },
			},
		];
	}

	private getCommandGroupItems(): SettingGroupItem[] {
		const commandItems: SettingGroupItem[] = this.plugin.commands
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(cmdConfig => {
				const { id, name, description, settingCallback } = cmdConfig;
				return {
					name,
					desc: description ?? '',
					render: (setting: Setting) => {
						const currentConfig = this.plugin.getCommandConfig(id);
						setting
							.setName(name)
							.setDesc(description ?? '')
							.setTooltip('Toggle whether or not this command appears in the Obsidian palette and can be used in rules');

						// Added before the toggle so the gear button renders to its left.
						if (settingCallback) {
							const saveFn = async (updatedConfig: { enabled?: boolean; params?: Record<string, unknown> }) => {
								if (updatedConfig.enabled !== undefined) currentConfig.enabled = updatedConfig.enabled;
								if (updatedConfig.params) Object.assign(currentConfig.params, updatedConfig.params);
								await this.plugin.updateCommandConfig(id, updatedConfig);
							};
							setting.addExtraButton(btn => {
								btn.setIcon('settings')
									.setTooltip(`Configure ${name}`)
									.onClick(() => {
										new CommandSettingsModal(this.app, id, name, settingCallback, currentConfig, saveFn).open();
									});
							});
						}

						setting.addToggle(toggle => toggle
							.setValue(currentConfig.enabled)
							.onChange(async (value) => {
								currentConfig.enabled = value;
								await this.plugin.updateCommandConfig(id, { enabled: value }).catch(e => this.plugin.debug(e));
							}));

						setting.nameEl.className = 'ore-command-config-name';
						setting.descEl.createDiv({ cls: 'ore-command-config-id', text: `id: ${id}` });
					},
				};
			});

		return [
			...commandItems,
			{
				name: "Per-file overrides",
				desc: "Override a command's enabled state or parameters for a single file via frontmatter, using ore:<command id>:<setting> keys (e.g. ore:apply-task-due-date:frontmatterField: due, or ore:check-rules:enabled: false). Command IDs are shown below each command's name above.",
			},
		];
	}
}
