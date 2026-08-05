import { ComboboxSuggestModal } from "comboSuggestModal";
import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { Notice, TFile } from "obsidian";
import { appendFrontmatterTags, TagMergeOptions } from "tagFieldUtils";
import { computeTfidfCandidates, TfidfCorpusScope } from "tfidf";
import { SuggestItem } from "types";

export const TFIDF_TAGS_ID = "generate-tfidf-tags";

export interface TfidfTagsParams extends Record<string, unknown> {
	frontmatterField?: string;
	maxTags?: number;
	corpusScope?: TfidfCorpusScope;
}

const DEFAULT_FIELD = "tags";
const DEFAULT_MAX_TAGS = 10;
const DEFAULT_CORPUS_SCOPE: TfidfCorpusScope = "vault";

export const tfidfTags: GetCommandFn<TfidfTagsParams> = (plugin) => ({
	id: TFIDF_TAGS_ID,
	name: "Generate TF-IDF tags",
	description: "Scores the active file's words against a corpus of other notes and appends the most distinctive terms to a frontmatter field, keeping existing tags and respecting a max count.",
	settingCallback: (settingGroup, currentConfig, saveFn) => {
		const params = currentConfig.params;

		settingGroup.addSetting(setting => {
			setting
				.setName("Frontmatter field")
				.setDesc("The frontmatter list field tags are appended to.")
				.addButton(buttonEl => {
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
		});

		settingGroup.addSetting(setting => {
			setting
				.setName("Max tags")
				.setDesc("Maximum number of tags kept in the field once existing and new tags are merged.")
				.addText(text => {
					text.inputEl.type = "number";
					text.inputEl.min = "1";
					text.setValue(String(params.maxTags ?? DEFAULT_MAX_TAGS));
					text.onChange(async value => {
						const parsed = parseInt(value, 10);
						if (Number.isFinite(parsed) && parsed > 0) {
							await saveFn({ params: { ...params, maxTags: parsed } });
						}
					});
				});
		});

		settingGroup.addSetting(setting => {
			setting
				.setName("Compare against")
				.setDesc("Which notes to compute document frequency against. Linked notes is faster on large vaults.")
				.addDropdown(dropdown => {
					dropdown
						.addOption("vault", "Whole vault")
						.addOption("linked", "Linked notes (forward + back links)")
						.setValue(params.corpusScope ?? DEFAULT_CORPUS_SCOPE)
						.onChange(async value => {
							await saveFn({ params: { ...params, corpusScope: value as TfidfCorpusScope } });
						});
				});
		});
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
		const mergeOptions: TagMergeOptions = { maxCount: maxTags, weight: 1 };
		const { addedTags } = await appendFrontmatterTags(plugin.app, file, fieldKey, candidates, mergeOptions);
		new Notice(addedTags.length
			? `Added ${addedTags.length} tag${addedTags.length === 1 ? "" : "s"} to "${fieldKey}"`
			: `No new tags found for "${fieldKey}"`);
	} catch (e) {
		plugin.debug(e);
	}
}
