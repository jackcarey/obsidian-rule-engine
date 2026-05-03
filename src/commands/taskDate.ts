import { ComboboxSuggestModal } from "comboSuggestModal";
import { GetCommandFn } from "commands";
import { Editor, MarkdownView, MarkdownFileInfo } from "obsidian";
import { SuggestItem } from "types";

export const TASK_DATE_ID = 'apply-task-due-date';
export interface TaskDateParams extends Record<string, unknown> {
    frontmatterField?: string;
    parseTitle?: boolean;
}

export const taskDate: GetCommandFn<TaskDateParams> = (plugin) => ({
    id: TASK_DATE_ID,
    name: 'Fill task due dates',
    description: 'The due date will always fall back to the last modified time of the file if the field or title are not parsed.',
    settingCallback: (settingGroup, currentConfig, saveFn) => {
        const params = currentConfig.params;
        settingGroup.addSetting(setting => {
            setting
                .setName('Frontmatter field')
                .setDesc('Parse the date from a frontmatter field')
                .addText(textEl => {
                    textEl.setValue(params.frontmatterField || '');
                    const propertyDefs = plugin.scanVaultProperties();
                    const suggestItems: SuggestItem[] = propertyDefs.map(def => {
                        const icon = plugin.getPropertyIcon(def.key, def.type);
                        return {
                            label: def.key,
                            value: def.key,
                            icon
                        };
                    }) ?? params.frontmatterField ? [{
                        label: params.frontmatterField ?? '',
                        value: params.frontmatterField ?? ''
                    }] : [];
                    const onSelect = (value: string) => {
                        saveFn({ params: { ...params, frontmatterField: value } }).then(() => {
                            textEl.setValue(value);
                        }).catch(e => plugin.debug(e));
                    };
                    const combo = new ComboboxSuggestModal(
                        plugin?.app,
                        suggestItems,
                        params?.frontmatterField || '',
                        onSelect,
                        textEl.inputEl,
                    );
                    textEl.inputEl.addEventListener('blur', (value) => {
                        void saveFn({ params: { ...params, frontmatterField: value } });
                    });
                });
        });
        settingGroup.addSetting(setting => {
            setting
                .setName('Parse from title')
                .setDesc('If a date cannot be found in frontmatter, should one be parsed from the title (in yyyy-mm-dd format)?')
                .addToggle(toggle => {
                    toggle.setValue(!!params.parseTitle);
                    toggle.onChange(async val => {
                        await saveFn({ params: { ...params, parseTitle: val } });
                    });

                });
        });
    },
    editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        const file = view.file;
        if (!file) return;

        const cache = plugin?.app.metadataCache.getFileCache(file);
        const config = plugin?.getCommandConfig<TaskDateParams>(TASK_DATE_ID);
        if (!config?.enabled) return;

        let dtStr: string = "";
        const fieldKey = config.params.frontmatterField || 'due';
        if (fieldKey && cache?.frontmatter?.[fieldKey]) {
            dtStr = String(cache.frontmatter[fieldKey]);
        }

        // 2. File Title Fallback (looks for YYYY-MM-DD)
        const titleMatch = file.basename.match(/\d{4}-\d{2}-\d{2}/);
        if (!dtStr.length && config.params.parseTitle && titleMatch?.length) {
            dtStr = titleMatch[0];
        }

        // 3. Last Modified/Current Date Fallback
        // Using native Date to avoid external libraries
        const date = new Date(file.stat.mtime);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');

        const targetDate = `${y}-${m}-${d}`;

        const lineCount = editor.lineCount();

        /**
         * Regex Breakdown:
         * ^(\s*-\s\[ \]\s) : Starts with optional whitespace, dash, and empty checkbox
         * (?!.*📅)        : Negative lookahead; ensures line doesn't already have the emoji
         * (.*)$            : Captures the rest of the task text
         */
        const taskRegex = /^(\s*-\s\[ \]\s)(?!.*📅)(.*)$/;

        // Iterate backwards to maintain correct line indices during modification
        for (let i = lineCount - 1; i >= 0; i--) {
            const line = editor.getLine(i);
            const match = line.match(taskRegex);

            if (match) {
                const updatedLine = `${line.trimEnd()} 📅 ${targetDate}`;

                editor.replaceRange(
                    updatedLine,
                    { line: i, ch: 0 },
                    { line: i, ch: line.length }
                );
            }
        }
        return;
    }
});