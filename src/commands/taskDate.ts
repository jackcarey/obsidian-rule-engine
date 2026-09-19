import { ComboboxSuggestModal } from "comboSuggestModal";
import { addOverrideHint } from "commandSettingsModal";
import { GetCommandFn } from "commands";
import { Editor, MarkdownView, MarkdownFileInfo } from "obsidian";
import { SuggestItem } from "types";
import { applyTaskDueDates, TaskDateFormat } from "taskDates";

export const TASK_DATE_ID = 'apply-task-due-date';
export interface TaskDateParams extends Record<string, unknown> {
    frontmatterField?: string;
    parseTitle?: boolean;
    format?: TaskDateFormat;
}

export const taskDate: GetCommandFn<TaskDateParams> = (plugin) => ({
    id: TASK_DATE_ID,
    name: 'Fill task due dates',
    description: 'The due date will always fall back to the last modified time of the file if the field or title are not parsed.',
    settingCallback: (currentConfig, saveFn) => {
        const params = currentConfig.params;
        const propertyDefs = plugin.scanVaultProperties();
        const propertyDefSuggestions = propertyDefs.map(def => {
            const icon = plugin.getPropertyIcon(def.key, def.type);
            return {
                label: def.key,
                value: def.key,
                icon
            };
        });
        const frontmatterFieldSuggestion: SuggestItem[] = [{
            label: params?.frontmatterField ?? '',
            value: params?.frontmatterField ?? ''
        }];
        const suggestItems: SuggestItem[] = [
            {
                label: 'None',
                value: '',
            },
            ...propertyDefSuggestions?.length
                ? propertyDefSuggestions
                : params?.frontmatterField
                    ? frontmatterFieldSuggestion
                    : []]
            ;
        return [
            {
                name: 'Frontmatter field',
                desc: 'Parse the date from a frontmatter field',
                render: (setting) => {
                    setting.addButton(buttonEl => {
                        buttonEl.setButtonText(params.frontmatterField?.length ? params.frontmatterField : 'None');
                        const onSelect = (value: string) => {
                            saveFn({ params: { ...params, frontmatterField: value } }).then(() => {
                                const displayText = value?.length ? value : 'None';
                                buttonEl.setButtonText(displayText);
                            }).catch(e => plugin.debug(e));
                        };
                        const comboValue = params.frontmatterField?.length ? params.frontmatterField : '';
                        const combo = new ComboboxSuggestModal(
                            plugin?.app,
                            suggestItems,
                            comboValue,
                            onSelect,
                            buttonEl.buttonEl,
                        );
                        buttonEl.onClick(() => combo.open());
                    });
                    addOverrideHint(setting, TASK_DATE_ID, 'frontmatterField');
                },
            },
            {
                name: 'Parse from title',
                desc: 'If a date cannot be found in frontmatter, should one be parsed from the title (in yyyy-mm-dd format)?',
                control: { type: 'toggle', key: 'parseTitle' },
            },
            {
                name: 'Format',
                desc: 'Emoji adds "📅 date". Dataview adds "[due:: date]". Tasks with either are always skipped.',
                control: {
                    type: 'dropdown',
                    key: 'format',
                    defaultValue: 'emoji',
                    options: { emoji: 'Emoji (📅)', dataview: 'Dataview ([due:: ])' },
                },
            },
        ];
    },
    editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        const file = view.file;
        if (!file) {
            plugin.debug('taskDate: no file, skipping');
            return;
        }

        const cache = plugin?.app.metadataCache.getFileCache(file);
        const config = plugin?.getCommandConfig<TaskDateParams>(TASK_DATE_ID);
        if (!config?.enabled) {
            plugin.debug('taskDate: command disabled, skipping');
            return;
        }

        let dtStr: string = "";
        let dateSource = 'frontmatter';
        const fieldKey = config.params.frontmatterField || 'due';
        if (fieldKey && cache?.frontmatter?.[fieldKey]) {
            dtStr = String(cache.frontmatter[fieldKey]);
        }

        // 2. File Title Fallback (looks for YYYY-MM-DD)
        const titleMatch = file.basename.match(/\d{4}-\d{2}-\d{2}/);
        if (!dtStr.length && config.params.parseTitle && titleMatch?.length) {
            dtStr = titleMatch[0];
            dateSource = 'title';
        }

        if (!dtStr?.length) {
            // 3. Last Modified/Current Date Fallback
            // Using native Date to avoid external libraries
            const date = new Date(file.stat.mtime);
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');

            const targetDate = `${y}-${m}-${d}`;
            dtStr = targetDate;
            dateSource = 'file modified time';
        }

        const format: TaskDateFormat = config.params.format === 'dataview' ? 'dataview' : 'emoji';
        plugin.debug(`taskDate: format=${format}, date=${dtStr} (${dateSource})`);

        const original = editor.getValue();
        const result = applyTaskDueDates(original, dtStr, format);
        plugin.debug(`taskDate: ${result.changed} line(s) changed`);
        if (!result.changed) return;

        // Replace only changed lines so the cursor and undo history aren't disturbed.
        const before = original.split('\n');
        const after = result.text.split('\n');
        for (let i = before.length - 1; i >= 0; i--) {
            const oldLine = before[i] ?? '';
            const newLine = after[i] ?? '';
            if (oldLine === newLine) continue;
            editor.replaceRange(
                newLine,
                { line: i, ch: 0 },
                { line: i, ch: oldLine.length }
            );
        }
        return;
    }
});