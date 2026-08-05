import { App } from "obsidian";
import { normalizeTag } from "../tagFieldUtils";

/** Every distinct tag already used anywhere in the vault (body + frontmatter), normalized and deduped case-insensitively. */
export function getVaultTagVocabulary(app: App): string[] {
	const seenKeys = new Set<string>();
	const tags: string[] = [];

	const addTag = (normalized: string) => {
		const key = normalized.toLowerCase();
		if (normalized && !seenKeys.has(key)) {
			seenKeys.add(key);
			tags.push(normalized);
		}
	};

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);

		for (const bodyTag of cache?.tags ?? []) {
			addTag(normalizeTag(bodyTag.tag.replace(/^#+/, "")));
		}

		const frontmatterTags = cache?.frontmatter?.tags as string | string[] | undefined;
		if (frontmatterTags) {
			const list = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
			for (const tag of list) {
				addTag(normalizeTag(String(tag)));
			}
		}
	}

	return tags.sort();
}
