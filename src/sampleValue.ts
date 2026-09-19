import type { App, TFile } from "obsidian";
import { embedLinks, inlinkPaths, outlinkPaths } from "./fileFields";
import { getFileTags } from "./tagFieldUtils";
import { formatLocalDate } from "./taskDates";

const MAX_LEN = 80;
const MAX_ITEMS = 3;

/** Candidate files, best first: open, recent, then newest-edited. */
export function referenceCandidates(
	active: TFile | null,
	recentPaths: string[],
	lookup: (path: string) => TFile | null,
	allMarkdown: TFile[],
): TFile[] {
	const seen = new Set<string>();
	const out: TFile[] = [];
	const add = (f: TFile | null) => {
		if (f?.extension === "md" && !seen.has(f.path)) {
			seen.add(f.path);
			out.push(f);
		}
	};
	add(active);
	for (const p of recentPaths) add(lookup(p));
	for (const f of [...allMarkdown].sort((a, b) => b.stat.mtime - a.stat.mtime)) add(f);
	return out;
}

/** First file with a usable example, since the open note often lacks the property. */
export function findSample(
	app: App,
	files: TFile[],
	field: string,
): { text: string; file: TFile } | null {
	for (const file of files) {
		const text = describeSample(app, file, field);
		if (text !== null) return { text, file };
	}
	return null;
}

const truncate = (s: string) => (s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s);

function formatList(items: unknown[]): string {
	const shown = items.slice(0, MAX_ITEMS).map(formatScalar).join(", ");
	const more = items.length - MAX_ITEMS;
	return more > 0 ? `${shown} (+${more} more)` : shown;
}

// Empty gives no example, so the search moves on.
const listOrNull = (items: unknown[]) => (items.length ? formatList(items) : null);

function formatScalar(v: unknown): string {
	if (typeof v === "string") return truncate(v);
	if (typeof v === "object" && v !== null) return truncate(JSON.stringify(v));
	return String(v);
}

/** Display text for a property on one file, or null if there is nothing to show. */
export function describeSample(app: App, file: TFile, field: string): string | null {
	const fm: Record<string, unknown> | undefined = app.metadataCache.getFileCache(file)?.frontmatter;

	switch (field) {
		case "file": {
			const props = Object.keys(fm ?? {}).filter((k) => k !== "position");
			return [
				`folder: ${file.parent?.path || "/"}`,
				`tags: ${listOrNull(getFileTags(app, file)) ?? "none"}`,
				`properties: ${listOrNull(props) ?? "none"}`,
			].join(" · ");
		}
		case "file.name": return file.name;
		case "file.basename": return file.basename;
		case "file.extension": return file.extension;
		case "file.path": return truncate(file.path);
		case "file.folder": return file.parent?.path || "/";
		case "file.size": return `${file.stat.size} bytes`;
		case "file.ctime": return formatLocalDate(file.stat.ctime);
		case "file.mtime": return formatLocalDate(file.stat.mtime);
		case "file.outlinks": return String(outlinkPaths(app, file).length);
		case "file.inlinks": return String(inlinkPaths(app, file).length);
		case "file.links": return listOrNull(outlinkPaths(app, file));
		case "file.backlinks": return listOrNull(inlinkPaths(app, file));
		case "file.embeds": return listOrNull(embedLinks(app, file));
		case "file tags": return listOrNull(getFileTags(app, file));
		default: {
			const v = fm?.[field];
			if (v === undefined || v === null || v === "") return null;
			return Array.isArray(v) ? listOrNull(v) : formatScalar(v);
		}
	}
}
