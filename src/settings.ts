import { App, PluginSettingTab, Setting, SettingDefinitionItem, SettingDefinitionList, SettingGroupItem } from "obsidian";
import ObsidianRuleEnginePlugin from "./main";
import { RuleConfig, FilterGroup } from "./types";
import { DEFAULT_RULES } from "./consts";
import { EditRuleModal } from "editRuleModal";
import { CommandSettingsModal } from "commandSettingsModal";
import { ConfirmModal } from "confirmModal";

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

	private getRuleListDefinition(): SettingDefinitionList {
		return {
			type: "list",
			heading: "Rule configuration",
			cls: "ore-rule-list",
			emptyState: "No rules yet.",
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
