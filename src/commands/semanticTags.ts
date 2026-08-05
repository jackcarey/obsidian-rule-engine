import { ComboboxSuggestModal } from "comboSuggestModal";
import { addOverrideHint } from "commandSettingsModal";
import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { Notice, TFile } from "obsidian";
import { computeSemanticCandidates } from "semanticModel/semanticTagger";
import { computeTfidfCandidates } from "tfidf";
import { appendFrontmatterTags, getFrontmatterTagList, normalizeTag, TagMergeOptions } from "tagFieldUtils";
import { SuggestItem } from "types";

export const SEMANTIC_TAGS_ID = "generate-semantic-tags";

export interface SemanticTagsParams extends Record<string, unknown> {
	frontmatterField?: string;
	maxTags?: number;
	vocabularyWeight?: number;
}

const DEFAULT_FIELD = "tags";
const DEFAULT_MAX_TAGS = 10;
const DEFAULT_VOCABULARY_WEIGHT = 0.5;

export const semanticTags: GetCommandFn<SemanticTagsParams> = (plugin) => ({
	id: SEMANTIC_TAGS_ID,
	name: "Generate semantic tags",
	description: "Uses a small embedding model to find tags for the active file, up to a max count, and appends them to a frontmatter field without removing any tags already there. A weight setting controls whether new tags are drawn from ones already used elsewhere in the vault or invented from the file's own content. The first run downloads the model (needs network access once); after that it's cached and works offline.",
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
			addOverrideHint(setting, SEMANTIC_TAGS_ID, "frontmatterField");
		});

		settingGroup.addSetting(setting => {
			setting
				.setName("Max tags")
				.setDesc("Ceiling on the field's total tag count. Existing tags are never removed to enforce this - it only caps how many new tags get added.")
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
			addOverrideHint(setting, SEMANTIC_TAGS_ID, "maxTags");
		});

		settingGroup.addSetting(setting => {
			const descFor = (percent: number) =>
				`When there's room to add tags, how much of that room goes to tags already used elsewhere in the vault vs new tags invented from this file's own content. Currently ${percent}% from existing vault tags.`;
			// setDesc() empties descEl on every call, so the override hint has to
			// be re-added each time it's called, not just once after setup.
			const updateDesc = (percent: number) => {
				setting.setDesc(descFor(percent));
				addOverrideHint(setting, SEMANTIC_TAGS_ID, "vocabularyWeight");
			};
			const weightPercentEl = { current: Math.round((params.vocabularyWeight ?? DEFAULT_VOCABULARY_WEIGHT) * 100) };
			setting.setName("Existing vault tags vs invented tags");
			updateDesc(weightPercentEl.current);
			setting.addSlider(slider => {
				slider
					.setLimits(0, 100, 5)
					.setValue(weightPercentEl.current)
					.onChange(async value => {
						weightPercentEl.current = value;
						updateDesc(value);
						await saveFn({ params: { ...params, vocabularyWeight: value / 100 } });
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

		const config = plugin.getCommandConfig<SemanticTagsParams>(SEMANTIC_TAGS_ID);
		if (!config?.enabled) return false;

		void runSemanticTagging(plugin, file, config.params);
		return true;
	},
});

async function runSemanticTagging(plugin: ObsidianRuleEnginePlugin, file: TFile, params: SemanticTagsParams): Promise<void> {
	const fieldKey = params.frontmatterField?.length ? params.frontmatterField : DEFAULT_FIELD;
	const maxTags = params.maxTags && params.maxTags > 0 ? params.maxTags : DEFAULT_MAX_TAGS;
	const weight = Math.min(1, Math.max(0, params.vocabularyWeight ?? DEFAULT_VOCABULARY_WEIGHT));

	try {
		const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const existingCount = new Set(
			getFrontmatterTagList(frontmatter, fieldKey).map(t => normalizeTag(t).toLowerCase()).filter(Boolean)
		).size;
		const remainingSlots = Math.max(0, maxTags - existingCount);

		const vocabularyTarget = Math.round(remainingSlots * weight);
		const inventedTarget = remainingSlots - vocabularyTarget;

		const [vocabularyCandidates, inventedCandidates] = await Promise.all([
			vocabularyTarget > 0
				? computeSemanticCandidates(plugin.app, file, { maxCandidates: vocabularyTarget })
				: Promise.resolve([]),
			inventedTarget > 0
				? computeTfidfCandidates(plugin.app, file, { corpusScope: "vault", maxCandidates: inventedTarget })
				: Promise.resolve([]),
		]);

		const candidates = [...vocabularyCandidates, ...inventedCandidates];
		const mergeOptions: TagMergeOptions = { maxCount: maxTags };
		const { addedTags } = await appendFrontmatterTags(plugin.app, file, fieldKey, candidates, mergeOptions);
		new Notice(addedTags.length
			? `Added ${addedTags.length} tag${addedTags.length === 1 ? "" : "s"} to "${fieldKey}"`
			: `No new tags found for "${fieldKey}"`);
	} catch (e) {
		plugin.debug(e);
	}
}
