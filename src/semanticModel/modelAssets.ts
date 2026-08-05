// Raw model/runtime bytes, embedded straight into main.js by esbuild's
// binary/text loaders (see esbuild.config.mjs). Sourced by
// fetch-model-assets.mjs from the Xenova/all-MiniLM-L6-v2 ONNX export plus
// the matching onnxruntime-web WASM runtime - see README.md for how to
// update either. This is the only file that should know about the concrete
// asset filenames; everything else goes through getModelAssetMap().
// The four JSON files are saved with a ".txt" suffix by fetch-model-assets.mjs
// and imported as raw text (rather than parsed via esbuild's default JSON
// loader) purely to sidestep this project's `allowSyntheticDefaultImports:
// false` - we only ever need their original bytes back, never a parsed object.
import configJsonText from "assets/model/config.json.txt";
import tokenizerJsonText from "assets/model/tokenizer.json.txt";
import tokenizerConfigJsonText from "assets/model/tokenizer_config.json.txt";
import specialTokensMapJsonText from "assets/model/special_tokens_map.json.txt";
import vocabText from "assets/model/vocab.txt";
import onnxModelBytes from "assets/model/onnx/model_quantized.onnx";
import onnxRuntimeWasmBytes from "assets/model/ort-wasm-simd-threaded.wasm";

export type ModelAsset = Uint8Array | string;

/**
 * Every embedded asset, keyed by the filename transformers.js/onnxruntime-web
 * request when loading the model - see semanticModel.ts's env.fetch override,
 * which serves requests purely from this map (no disk or network access).
 */
export function getModelAssetMap(): Record<string, ModelAsset> {
	return {
		"config.json": configJsonText,
		"tokenizer.json": tokenizerJsonText,
		"tokenizer_config.json": tokenizerConfigJsonText,
		"special_tokens_map.json": specialTokensMapJsonText,
		"vocab.txt": vocabText,
		"model_quantized.onnx": onnxModelBytes,
		"ort-wasm-simd-threaded.wasm": onnxRuntimeWasmBytes,
	};
}
