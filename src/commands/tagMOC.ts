import { GetCommandFn } from "commands";
import { Editor, MarkdownView, MarkdownFileInfo, CachedMetadata } from "obsidian";

export const TAG_MOC_ID = 'tag-moc';
export interface TagMOCParams extends Record<string, unknown> {
    defaultHeading?: string;
}

export const tagMOC: GetCommandFn<TagMOCParams> = (plugin) => ({
    id: TAG_MOC_ID,
    name: 'Update tag MOC section',
    description: 'Ensure the file has a list of links which match the current files tag_moc settings.',
    settingCallback: (settingGroup, currentConfig, saveFn) => {
        const params = currentConfig.params;
        settingGroup.addSetting(setting => {
            setting.setName('Info').setDesc("Use the tag_moc_mode field on any note to set the mode to 'any', 'all', or 'exact' tag matches;  defaults to 'all'. Use the tag_moc_heading to override the heading to put the list under");
        });
        settingGroup.addSetting(setting => {
            setting.addText(textEl => {
                textEl.setValue(params.defaultHeading ?? 'Tag Content').onChange(async (value) => {
                    await saveFn({ params: { ...params, defaultHeading: value } });
                });
            });
        });
    },
    editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        const file = view.file;
        if (!file) return;

        const cache = plugin?.app.metadataCache.getFileCache(file);
        const config = plugin?.getCommandConfig<TagMOCParams>(TAG_MOC_ID);
        if (!config?.enabled) return;
        if (cache?.frontmatter?.tag_moc_mode === undefined) return;
        const frontmatterModeValue = cache?.frontmatter?.tag_moc_mode as string | undefined;
        const effectiveMode = frontmatterModeValue && ['any', 'all', 'exact'].includes(frontmatterModeValue) ? String(frontmatterModeValue) : 'all';
        const headingToFind: string = '' + (cache?.frontmatter?.tag_moc_heading || config.params.defaultHeading || 'Tag Content');

        const getFrontmatterTags = (c: CachedMetadata | null): string[] => {
            const fmTags = c?.frontmatter?.tags;
            if (!fmTags) return [];
            // Frontmatter tags can be a single string or an array of strings
            return (Array.isArray(fmTags) ? fmTags : [fmTags]).map(t => String(t));
        };

        const tags = getFrontmatterTags(cache);
        if (tags.length === 0) return;

        //todo: implement
        // 1. find all files with matching tags, based on mode
        // 2. find section in this document based on heading
        // 3. replace the section below the heading with the list of wikilinks
        const matchingFiles = plugin.app.vault.getMarkdownFiles().filter(f => {
            if (f.path === file.path) return false;
            const fCache = plugin.app.metadataCache.getFileCache(f);
            if (!fCache) return false;
            const fTags = getFrontmatterTags(fCache);

            if (effectiveMode === 'any') return tags.some(t => fTags.includes(t));
            if (effectiveMode === 'all') return tags.every(t => fTags.includes(t));
        });

        const links = matchingFiles
            .sort((a, b) => a.basename.localeCompare(b.basename))
            .map(f => `- [[${f.basename}]]`)
            .join('\n');

        const content = editor.getValue();
        const lines = content.split('\n');
        const escapedHeading = headingToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const headingRegex = new RegExp(`^#+\\s+${escapedHeading}\\s*$`, 'i');
        const headingLineIndex = lines.findIndex(l => headingRegex.test(l));

        if (headingLineIndex === -1) return;

        const headingLevel = (lines[headingLineIndex].match(/^(#+)/) || ['', ''])[1].length;
        let nextHeadingLineIndex = lines.length;
        for (let i = headingLineIndex + 1; i < lines.length; i++) {
            const match = lines[i].match(/^(#+)/);
            if (match && match[1].length <= headingLevel) {
                nextHeadingLineIndex = i;
                break;
            }
        }

        editor.replaceRange(links ? `\n${links}\n` : '\n',
            { line: headingLineIndex + 1, ch: 0 },
            { line: nextHeadingLineIndex, ch: 0 }
        );
    }
});