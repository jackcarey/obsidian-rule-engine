import ObsidianRuleEnginePlugin from "main";
import { CommandWithSetup } from "types";
import { forceTemplate } from "./forceTemplate";
import { MarkdownView } from "obsidian";

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
            void plugin?.processActiveView(file);
        }
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

export const list: GetCommandFn[] = [processNow, forceTemplate, resetTemplate] as const;

