import { ComboboxSuggestModal } from "comboSuggestModal";
import { addOverrideHint } from "commandSettingsModal";
import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { TFile } from "obsidian";
import { appendFrontmatterTags, TagMergeOptions } from "tagFieldUtils";
import { computeTfidfCandidates, TfidfCorpusScope } from "tfidf";
import { SuggestItem } from "types";

export const TFIDF_TAGS_ID = "generate-tfidf-tags";

export interface TfidfTagsParams extends Record<string, unknown> {
	frontmatterField?: string;
	maxTags?: number;
	corpusScope?: TfidfCorpusScope;
	override?: boolean;
}

const DEFAULT_FIELD = "tags";
const DEFAULT_MAX_TAGS = 10;
const DEFAULT_CORPUS_SCOPE: TfidfCorpusScope = "vault";

export const tfidfTags: GetCommandFn<TfidfTagsParams> = (plugin) => ({
	id: TFIDF_TAGS_ID,
	name: "Generate TF-IDF tags",
	description: "Scores the active file's words against a corpus of other notes.",
	settingCallback: (currentConfig, saveFn) => {
		const params = currentConfig.params;

		return [
			{
				name: "Frontmatter field",
				desc: "The frontmatter list field tags are appended to.",
				render: (setting) => {
					setting.addButton(buttonEl => {
						const propertyDefs = plugin.scanVaultProperties();
						const suggestItems: SuggestItem[] = propertyDefs.map(def => ({
							label: def.key,
							value: def.key,
							icon: plugin.getPropertyIcon(def.key, def.type),
						}));
						const fieldValue = params.frontmatterField?.length ? params.frontmatterField : DEFAULT_FIELD;
						buttonEl.setButtonText(fieldValue);
						const onSelect = (value: string) => {
							const field = value?.length ? value : DEFAULT_FIELD;
							saveFn({ params: { ...params, frontmatterField: field } }).then(() => {
								buttonEl.setButtonText(field);
							}).catch(e => plugin.debug(e));
						};
						const combo = new ComboboxSuggestModal(
							plugin.app,
							suggestItems,
							fieldValue,
							onSelect,
							buttonEl.buttonEl,
						);
						buttonEl.onClick(() => combo.open());
					});
					addOverrideHint(setting, TFIDF_TAGS_ID, "frontmatterField");
				},
			},
			{
				name: "Max tags",
				desc: "Ceiling on the field's total tag count. In append mode existing tags are never removed to enforce this - it only caps how many new tags get added.",
				control: { type: "number", key: "maxTags", defaultValue: DEFAULT_MAX_TAGS, min: 1 },
			},
			{
				name: "Override existing tags",
				desc: "Replace the field's tags with the newly generated ones instead of adding to them.",
				control: { type: "toggle", key: "override" },
			},
			{
				name: "Compare against",
				desc: "Which notes to compute document frequency against. Linked notes is faster on large vaults.",
				control: {
					type: "dropdown",
					key: "corpusScope",
					defaultValue: DEFAULT_CORPUS_SCOPE,
					options: { vault: "Whole vault", linked: "Linked notes (forward + back links)" },
				},
			},
		];
	},
	checkCallback: (checking: boolean) => {
		const file = plugin?.app.workspace.getActiveFile();
		if (checking) {
			return !!plugin && !!file && file.extension === "md";
		}
		if (!plugin || !file) return false;

		const config = plugin.getCommandConfig<TfidfTagsParams>(TFIDF_TAGS_ID);
		if (!config?.enabled) return false;

		void runTfidfTagging(plugin, file, config.params);
		return true;
	},
});

async function runTfidfTagging(plugin: ObsidianRuleEnginePlugin, file: TFile, params: TfidfTagsParams): Promise<void> {
	const fieldKey = params.frontmatterField?.length ? params.frontmatterField : DEFAULT_FIELD;
	const maxTags = params.maxTags && params.maxTags > 0 ? params.maxTags : DEFAULT_MAX_TAGS;
	const corpusScope = params.corpusScope ?? DEFAULT_CORPUS_SCOPE;

	try {
		const candidates = await computeTfidfCandidates(plugin.app, file, {
			corpusScope,
			maxCandidates: maxTags * 2,
		});
		const mergeOptions: TagMergeOptions = { maxCount: maxTags, override: params.override };
		const { addedTags } = await appendFrontmatterTags(plugin.app, file, fieldKey, candidates, mergeOptions);
		plugin.notify(addedTags.length
			? `Added ${addedTags.length} tag${addedTags.length === 1 ? "" : "s"} to "${fieldKey}"`
			: `No new tags found for "${fieldKey}"`);
	} catch (e) {
		plugin.debug(e);
	}
}
