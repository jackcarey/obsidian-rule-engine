import { App, Modal, Setting, SettingGroup } from "obsidian";
import { CommandConfig, CommandSaveFn, CommandSettingCallback } from "types";

/**
 * Appends the per-file frontmatter override key (`ore:<command-id>:<param>`,
 * see the "Per-file overrides" note in settings.ts) below a setting's
 * description, so users configuring a command's params can see exactly what
 * to write in a note's frontmatter to override that specific setting.
 */
export function addOverrideHint(setting: Setting, commandId: string, paramKey: string): void {
	setting.descEl.createDiv({ cls: "ore-command-config-id", text: `ore:${commandId}:${paramKey}` });
}

/**
 * Hosts a command's `settingCallback` in its own modal.
 *
 * Obsidian's declarative settings list only supports one row's worth of
 * controls per list item — the `group: SettingGroup` a `render` callback
 * receives isn't mounted into the live list, so `group.addSetting(...)`
 * calls made from there produce no visible output. A modal sidesteps that
 * entirely: its content element is a real, independently-attached container,
 * so a `SettingGroup` built on top of it renders normally.
 */
export class CommandSettingsModal extends Modal {
	constructor(
		app: App,
		private name: string,
		private settingCallback: CommandSettingCallback,
		private currentConfig: CommandConfig,
		private saveFn: CommandSaveFn
	) {
		super(app);
		this.setTitle(`${name} settings`);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		const group = new SettingGroup(contentEl);
		this.settingCallback(group, this.currentConfig, this.saveFn);
	}

	onClose() {
		this.contentEl.empty();
	}
}
