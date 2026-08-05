import { ComboboxSuggestModal } from "comboSuggestModal";
import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { Notice, TFile } from "obsidian";
import { computeSemanticCandidates } from "semanticModel/semanticTagger";
import { appendFrontmatterTags, TagMergeOptions } from "tagFieldUtils";
import { SuggestItem } from "types";

export const SEMANTIC_TAGS_ID = "generate-semantic-tags";

export interface SemanticTagsParams extends Record<string, unknown> {
	frontmatterField?: string;
	maxTags?: number;
	existingTagWeight?: number;
}

const DEFAULT_FIELD = "tags";
const DEFAULT_MAX_TAGS = 10;
const DEFAULT_EXISTING_TAG_WEIGHT = 0.5;

export const semanticTags: GetCommandFn<SemanticTagsParams> = (plugin) => ({
	id: SEMANTIC_TAGS_ID,
	name: "Generate semantic tags",
	description: "Uses a small bundled embedding model to match the active file's content against tags already used elsewhere in the vault, and appends the closest matches to a frontmatter field. A weight setting controls how much of the tag limit is reserved for existing tags vs new suggestions. The first run may take a moment while the model loads.",
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
			const weightPercentEl = { current: Math.round((params.existingTagWeight ?? DEFAULT_EXISTING_TAG_WEIGHT) * 100) };
			setting
				.setName("Existing vs new tag weight")
				.setDesc(`How much of the tag limit favors existing tags over new suggestions once the field is full. Currently ${weightPercentEl.current}% existing.`)
				.addSlider(slider => {
					slider
						.setLimits(0, 100, 5)
						.setValue(weightPercentEl.current)
						.onChange(async value => {
							weightPercentEl.current = value;
							setting.setDesc(`How much of the tag limit favors existing tags over new suggestions once the field is full. Currently ${value}% existing.`);
							await saveFn({ params: { ...params, existingTagWeight: value / 100 } });
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
	const weight = params.existingTagWeight ?? DEFAULT_EXISTING_TAG_WEIGHT;

	try {
		const candidates = await computeSemanticCandidates(plugin.app, file, {
			maxCandidates: maxTags * 2,
		});
		const mergeOptions: TagMergeOptions = { maxCount: maxTags, weight };
		const { addedTags } = await appendFrontmatterTags(plugin.app, file, fieldKey, candidates, mergeOptions);
		new Notice(addedTags.length
			? `Added ${addedTags.length} tag${addedTags.length === 1 ? "" : "s"} to "${fieldKey}"`
			: `No new tags found for "${fieldKey}"`);
	} catch (e) {
		plugin.debug(e);
	}
}
