import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { requestUrl } from "obsidian";

export { cosineSimilarity } from "./vectorMath";

const MODEL_TASK = "feature-extraction";
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

const MAX_FETCH_ATTEMPTS = 5;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => window.setTimeout(resolve, ms));
}

function isOk(status: number): boolean {
	return status >= 200 && status < 300;
}

/**
 * env.fetch for the model loader below, backed by Obsidian's `requestUrl`
 * instead of the global `fetch` - this is what Obsidian recommends for
 * network requests (see the `no-restricted-globals` lint rule), and unlike
 * `fetch` it isn't subject to CORS, which matters on mobile's Capacitor
 * WebView. Retries with backoff on top, since a transient Hugging Face rate
 * limit (429) or blip shouldn't be fatal - this runs on every cache-cold
 * load (first use, or after clearing the vault's local storage).
 *
 * `requestUrl` buffers the whole response before resolving (no streaming),
 * so wrapping its result in a real `Response` loses incremental download
 * progress, but is otherwise a faithful stand-in: transformers.js reads
 * `.ok`/`.status`/`.headers`/`.arrayBuffer()`/`.clone()` off the result, all
 * of which `Response` provides natively once constructed.
 */
async function fetchWithRetry(input: string | URL, init?: RequestInit): Promise<Response> {
	const url = input.toString();
	const method = init?.method ?? "GET";
	const requestHeaders: Record<string, string> = {};
	if (init?.headers) {
		new Headers(init.headers).forEach((value, key) => { requestHeaders[key] = value; });
	}

	for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
		let res;
		try {
			res = await requestUrl({ url, method, headers: requestHeaders, throw: false });
		} catch (e) {
			if (attempt === MAX_FETCH_ATTEMPTS) throw e;
			await sleep(2 ** attempt * 1000);
			continue;
		}
		const responseHeaders = new Headers(res.headers);
		if (isOk(res.status) || !RETRYABLE_STATUS.has(res.status) || attempt === MAX_FETCH_ATTEMPTS) {
			return new Response(res.arrayBuffer, { status: res.status, headers: responseHeaders });
		}
		const retryAfter = Number(responseHeaders.get("retry-after"));
		const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
		await sleep(delayMs);
	}
	throw new Error("unreachable");
}

/**
 * Loads (and memoizes) the embedding pipeline.
 *
 * The web build of @huggingface/transformers behaves differently depending
 * on whether it detects a Node-like `process` - which Electron's renderer
 * (and therefore every Obsidian desktop window) always exposes. When it
 * does, it insists on a *real* file on disk for the ONNX weights, but the
 * web build's own filesystem layer is permanently stubbed out to `{}`, so
 * that path can never succeed. Spoofing `process.release.name` for the
 * duration of the (dynamic) import steers it down its normal fetch/browser-
 * cache path instead: model files are downloaded from Hugging Face on first
 * use and cached in the Cache Storage API from then on, so only the very
 * first run (or a cleared cache) needs the network.
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

	env.allowRemoteModels = true;
	env.allowLocalModels = false;
	env.fetch = fetchWithRetry;

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
