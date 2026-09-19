import type { App, TFile } from "obsidian";

/** Resolved link paths, shared by the matcher and filter hints so they can't drift apart. */
export const outlinkPaths = (app: App, file: TFile): string[] =>
	Object.keys(app.metadataCache.resolvedLinks[file.path] ?? {});

export function inlinkPaths(app: App, file: TFile): string[] {
	const out: string[] = [];
	const all = app.metadataCache.resolvedLinks;
	// for..in avoids allocating an entry pair per note; this runs per file per rule.
	for (const src in all) if (file.path in (all[src] ?? {})) out.push(src);
	return out;
}

export const embedLinks = (app: App, file: TFile): string[] =>
	(app.metadataCache.getFileCache(file)?.embeds ?? []).map((e) => e.link);
