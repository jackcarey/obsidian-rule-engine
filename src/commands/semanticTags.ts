import { ComboboxSuggestModal } from "comboSuggestModal";
import { addOverrideHint } from "commandSettingsModal";
import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { TFile } from "obsidian";
import { computeSemanticCandidates } from "semanticModel/semanticTagger";
import { computeTfidfCandidates } from "tfidf";
import { appendFrontmatterTags, getFrontmatterTagList, normalizeTag, TagMergeOptions } from "tagFieldUtils";
import { SuggestItem } from "types";

export const SEMANTIC_TAGS_ID = "generate-semantic-tags";

export interface SemanticTagsParams extends Record<string, unknown> {
	frontmatterField?: string;
	maxTags?: number;
	vocabularyWeight?: number;
	override?: boolean;
	confidenceThreshold?: number;
}

const DEFAULT_FIELD = "tags";
const DEFAULT_MAX_TAGS = 10;
const DEFAULT_VOCABULARY_WEIGHT = 0.5;
const DEFAULT_CONFIDENCE_THRESHOLD = 0;

export const semanticTags: GetCommandFn<SemanticTagsParams> = (plugin) => ({
	id: SEMANTIC_TAGS_ID,
	name: "Generate semantic tags",
	description: "Uses a small embedding model to find tags for the active file, up to a max count.",
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
					addOverrideHint(setting, SEMANTIC_TAGS_ID, "frontmatterField");
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
				name: "Existing vault tags vs invented tags",
				desc: (() => {
					const percent = Math.round((params.vocabularyWeight ?? DEFAULT_VOCABULARY_WEIGHT) * 100);
					return `When there's room to add tags, how much of that room goes to tags already used elsewhere in the vault vs new tags invented from this file's own content. Currently ${percent}% from existing vault tags.`;
				})(),
				render: (setting) => {
					const descFor = (percent: number) =>
						`When there's room to add tags, how much of that room goes to tags already used elsewhere in the vault vs new tags invented from this file's own content. Currently ${percent}% from existing vault tags.`;
					const weightPercentEl = { current: Math.round((params.vocabularyWeight ?? DEFAULT_VOCABULARY_WEIGHT) * 100) };
					setting.addSlider(slider => {
						slider
							.setLimits(0, 100, 5)
							.setValue(weightPercentEl.current)
							.onChange(async value => {
								weightPercentEl.current = value;
								setting.setDesc(descFor(value));
								addOverrideHint(setting, SEMANTIC_TAGS_ID, "vocabularyWeight");
								await saveFn({ params: { ...params, vocabularyWeight: value / 100 } });
							});
					});
					addOverrideHint(setting, SEMANTIC_TAGS_ID, "vocabularyWeight");
				},
			},
			{
				name: "Confidence threshold",
				desc: (() => {
					const percent = Math.round((params.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD) * 100);
					return `Minimum similarity a vault tag must reach to be suggested from the embedding model. Higher values mean fewer, more confident matches. Currently ${percent}%.`;
				})(),
				render: (setting) => {
					const descFor = (percent: number) =>
						`Minimum similarity a vault tag must reach to be suggested from the embedding model. Higher values mean fewer, more confident matches. Currently ${percent}%.`;
					const thresholdPercentEl = { current: Math.round((params.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD) * 100) };
					setting.addSlider(slider => {
						slider
							.setLimits(0, 100, 5)
							.setValue(thresholdPercentEl.current)
							.onChange(async value => {
								thresholdPercentEl.current = value;
								setting.setDesc(descFor(value));
								addOverrideHint(setting, SEMANTIC_TAGS_ID, "confidenceThreshold");
								await saveFn({ params: { ...params, confidenceThreshold: value / 100 } });
							});
					});
					addOverrideHint(setting, SEMANTIC_TAGS_ID, "confidenceThreshold");
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
	const minScore = Math.min(1, Math.max(0, params.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD));

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
				? computeSemanticCandidates(plugin.app, file, { maxCandidates: vocabularyTarget, minScore })
				: Promise.resolve([]),
			inventedTarget > 0
				? computeTfidfCandidates(plugin.app, file, { corpusScope: "vault", maxCandidates: inventedTarget })
				: Promise.resolve([]),
		]);

		const candidates = [...vocabularyCandidates, ...inventedCandidates];
		const mergeOptions: TagMergeOptions = { maxCount: maxTags, override: params.override };
		const { addedTags } = await appendFrontmatterTags(plugin.app, file, fieldKey, candidates, mergeOptions);
		plugin.notify(addedTags.length
			? `Added ${addedTags.length} tag${addedTags.length === 1 ? "" : "s"} to "${fieldKey}"`
			: `No new tags found for "${fieldKey}"`);
	} catch (e) {
		plugin.debug(e);
	}
}
