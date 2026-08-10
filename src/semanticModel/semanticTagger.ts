import { App, TFile } from "obsidian";
import { embedTexts } from "./semanticModel";
import { cosineSimilarity } from "./vectorMath";
import { getVaultTagVocabulary } from "./tagVocabulary";

export interface SemanticTagOptions {
	maxCandidates: number;
	/** Characters of note content fed to the embedding model. */
	contentCharLimit?: number;
	/** Minimum cosine similarity (0-1) a vocabulary tag must reach to be returned. */
	minScore?: number;
}

const DEFAULT_CONTENT_CHAR_LIMIT = 2000;

// Tag text -> embedding. A tag's embedding never changes, so this only ever
// grows for the lifetime of the plugin - no invalidation needed.
const tagEmbeddingCache = new Map<string, number[]>();

async function getTagVectors(vocabulary: string[]): Promise<Map<string, number[]>> {
	const uncached = vocabulary.filter(tag => !tagEmbeddingCache.has(tag));
	if (uncached.length) {
		const vectors = await embedTexts(uncached);
		uncached.forEach((tag, i) => {
			const vector = vectors[i];
			if (vector) tagEmbeddingCache.set(tag, vector);
		});
	}

	const result = new Map<string, number[]>();
	for (const tag of vocabulary) {
		const vector = tagEmbeddingCache.get(tag);
		if (vector) result.set(tag, vector);
	}
	return result;
}

/**
 * Ranks the vault's existing tag vocabulary by semantic similarity to
 * `file`'s content and returns the closest matches, highest first.
 */
export async function computeSemanticCandidates(app: App, file: TFile, options: SemanticTagOptions): Promise<string[]> {
	const vocabulary = getVaultTagVocabulary(app);
	if (!vocabulary.length) return [];

	const content = await app.vault.cachedRead(file);
	const charLimit = options.contentCharLimit ?? DEFAULT_CONTENT_CHAR_LIMIT;
	const noteText = `${file.basename}\n\n${content}`.slice(0, charLimit);

	const [noteVector, tagVectors] = await Promise.all([
		embedTexts([noteText]).then(v => v[0]),
		getTagVectors(vocabulary),
	]);
	if (!noteVector) return [];

	const minScore = options.minScore ?? -Infinity;
	const scored = vocabulary
		.map(tag => ({ tag, score: cosineSimilarity(noteVector, tagVectors.get(tag) ?? []) }))
		.filter(s => tagVectors.has(s.tag) && s.score >= minScore);
	scored.sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

	return scored.slice(0, options.maxCandidates).map(s => s.tag);
}
