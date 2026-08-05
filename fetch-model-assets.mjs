// Downloads the quantized embedding model used by the "Semantic tags" command
// and copies the matching onnxruntime-web WASM runtime out of node_modules,
// so esbuild can embed them into main.js at build time. Not run automatically
// by `npm install` - see README.md ("Updating the bundled semantic model")
// for when/why to re-run this or point it at a different model.
import { existsSync, mkdirSync, copyFileSync, statSync, writeFileSync } from "fs";
import path from "path";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const OUT_DIR = path.join("src", "assets", "model");

// JSON files are saved with an extra ".txt" suffix so esbuild's `.txt` (text)
// loader picks them up as plain strings, rather than its default `.json`
// loader (which the project can't consume as a default import - see
// modelAssets.ts). They're valid JSON text either way; we only need the raw
// bytes to serve back to transformers.js at runtime, never a parsed object.
const HF_FILES = [
    { remote: "config.json", local: "config.json.txt" },
    { remote: "tokenizer.json", local: "tokenizer.json.txt" },
    { remote: "tokenizer_config.json", local: "tokenizer_config.json.txt" },
    { remote: "special_tokens_map.json", local: "special_tokens_map.json.txt" },
    { remote: "vocab.txt", local: "vocab.txt" },
    { remote: "onnx/model_quantized.onnx", local: "onnx/model_quantized.onnx" },
];

const WASM_RUNTIME_FILE = "ort-wasm-simd-threaded.wasm";
const WASM_SOURCE = path.join("node_modules", "onnxruntime-web", "dist", WASM_RUNTIME_FILE);

async function downloadFile(url, destPath) {
    if (existsSync(destPath) && statSync(destPath).size > 0) {
        console.log(`  skip (exists): ${destPath}`);
        return;
    }
    console.log(`  fetching ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    mkdirSync(path.dirname(destPath), { recursive: true });
    writeFileSync(destPath, buffer);
    console.log(`  wrote ${destPath} (${buffer.byteLength} bytes)`);
}

async function main() {
    console.log(`Fetching model assets for ${MODEL_ID} into ${OUT_DIR}/ ...`);
    for (const { remote, local } of HF_FILES) {
        await downloadFile(`${HF_BASE}/${remote}`, path.join(OUT_DIR, local));
    }

    if (!existsSync(WASM_SOURCE)) {
        throw new Error(
            `Could not find ${WASM_SOURCE}. Run "npm install" first (onnxruntime-web ships as a dependency of @huggingface/transformers).`
        );
    }
    const wasmDest = path.join(OUT_DIR, WASM_RUNTIME_FILE);
    if (!existsSync(wasmDest) || statSync(wasmDest).size === 0) {
        mkdirSync(path.dirname(wasmDest), { recursive: true });
        copyFileSync(WASM_SOURCE, wasmDest);
        console.log(`  copied ${wasmDest}`);
    } else {
        console.log(`  skip (exists): ${wasmDest}`);
    }

    console.log("Model assets ready.");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
