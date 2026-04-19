import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { FuzzyMatch, FuzzySuggestModal, MarkdownView, renderResults } from "obsidian";
import { RuleConfig } from "types";

class ForceTemplateModal extends FuzzySuggestModal<RuleConfig> {
    constructor(private plugin: ObsidianRuleEnginePlugin) {
        super(plugin.app);
    }

    //return a string representation, so there is something to search  
    getItemText(item: RuleConfig): string {
        return (item.name + " " + (item?.template ?? '')).trim().toLowerCase();
    }

    getItems(): RuleConfig[] {
        return this.plugin.settings.rules.filter(r => Boolean(r.template?.trim().length));
    }

    renderSuggestion(match: FuzzyMatch<RuleConfig>, el: HTMLElement): void {
        const { item, match: searchResult } = match;

        // 1. Render the Name (Header)
        const nameEl = el.createDiv();
        renderResults(nameEl, item.name, searchResult);

        // 2. Render the Template (Sub-text)
        const templateEl = el.createEl('small');
        const templateStr = item.template;

        // Calculate where the template starts in the combined search string.
        // Usually name + " " + template, so offset is name.length + 1.
        const templateOffset = item.name.length + 1;

        // Identify which lines of the template actually contain search matches.
        const lines = templateStr.split('\n');
        let currentPos = 0;
        const matchingLines: string[] = [];

        for (const line of lines) {
            const lineStartInFullStr = templateOffset + currentPos;
            const lineEndInFullStr = lineStartInFullStr + line.length;

            // Check if any match range overlaps with this specific line
            const hasMatch = searchResult.matches.some((m: [number, number]) => {
                return m[0] < lineEndInFullStr && m[1] > lineStartInFullStr;
            });

            if (hasMatch) {
                matchingLines.push(line.trim());
            }
            currentPos += line.length + 1; // +1 for the newline
        }



        // 3. Final String Construction
        // If template has matches, show only those lines
        // Otherwise, just show the first line of the template as a preview.
        const fallbackStr = templateStr?.replaceAll('\n', '')?.substring(0, 120);
        const displayStr = matchingLines.length > 0
            ? matchingLines.join('\n')
            : fallbackStr;

        //force no matches to avoid bold text. The matching line offsets could be fixed later if really needed
        renderResults(templateEl, displayStr.toLowerCase(), { ...searchResult, matches: [] }, -item.name.length);
    }

    onChooseItem(rule: RuleConfig, _evt: MouseEvent | KeyboardEvent): void {
        const ruleIdx = this.getItems().findIndex(r => {
            return r.id === rule.id;
        });
        if (ruleIdx != -1) {
            const file = this.plugin.app.workspace.getActiveFile();
            if (!file) return;
            this.plugin.processActiveView(file, {
                skipCommandExecution: true,
                forceTemplateIndex: ruleIdx
            }).catch(e => {
                console.error(e);
            });
        }
    }
}

export const forceTemplate: GetCommandFn = (plugin) => ({
    id: "force-template",
    name: "Force template",
    description: "Apply a template to the current file regardless of rule automations.",
    checkCallback: (checking) => {
        if (checking) {
            //only enable thi plugin if there are templates that could be applied to a markdown file
            const hasTemplates = plugin?.settings.rules.some(rule => rule.template?.trim().length);
            const leaf = plugin?.app.workspace.getLeaf(false);
            const isMd = leaf?.view instanceof MarkdownView;
            return hasTemplates && isMd;
        }
        const file = plugin?.app.workspace.getActiveFile();
        if (file)
            if (file && plugin) {
                const modal = new ForceTemplateModal(plugin);
                modal.open();
            }
        return true;
    }
});