import {
	type App,
	Modal,
	type Setting,
	SettingGroup,
	type SettingGroupItem,
} from "obsidian";
import type {
	CommandConfig,
	CommandSaveFn,
	CommandSettingCallback,
} from "types";

/**
 * Appends the per-file frontmatter override key (`ore:<command-id>:<param>`,
 * see the "Per-file overrides" note in settings.ts) below a setting's
 * description, so users configuring a command's params can see exactly what
 * to write in a note's frontmatter to override that specific setting.
 */
export function addOverrideHint(
	setting: Setting,
	commandId: string,
	paramKey: string,
): void {
	setting.descEl.createDiv({
		cls: "ore-command-config-id",
		text: `ore:${commandId}:${paramKey}`,
	});
}

/**
 * Renders a single declarative SettingGroupItem into a SettingGroup, reading/writing
 * its bound value from/to `currentConfig.params` (keyed by `control.key`) instead of
 * a SettingTab's own getControlValue/setControlValue, since a Modal isn't a SettingTab.
 *
 * `control`-less "render" items are handed the freshly named/described Setting
 * directly, mirroring how SettingDefinitionRender items are used elsewhere in this
 * codebase (settings.ts) - the outer name/desc is applied before render() runs, so
 * render() only needs to add its own controls.
 */
function renderSettingGroupItem(
	group: SettingGroup,
	item: SettingGroupItem,
	commandId: string,
	currentConfig: CommandConfig,
	saveFn: CommandSaveFn,
): void {
	// Pages aren't a supported shape for command config today (no command uses one).
	if ("type" in item) return;

	group.addSetting((setting) => {
		setting.setName(item.name).setDesc(item.desc ?? "");

		if (item.render) {
			item.render(setting, group);
			return;
		}

		if (item.action) {
			const action = item.action;
			setting.addButton((btn) =>
				btn
					.setButtonText(item.name)
					.onClick(() => action(setting.controlEl, 0)),
			);
			return;
		}

		if (!item.control) return;
		const control = item.control;
		const key = control.key;
		const params = currentConfig.params;
		const currentValue = params[key] ?? control.defaultValue;
		const save = async (value: unknown) => {
			await saveFn({ params: { [key]: value } });
		};

		switch (control.type) {
			case "toggle":
				setting.addToggle((t) =>
					t.setValue(Boolean(currentValue)).onChange(save),
				);
				break;
			case "dropdown":
				setting.addDropdown((d) => {
					d.addOptions(control.options);
					d.setValue(
						String(
							(currentValue as string | number | boolean | undefined) ?? "",
						),
					);
					d.onChange(save);
				});
				break;
			case "number":
				setting.addText((t) => {
					t.inputEl.type = "number";
					if (control.min !== undefined) t.inputEl.min = String(control.min);
					if (control.max !== undefined) t.inputEl.max = String(control.max);
					if (control.placeholder) t.setPlaceholder(control.placeholder);
					t.setValue(
						currentValue !== undefined
							? String(currentValue as string | number | boolean)
							: "",
					);
					t.onChange((value) => {
						const parsed = parseFloat(value);
						if (Number.isFinite(parsed)) void save(parsed);
					});
				});
				break;
			case "slider":
				setting.addSlider((s) => {
					s.setLimits(control.min, control.max, control.step);
					s.setValue(Number(currentValue ?? control.min));
					s.onChange(save);
				});
				break;
			case "textarea":
				setting.addTextArea((t) => {
					if (control.placeholder) t.setPlaceholder(control.placeholder);
					t.setValue(
						currentValue !== undefined
							? String(currentValue as string | number | boolean)
							: "",
					);
					if (control.rows) t.inputEl.rows = control.rows;
					t.onChange(save);
				});
				break;
			// text/file/folder/color: none of this plugin's commands use these yet;
			// fall back to a plain text input bound to the same key.
			default:
				setting.addText((t) => {
					if ("placeholder" in control && control.placeholder)
						t.setPlaceholder(control.placeholder);
					t.setValue(
						currentValue !== undefined
							? String(currentValue as string | number | boolean)
							: "",
					);
					t.onChange(save);
				});
				break;
		}

		addOverrideHint(setting, commandId, key);
	});
}

/**
 * Hosts a command's `settingCallback` in its own modal.
 *
 * The callback returns a declarative array of SettingGroupItem (the same object
 * form used for the plugin's own settings tab, settings.ts#getSettingDefinitions)
 * instead of imperatively building controls - this modal is what actually renders
 * that array, since a bare Modal has no built-in declarative-settings renderer the
 * way PluginSettingTab/SettingPage do.
 */
export class CommandSettingsModal extends Modal {
	constructor(
		app: App,
		private commandId: string,
		private name: string,
		private settingCallback: CommandSettingCallback,
		private currentConfig: CommandConfig,
		private saveFn: CommandSaveFn,
	) {
		super(app);
		this.setTitle(`${name} settings`);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const group = new SettingGroup(contentEl);
		const items = this.settingCallback(this.currentConfig, this.saveFn);
		for (const item of items) {
			renderSettingGroupItem(
				group,
				item,
				this.commandId,
				this.currentConfig,
				this.saveFn,
			);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
