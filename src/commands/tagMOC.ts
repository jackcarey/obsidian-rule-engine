import { GetCommandFn } from "commands";
import { Editor, MarkdownView, MarkdownFileInfo } from "obsidian";

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


        //todo: implement
        // 1. find all files with matching tags, based on mode
        // 2. find section in this document based on heading
        // 3. replace the section below the heading with the list of wikilinks

        return;
    }
});