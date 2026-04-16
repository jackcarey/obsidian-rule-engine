import { Plugin, TFile, MarkdownView, Keymap, Notice, WorkspaceLeaf, Command } from "obsidian";
import { ObsidianRuleEngineSettingTab } from "./settings";
import { checkRules } from "./matcher";
import { renderTemplate } from "./renderer";
import { CUSTOM_RULE_CLASS, DEFAULT_SETTINGS, HIDE_MARKDOWN_CLASS } from "./consts";
import { BaseFileHandling, CanvasNode, CanvasView, CommandConfig, CommandWithSetup, CustomRulesSettings } from "./types";

/**
 * Type guard to check if a view is a canvas view
 */
function isCanvasView(view: unknown): view is CanvasView {
	return typeof view === "object" && view !== null && "canvas" in view;
}

export default class ObsidianRuleEnginePlugin extends Plugin {
	settings: CustomRulesSettings = Object.assign({}, DEFAULT_SETTINGS);

	get commands(): CommandWithSetup[] {
		return [{
			id: 'log-time',
			name: 'Log the time',
			description: 'logs the current time to the console',
			icon: 'clock',
			callback: () => console.debug(new Date().toISOString(), Date.now())
		}];
	};


	/**
	 * 
	 * @param id The command ID
	 * @returns The command config from the plugin data.json
	 */
	getCommandConfig = (id: string): CommandConfig => {
		return {
			enabled: false,
			... this.settings.commands.find(cmd => cmd.id === id),
		};
	}

	/**
	 * 
	 * @param id The command ID
	 * @param partialUpdate An object containing some settings to update in the plugin data.json
	 */
	updateCommandConfig = (id: string, partialUpdate: Partial<Omit<CommandConfig, 'id'>>): void => {
		if (!this.settings.commands) {
			this.settings.commands = [];
		}
		const fullConfig: CommandConfig = {
			...this.getCommandConfig(id),
			...partialUpdate,
			id
		};
		const idx = this.settings.commands.findIndex(cmd => cmd.id === id);
		if (idx !== -1) {
			this.settings.commands[idx] = fullConfig;
		} else {
			this.settings.commands.push(fullConfig);
		}
		this.saveSettings().catch(_reason => {
			throw new Error(`failed to update command config`);
		});
	};

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ObsidianRuleEngineSettingTab(this.app, this));

		this.addCommand({
			id: "enable",
			name: "Enable",
			checkCallback: (checking) => {
				if (checking) {
					return !this.settings.enabled;
				}

				void this.setPluginState(true);
				return true;
			},
		});

		this.addCommand({
			id: "disable",
			name: "Disable",
			checkCallback: (checking) => {
				if (checking) {
					return this.settings.enabled;
				}

				void this.setPluginState(false);
				return true;
			},
		});

		this.addCommand({
			id: "check-rules",
			name: "Process now",
			checkCallback: (checking) => {
				if (checking) {
					return this.settings.enabled;
				}

				const file = this.app.workspace.getActiveFile();

				if (file) {
					void this.processActiveView(file);
				}
				return true;
			},
		});

		for (const cmd of this.commands) {
			try {
				if ('description' in cmd) {
					delete cmd.description;
				}
				if ('settingCallback' in cmd) {
					delete cmd.settingCallback
				}
				const cmdObject: Command = {
					...cmd,
				};
				//ensure the commands always go through an enabled check
				delete cmdObject.callback;
				delete cmdObject.editorCallback;
				delete cmdObject.checkCallback;
				delete cmdObject.editorCheckCallback;

				if (cmd.callback || cmd.checkCallback) {
					cmdObject.checkCallback = (checking: boolean): boolean | void => {
						if (checking) {
							const enabled = this.getCommandConfig(cmd.id)?.enabled;
							if (enabled && cmd.checkCallback) {
								return cmd.checkCallback(checking);
							}
							return enabled;
						}
						if (cmd.checkCallback) {
							return cmd.checkCallback(checking);
						}
						cmd.callback?.();
					};
				}

				if (cmd.editorCallback || cmd.editorCheckCallback) {
					cmdObject.editorCheckCallback = (checking, editor, ctx) => {
						if (checking) {
							const enabled = this.getCommandConfig(cmd.id)?.enabled;
							if (enabled && cmd.editorCheckCallback) {
								return cmd.editorCheckCallback(checking, editor, ctx);
							}
							return enabled;
						}
						if (cmd.editorCheckCallback) {
							return cmd.editorCheckCallback(checking, editor, ctx);
						}
						cmd.editorCallback?.(editor, ctx);
					};
				}

				this.addCommand(cmdObject);
			} catch (e) {
				console.error(e);
				console.warn(`couldn't add command`, cmd);
			}
		}

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => this.processActiveView(file))
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				const file = this.app.workspace.getActiveFile();

				void this.processActiveView(file);
				if (this.settings.workInCanvas) {
					void this.processAllCanvasNodes();
				}
			})
		);

		// Process canvas nodes when canvas changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.settings.workInCanvas) {
					void this.processAllCanvasNodes();
				}
			})
		);

		// Also process canvas nodes periodically to catch updates
		this.registerInterval(window.setInterval(() => {
			if (this.settings.enabled && this.settings.workInCanvas) {
				void this.processAllCanvasNodes();
			}
		}, 5000));
	}

	async setPluginState(enabled: boolean) {
		this.settings.enabled = enabled;
		await this.saveSettings();

		new Notice(enabled ? "Rule Engine Enabled" : "Rule Engine Disabled");

		const file = this.app.workspace.getActiveFile();

		if (file) {
			void this.processActiveView(file);
		}
	}

	onunload() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) {
				this.restoreDefaultView(leaf.view);
			}
		});
		// Clean up canvas nodes
		this.restoreAllCanvasNodes();
	}

	async processActiveView(file: TFile | null) {
		if (!file) return;

		const leaf = this.app.workspace.getLeaf(false);
		if (!(leaf.view instanceof MarkdownView)) return;

		const view = leaf.view;

		if (!this.settings.enabled) {
			this.restoreDefaultView(view);
			return;
		}

		const cache = this.app.metadataCache.getFileCache(file);
		let matchedTemplate = "";
		let commandIds: string[] = [];
		let baseFileHandling: BaseFileHandling = "file";

		for (const ruleConfig of this.settings.rules) {
			const isMatch = checkRules(this.app, ruleConfig.filterGroup, file, cache?.frontmatter);
			if (isMatch) {
				matchedTemplate = ruleConfig.template;
				commandIds = ruleConfig.commandIds;
				baseFileHandling = ruleConfig.baseFileHandling;
				break;
			}
		}

		this.executeCommands(baseFileHandling, commandIds);

		if (!matchedTemplate) {
			this.restoreDefaultView(view);
			return;
		}

		const state = view.getState();
		const isTrueSourceMode = state.mode === 'source' && state.source === true;
		const isReadingMode = state.mode === 'preview';
		const isLivePreviewMode = state.mode === 'source' && state.source === false;

		if (isTrueSourceMode) {
			this.restoreDefaultView(view);
			return;
		}

		if (!this.settings.workInLivePreview && !isReadingMode) {
			this.restoreDefaultView(view);
			return;
		} else if (!isReadingMode && !isLivePreviewMode) {
			this.restoreDefaultView(view);
			return;
		}

		await this.injectCustomView(view.contentEl, file, matchedTemplate);
	}

	async injectCustomView(container: HTMLElement, file: TFile, template: string) {
		let customEl = container.querySelector(`.${CUSTOM_RULE_CLASS}`) as HTMLElement;

		if (!customEl) {
			customEl = document.createElement("div");
			customEl.addClass(CUSTOM_RULE_CLASS);
			container.appendChild(customEl);

			this.registerDomEvent(customEl, "click", (evt: MouseEvent) => {
				const target = evt.target as HTMLElement;
				const link = target.closest(".internal-link");

				if (link && link instanceof HTMLAnchorElement) {
					evt.preventDefault();
					const href = link.getAttribute("data-href") || link.getAttribute("href");

					if (href) {
						const newLeaf = Keymap.isModEvent(evt);
						void this.app.workspace.openLinkText(href, file.path, newLeaf);
					}
				}
			});
		}

		await renderTemplate(this.app, template, file, customEl, this);
		container.addClass(HIDE_MARKDOWN_CLASS);
	}

	restoreDefaultView(view: MarkdownView) {
		const container = view.contentEl;
		container.removeClass(HIDE_MARKDOWN_CLASS);
		const customEl = container.querySelector(`.${CUSTOM_RULE_CLASS}`);
		if (customEl) customEl.remove();
	}

	async loadSettings() {
		const loadedData = await this.loadData() as Partial<CustomRulesSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Process all markdown file nodes in canvas files
	 */
	processAllCanvasNodes() {
		if (!this.settings.enabled || !this.settings.workInCanvas) {
			this.restoreAllCanvasNodes();
			return;
		}

		// Find all canvas views
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			const view = leaf.view;
			// Check if this is a canvas view (CanvasView type may not be exported, so we check by class)
			if (isCanvasView(view) && view.canvas) {
				const canvas = view.canvas;
				if (canvas.nodes) {
					// Process each node in the canvas
					canvas.nodes.forEach((node) => {
						if (node.file && node.file instanceof TFile && node.file.extension === "md") {
							void this.processCanvasNode(node);
						}
					});
				}
			}
		});
	}

	/**
	 * Process a single canvas node
	 */
	async processCanvasNode(node: CanvasNode) {
		const file = node.file;
		if (!(file instanceof TFile)) return;

		const cache = this.app.metadataCache.getFileCache(file);
		let matchedTemplate = "";
		let commandIds: string[] = [];
		let baseFileHandling: BaseFileHandling = "file";

		for (const ruleConfig of this.settings.rules) {
			const isMatch = ruleConfig.enabled && checkRules(this.app, ruleConfig.filterGroup, file, cache?.frontmatter);
			if (isMatch) {
				matchedTemplate = ruleConfig.template;
				commandIds = ruleConfig.commandIds;
				baseFileHandling = ruleConfig.baseFileHandling;
				break;
			}
		}

		this.executeCommands(baseFileHandling, commandIds);

		if (!matchedTemplate) {
			this.restoreCanvasNode(node);
			return;
		}

		// Find the node's content element
		const nodeEl = node.nodeEl as HTMLElement;
		if (!nodeEl) return;

		// Find the markdown preview container within the node
		const previewContainer = nodeEl.querySelector(".markdown-preview-view") as HTMLElement;
		if (!previewContainer) return;

		await this.injectCustomView(previewContainer, file, matchedTemplate);
	}

	/**
	 * Restore a canvas node to default view
	 */
	restoreCanvasNode(node: CanvasNode) {
		const nodeEl = node.nodeEl as HTMLElement;
		if (!nodeEl) return;

		const previewContainer = nodeEl.querySelector(".markdown-preview-view") as HTMLElement;
		if (!previewContainer) return;

		previewContainer.removeClass(HIDE_MARKDOWN_CLASS);
		const customEl = previewContainer.querySelector(`.${CUSTOM_RULE_CLASS}`);
		if (customEl) customEl.remove();
	}

	/**
	 * Restore all canvas nodes
	 */
	restoreAllCanvasNodes() {
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			const view = leaf.view;
			if (isCanvasView(view) && view.canvas) {
				const canvas = view.canvas;
				if (canvas.nodes) {
					canvas.nodes.forEach((node) => {
						this.restoreCanvasNode(node);
					});
				}
			}
		});
	}

	public get obsidianCommands(): Record<string, Command> {
		// @ts-expect-error 'commands' is private
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const regularCommands = this.app.commands.commands;
		// @ts-expect-error 'commands' is private
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const editorCommands = this.app.commands.editorCommands;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const allCommands: Record<string, Command> = { ...regularCommands, ...editorCommands };
		if (Object.keys(allCommands).length === 0) {
			console.warn('no commands found for rule engine');
		}
		return allCommands;
	}

	executeCommands(mode: BaseFileHandling, commandIds: string[]): void {
		if (!commandIds?.length) return;
		const commandObjects = Object.entries(this.obsidianCommands).filter(([k]) => commandIds.includes(k)).map(([_, cmd]) => cmd);
		if (mode === "file") {
			for (const cmd of commandObjects) {
				const commandFn = cmd?.checkCallback ?? cmd?.callback ?? undefined;
				commandFn?.(false);
			}
		} else {
			console.error(`mode not handled:`, mode);
			throw new Error('base file handling not implemented!');
		}
	}

}
