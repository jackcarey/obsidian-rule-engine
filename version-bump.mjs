import { readFileSync, writeFileSync } from "fs";

// 1. Read the NEW version directly from package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const targetVersion = pkg.version;

// 2. Update manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// 3. Update versions.json
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

// Only add if this specific version key doesn't exist yet
if (!versions[targetVersion]) {
    versions[targetVersion] = minAppVersion;
    writeFileSync('versions.json', JSON.stringify(versions, null, '\t'));
}