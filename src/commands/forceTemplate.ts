import { GetCommandFn } from "commands";
import ObsidianRuleEnginePlugin from "main";
import { FuzzyMatch, FuzzySuggestModal, renderResults } from "obsidian";
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
        const titleEl = el.createDiv();
        renderResults(titleEl, match.item.name, match.match);

        // Only render the matches in the template content.  
        const authorEl = el.createEl('small');
        const offset = -(match.item.template.length + 1);
        renderResults(authorEl, match.item.template, match.match, offset);
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
                forceTemplate: ruleIdx
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
            //only enable thi plugin if there are templates that could be applied
            return plugin?.settings.rules.some(rule => rule.template?.trim().length);
        }
        const file = plugin?.app.workspace.getActiveFile();
        if (file && plugin) {
            new ForceTemplateModal(plugin);
        }
        return true;
    }
});