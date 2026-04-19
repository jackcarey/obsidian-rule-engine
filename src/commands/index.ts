import ObsidianRuleEnginePlugin from "main";
import { CommandWithSetup } from "types";
import { forceTemplate } from "./forceTemplate";

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

export const list: GetCommandFn[] = [processNow, forceTemplate] as const;

