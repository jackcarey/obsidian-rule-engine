import { addOverrideHint } from "commandSettingsModal";
import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { Notice, TFile } from "obsidian";
import { applyMocSection, findMocMatches, getFileTags, MocMode } from "moc";

export const AUTO_MOC_ID = "generate-auto-moc";

export interface AutoMocParams extends Record<string, unknown> {
	mode?: MocMode;
	heading?: string;
}

const DEFAULT_MODE: MocMode = "any";
const DEFAULT_HEADING = "Related notes";

export const autoMoc: GetCommandFn<AutoMocParams> = (plugin) => ({
	id: AUTO_MOC_ID,
	name: "Generate automatic MOC",
	description: "Builds a 'map of content' under a heading in the active file based on matching tags.",
	settingCallback: (settingGroup, currentConfig, saveFn) => {
		const params = currentConfig.params;

		settingGroup.addSetting(setting => {
			setting
				.setName("Mode")
				.setDesc("\"any\" matches notes sharing at least one tag. \"all\" matches notes that have every one of this file's tags.")
				.addDropdown(dropdown => {
					dropdown
						.addOption("any", "Any shared tag")
						.addOption("all", "All tags")
						.setValue(params.mode ?? DEFAULT_MODE)
						.onChange(async value => {
							await saveFn({ params: { ...params, mode: value } });
						});
				});
			addOverrideHint(setting, AUTO_MOC_ID, "mode");
		});

		settingGroup.addSetting(setting => {
			setting
				.setName("Heading")
				.setDesc("The heading to place the list under. Created automatically if it doesn't exist yet.")
				.addText(text => {
					text.setValue(params.heading?.length ? params.heading : DEFAULT_HEADING);
					text.onChange(async value => {
						await saveFn({ params: { ...params, heading: value } });
					});
				});
			addOverrideHint(setting, AUTO_MOC_ID, "heading");
		});
	},
	checkCallback: (checking: boolean) => {
		const file = plugin?.app.workspace.getActiveFile();
		if (checking) {
			return !!plugin && !!file && file.extension === "md";
		}
		if (!plugin || !file) return false;

		const config = plugin.getCommandConfig<AutoMocParams>(AUTO_MOC_ID);
		if (!config?.enabled) return false;

		void runAutoMoc(plugin, file, config.params);
		return true;
	},
});

async function runAutoMoc(plugin: ObsidianRuleEnginePlugin, file: TFile, params: AutoMocParams): Promise<void> {
	const mode = params.mode ?? DEFAULT_MODE;
	const heading = params.heading?.trim().length ? params.heading.trim() : DEFAULT_HEADING;

	try {
		const sourceTags = getFileTags(plugin.app, file);
		if (!sourceTags.length) return;

		const matches = findMocMatches(plugin.app, file, sourceTags, mode);
		const lines = matches.map(m => `- [[${plugin.app.metadataCache.fileToLinktext(m, file.path)}]]`);
		const headings = plugin.app.metadataCache.getFileCache(file)?.headings ?? [];

		await plugin.app.vault.process(file, data => applyMocSection(data, headings, heading, lines));

		new Notice(matches.length
			? `Updated MOC under "${heading}" with ${matches.length} link${matches.length === 1 ? "" : "s"}`
			: `No matching notes found for "${heading}"`);
	} catch (e) {
		plugin.debug(e);
	}
}
