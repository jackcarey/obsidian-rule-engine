import { App, TFile } from "obsidian";

export type TfidfCorpusScope = "vault" | "linked";

export interface TfidfOptions {
	corpusScope: TfidfCorpusScope;
	maxCandidates: number;
	minTermLength?: number;
}

const DEFAULT_MIN_TERM_LENGTH = 3;

// A general-purpose English stopword list; not exhaustive, just enough to
// keep function words out of TF-IDF candidate tags.
const STOPWORDS = new Set([
	"a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
	"be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
	"can", "cannot", "could", "couldn't",
	"did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
	"each", "few", "for", "from", "further",
	"had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "her", "here", "hers", "herself", "him",
	"himself", "his", "how",
	"i", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself",
	"just",
	"me", "more", "most", "mustn't", "my", "myself",
	"no", "nor", "not", "now",
	"of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own",
	"same", "shan't", "she", "should", "shouldn't", "so", "some", "such",
	"than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they",
	"this", "those", "through", "to", "too",
	"under", "until", "up",
	"very",
	"was", "wasn't", "we", "were", "weren't", "what", "when", "where", "which", "while", "who", "whom", "why",
	"with", "won't", "would", "wouldn't",
	"you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves",
]);

function stripFrontmatter(content: string): string {
	const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return match ? content.slice(match[0].length) : content;
}

function tokenize(content: string, minTermLength: number): string[] {
	const body = stripFrontmatter(content)
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!?\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[#*_>~`]+/g, " ")
		.toLowerCase();

	const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
	return words.filter(w => w.length >= minTermLength && !STOPWORDS.has(w) && !/^[\d'-]+$/.test(w));
}

function getCorpusFiles(app: App, file: TFile, scope: TfidfCorpusScope): TFile[] {
	if (scope === "vault") return app.vault.getMarkdownFiles();

	const files = new Map<string, TFile>();
	files.set(file.path, file);

	const forwardLinks = app.metadataCache.resolvedLinks[file.path] ?? {};
	for (const linkedPath of Object.keys(forwardLinks)) {
		const linkedFile = app.vault.getAbstractFileByPath(linkedPath);
		if (linkedFile instanceof TFile && linkedFile.extension === "md") files.set(linkedFile.path, linkedFile);
	}

	for (const [sourcePath, destinations] of Object.entries(app.metadataCache.resolvedLinks)) {
		if (file.path in destinations) {
			const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
			if (sourceFile instanceof TFile && sourceFile.extension === "md") files.set(sourceFile.path, sourceFile);
		}
	}

	return Array.from(files.values());
}

/**
 * Scores the terms in `file` by TF-IDF against a corpus (either the whole
 * vault or just the file's forward/back-linked notes) and returns the
 * top-scoring terms as candidate tags, highest first.
 */
export async function computeTfidfCandidates(app: App, file: TFile, options: TfidfOptions): Promise<string[]> {
	const minTermLength = options.minTermLength ?? DEFAULT_MIN_TERM_LENGTH;
	const corpusFiles = getCorpusFiles(app, file, options.corpusScope);
	const targetContent = await app.vault.cachedRead(file);
	const targetTokens = tokenize(targetContent, minTermLength);
	if (!targetTokens.length) return [];

	const termFrequency = new Map<string, number>();
	for (const term of targetTokens) {
		termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
	}
	const candidateTerms = new Set(termFrequency.keys());

	const documentFrequency = new Map<string, number>();
	let corpusSize = 0;
	for (const corpusFile of corpusFiles) {
		corpusSize++;
		const content = corpusFile.path === file.path ? targetContent : await app.vault.cachedRead(corpusFile);
		const docTerms = new Set(tokenize(content, minTermLength));
		for (const term of candidateTerms) {
			if (docTerms.has(term)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		}
	}

	const scored = Array.from(termFrequency.entries()).map(([term, tf]) => {
		const df = documentFrequency.get(term) ?? 1;
		// Smoothed IDF: stays positive even when a term appears in every corpus document.
		const idf = Math.log((corpusSize + 1) / (df + 1)) + 1;
		return { term, score: tf * idf };
	});
	scored.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

	return scored.slice(0, options.maxCandidates).map(s => s.term);
}
