import type { GetCommandFn } from "commands";
import type ObsidianRuleEnginePlugin from "main";
import {
	applyMocSection,
	findMocMatches,
	getFileTags,
	type MocMode,
} from "moc";
import type { TFile } from "obsidian";

export const AUTO_MOC_ID = "generate-auto-moc";

export interface AutoMocParams extends Record<string, unknown> {
	mode?: MocMode;
	heading?: string;
	headingLevel?: number;
}

const DEFAULT_MODE: MocMode = "any";
const DEFAULT_HEADING = "Related notes";
const DEFAULT_HEADING_LEVEL = 2;

export const autoMoc: GetCommandFn<AutoMocParams> = (plugin) => ({
	id: AUTO_MOC_ID,
	name: "Generate automatic MOC",
	description:
		"Builds a 'map of content' under a heading in the active file based on matching tags.",
	settingCallback: () => [
		{
			name: "Mode",
			desc: '"any" matches notes sharing at least one tag. "all" matches notes that have every one of this file\'s tags.',
			control: {
				type: "dropdown",
				key: "mode",
				defaultValue: DEFAULT_MODE,
				options: { any: "Any shared tag", all: "All tags" },
			},
		},
		{
			name: "Heading",
			desc: "The heading to place the list under. Created automatically if it doesn't exist yet.",
			control: { type: "text", key: "heading", defaultValue: DEFAULT_HEADING },
		},
		{
			name: "Missing heading level",
			desc: "Heading level to use when the heading above doesn't exist yet and needs to be created (1-6).",
			control: {
				type: "number",
				key: "headingLevel",
				defaultValue: DEFAULT_HEADING_LEVEL,
				min: 1,
				max: 6,
			},
		},
	],
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

async function runAutoMoc(
	plugin: ObsidianRuleEnginePlugin,
	file: TFile,
	params: AutoMocParams,
): Promise<void> {
	const mode = params.mode ?? DEFAULT_MODE;
	const heading = params.heading?.trim().length
		? params.heading.trim()
		: DEFAULT_HEADING;
	const headingLevel = params.headingLevel ?? DEFAULT_HEADING_LEVEL;

	try {
		const sourceTags = getFileTags(plugin.app, file);
		if (!sourceTags.length) return;

		const matches = findMocMatches(plugin.app, file, sourceTags, mode);
		const lines = matches.map(
			(m) => `- [[${plugin.app.metadataCache.fileToLinktext(m, file.path)}]]`,
		);
		const headings =
			plugin.app.metadataCache.getFileCache(file)?.headings ?? [];

		await plugin.app.vault.process(file, (data) =>
			applyMocSection(data, headings, heading, lines, headingLevel),
		);

		plugin.notify(
			matches.length
				? `Updated MOC under "${heading}" with ${matches.length} link${matches.length === 1 ? "" : "s"}`
				: `No matching notes found for "${heading}"`,
		);
	} catch (e) {
		plugin.debug(e);
	}
}
