import type { CommandConfig } from "types";

/** Strips the "plugin-id:" prefix Obsidian adds, so overrides keyed by either form match. */
export function stripCommandIdPrefix(id: string): string {
	return id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
}

/** Reads `ore:<command id>:<setting>` frontmatter keys into per-command overrides. */
export function parseCommandOverrides(
	frontmatter: Record<string, unknown> | undefined,
): Record<string, Partial<CommandConfig>> {
	const overrides: Record<string, Partial<CommandConfig>> = {};
	for (const key of Object.keys(frontmatter ?? {})) {
		const match = /^ore:(.+):([^:]+)$/.exec(key);
		const [, cmdId, setting] = match ?? [];
		if (!cmdId || !setting) continue;
		const override = (overrides[cmdId] ??= {});
		const value = frontmatter?.[key];
		if (setting === "enabled") {
			override.enabled = value === true || value === "true" || value === 1;
		} else {
			(override.params ??= {})[setting] = value;
		}
	}
	return overrides;
}
