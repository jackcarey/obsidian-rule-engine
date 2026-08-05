// Ambient module declarations for asset files embedded into main.js by
// esbuild's binary/text loaders (see esbuild.config.mjs and
// fetch-model-assets.mjs).
declare module "*.onnx" {
	const bytes: Uint8Array;
	export default bytes;
}

declare module "*.wasm" {
	const bytes: Uint8Array;
	export default bytes;
}

declare module "*.txt" {
	const text: string;
	export default text;
}
