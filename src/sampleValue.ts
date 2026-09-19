import type { App, TFile } from "obsidian";
import { getFileTags } from "moc";

const MAX_LEN = 80;
const MAX_ITEMS = 3;

/**
 * Files to pull examples from, best first: the open one, recently opened ones
 * that still exist, then everything else newest-edited first. A property the
 * open note lacks usually exists on some other note, so hints keep looking.
 */
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

/** First file that has a usable example for the field. */
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
	if (!items.length) return "none";
	const shown = items.slice(0, MAX_ITEMS).map(formatScalar).join(", ");
	const more = items.length - MAX_ITEMS;
	return more > 0 ? `${shown} (+${more} more)` : shown;
}

const listOrNull = (items: unknown[]) => (items.length ? formatList(items) : null);

function formatScalar(v: unknown): string {
	if (typeof v === "string") return truncate(v);
	if (typeof v === "object" && v !== null) return truncate(JSON.stringify(v));
	return String(v);
}

function formatDate(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function inlinks(app: App, file: TFile): string[] {
	return Object.entries(app.metadataCache.resolvedLinks)
		.filter(([, dests]) => file.path in dests)
		.map(([src]) => src);
}

/**
 * Example value of a filter property for one file, as display text. Returns
 * null when there is nothing sensible to show. Mirrors what matcher.ts reads
 * so the hint matches what the filter would actually compare against.
 */
export function describeSample(app: App, file: TFile, field: string): string | null {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter as Record<string, unknown> | undefined;

	switch (field) {
		case "file": {
			const props = Object.keys(fm ?? {}).filter((k) => k !== "position");
			return [
				`folder: ${file.parent?.path || "/"}`,
				`tags: ${formatList(getFileTags(app, file))}`,
				`properties: ${formatList(props)}`,
			].join(" · ");
		}
		case "file.name": return file.name;
		case "file.basename": return file.basename;
		case "file.extension": return file.extension;
		case "file.path": return truncate(file.path);
		case "file.folder": return file.parent?.path || "/";
		case "file.size": return `${file.stat.size} bytes`;
		case "file.ctime": return formatDate(file.stat.ctime);
		case "file.mtime": return formatDate(file.stat.mtime);
		case "file.outlinks": return String(Object.keys(app.metadataCache.resolvedLinks[file.path] ?? {}).length);
		case "file.inlinks": return String(inlinks(app, file).length);
		// Empty lists give no example, so the search moves on to a file that has one.
		case "file.links": return listOrNull(Object.keys(app.metadataCache.resolvedLinks[file.path] ?? {}));
		case "file.backlinks": return listOrNull(inlinks(app, file));
		case "file.embeds": return listOrNull((cache?.embeds ?? []).map((e) => e.link));
		case "file tags": return listOrNull(getFileTags(app, file));
		case "aliases": {
			const a = fm?.aliases;
			return listOrNull(Array.isArray(a) ? a : a ? [a] : []);
		}
		default: {
			const v = fm?.[field];
			if (v === undefined || v === null || v === "") return null;
			return Array.isArray(v) ? listOrNull(v) : formatScalar(v);
		}
	}
}
