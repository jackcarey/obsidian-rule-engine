import ObsidianRuleEnginePlugin from "main";
import { CommandWithSetup } from "types";
import { forceTemplate } from "./forceTemplate";
import { MarkdownView, Notice } from "obsidian";
import { RuleEngineBasesView } from "ruleEngineBasesView";

export type GetCommandFn = (plugin?: ObsidianRuleEnginePlugin) => CommandWithSetup;

const processNow: GetCommandFn = (plugin) => ({
    id: "check-rules",
    name: "Process now",
    description: "Check and execute automations as if the file has just been opened.",
    checkCallback: (checking: boolean) => {
        if (checking) {
            return plugin && plugin.settings.enabled;
        }

        const file = plugin?.app.workspace.getActiveFile();

        if (file) {
            void plugin?.processMarkdownView(file);
        }
        const leaf = plugin?.app.workspace.getLeaf(false);
        if (leaf?.view && leaf.view instanceof RuleEngineBasesView) {
            plugin?.debug(`leaf is RuleEngineBasesView, processing results`);
            (leaf.view as RuleEngineBasesView).processView(true);
        } else {
            plugin?.debug(`leaf is not RuleEngineBasesView, not processing results`);
        };

        return true;
    },
});

const resetTemplate: GetCommandFn = (plugin) => ({
    id: "restore-view",
    name: "Restore view",
    description: "Reset the view to remove a template",
    checkCallback: (checking: boolean) => {
        if (checking) {
            return plugin && plugin.settings.enabled;
        }

        const file = plugin?.app.workspace.getActiveFile();

        if (file && plugin) {
            const leaf = plugin.app.workspace.getLeaf(false);
            if (leaf) {
                if (!(leaf.view instanceof MarkdownView)) return;
                plugin.restoreDefaultView(leaf.view);
            }
        }
        return true;
    }
});

const notifyTime: GetCommandFn = () => ({
    id: "notify-time",
    name: "Notify time",
    description: "Create a notification of the current time",
    callback: () => {
        new Notice(new Date().toISOString(), 3000);
    }
});

export const list: GetCommandFn[] = [processNow, forceTemplate, resetTemplate, notifyTime] as const;

