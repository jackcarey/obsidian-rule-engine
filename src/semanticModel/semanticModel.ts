import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { getModelAssetMap, ModelAsset } from "./modelAssets";

export { cosineSimilarity } from "./vectorMath";

const MODEL_TASK = "feature-extraction";
const MODEL_ID = "rule-engine-bundled-model";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Loads (and memoizes) the bundled embedding pipeline.
 *
 * The web build of @huggingface/transformers behaves differently depending
 * on whether it detects a Node-like `process` - which Electron's renderer
 * (and therefore every Obsidian desktop window) always exposes. When it
 * does, it insists on a *real* file on disk for the ONNX weights, but the
 * web build's own filesystem layer is permanently stubbed out to `{}`, so
 * that path can never succeed. Spoofing `process.release.name` for the
 * duration of the (dynamic) import steers it down its normal in-memory/fetch
 * path instead, which is then served entirely from modelAssets.ts's embedded
 * bytes below - no disk writes, no network access.
 */
async function loadExtractor(): Promise<FeatureExtractionPipeline> {
	const hasProcessRelease = typeof process !== "undefined" && !!process.release;
	const realRelease = hasProcessRelease ? process.release : undefined;
	if (hasProcessRelease) {
		Object.defineProperty(process, "release", {
			value: { name: "obsidian-semantic-tags" },
			configurable: true,
		});
	}

	let transformers: typeof import("@huggingface/transformers");
	try {
		transformers = await import("@huggingface/transformers");
	} finally {
		if (hasProcessRelease) {
			Object.defineProperty(process, "release", { value: realRelease, configurable: true });
		}
	}

	const { pipeline, env } = transformers;
	const assets = getModelAssetMap();

	env.allowRemoteModels = false;
	env.allowLocalModels = true;
	env.localModelPath = "embedded://";
	env.fetch = async (input: string | URL) => {
		const url = input.toString();
		const filename = url.split("/").pop()?.split("?")[0] ?? "";
		const bytes: ModelAsset | undefined = assets[filename];
		if (bytes === undefined) {
			throw new Error(`Semantic tags: no embedded asset for "${url}" (expected filename "${filename}")`);
		}
		return new Response(bytes as BodyInit, { status: 200 });
	};

	return pipeline(MODEL_TASK, MODEL_ID, { dtype: "q8" });
}

function getExtractor(): Promise<FeatureExtractionPipeline> {
	if (!extractorPromise) {
		extractorPromise = loadExtractor().catch(e => {
			extractorPromise = null;
			throw e;
		});
	}
	return extractorPromise;
}

/** Embeds a batch of texts, returning one normalized vector per input, in order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
	if (!texts.length) return [];
	const extractor = await getExtractor();
	const output = await extractor(texts, { pooling: "mean", normalize: true });
	const dim = output.dims[output.dims.length - 1] ?? 0;
	const data = Array.from(output.data as ArrayLike<number>);
	const vectors: number[][] = [];
	for (let i = 0; i < texts.length; i++) {
		vectors.push(data.slice(i * dim, (i + 1) * dim));
	}
	return vectors;
}
