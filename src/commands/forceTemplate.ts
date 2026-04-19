import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { FuzzyMatch, FuzzySuggestModal, MarkdownView, renderResults, View, WorkspaceLeaf } from "obsidian";
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

    renderSuggestion(match: FuzzyMatch<RuleConfig>, el: HTMLElement) {
        const nameEl = el.createDiv();
        renderResults(nameEl, match.item.name, match.match);
        const templateOffset = match.item.name.length + 1; //accounts for the space
        const templateEl = el.createEl('small');
        renderResults(templateEl, match.item.template.toLowerCase(), match.match, templateOffset);
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
    description: "Apply a template to the current file regardless of rule automations",
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