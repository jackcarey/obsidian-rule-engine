import { CustomRulesSettings, FilterGroup, PropertyType } from "./types";

export const TYPE_ICONS: Record<PropertyType, string> = {
    text: "text",
    number: "binary",
    date: "calendar",
    datetime: "clock",
    list: "list",
    checkbox: "check-square",
    file: "file",
    unknown: "text"
} as const;

export const OPERATORS: Record<string, string[]> = {
    text: ["contains", "does not contain", "is", "is not", "starts with", "ends with", "contains any of", "does not contain any of", "contains all of", "does not contain all of", "is empty", "is not empty"],
    list: ["contains", "does not contain", "contains any of", "does not contain any of", "contains all of", "does not contain all of", "is empty", "is not empty"],
    number: ["=", "≠", "<", "≤", ">", "≥", "is empty", "is not empty"],
    date: ["on", "not on", "before", "on or before", "after", "on or after", "is empty", "is not empty"],
    checkbox: ["is"],
    file: ["links to", "does not link to", "in folder", "is not in folder", "has tag", "does not have tag", "has property", "does not have property"]
} as const;

export const DEFAULT_RULES: FilterGroup = {
    type: "group",
    operator: "AND",
    conditions: []
} as const;

export const DEFAULT_SETTINGS: CustomRulesSettings = {
    enabled: true,
    workInLivePreview: true,
    workInCanvas: false,
    allowBaseResultExecution: false,
    rules: [
        {
            id: 'default-1',
            name: 'Rule 1',
            filterGroup: JSON.parse(JSON.stringify(DEFAULT_RULES)) as FilterGroup,
            template: "<h1>{{file.basename}}</h1> <main>{{file.content}}</main>",
            enabled: true,
            commandIds: [],
            baseFileHandling: "file",
        }
    ],
    commands: []
};

export const CUSTOM_RULE_CLASS = "obsidian-custom-rule-render";
export const HIDE_MARKDOWN_CLASS = "obsidian-custom-rule-hidden";
