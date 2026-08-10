import { Command, SettingGroupItem, type TFile } from "obsidian";

declare module "obsidian" {
	interface App {
		commands: {
			commands: Record<string, Command>;
			editorCommands: Record<string, Command>;
			findCommand(id: string): Command | undefined;
			executeCommandById(id: string): boolean;
		};
	}
}

export type FilterOperator =
	| "contains" | "does not contain"
	| "contains any of" | "does not contain any of"
	| "contains all of" | "does not contain all of"
	| "is" | "is not"
	| "starts with" | "ends with"
	| "is empty" | "is not empty"
	| "links to" | "does not link to"
	| "in folder" | "is not in folder"
	| "has tag" | "does not have tag"
	| "has property" | "does not have property"
	| "on" | "not on"
	| "before" | "on or before"
	| "after" | "on or after"
	| "within past" | "within future"
	| "=" | "≠" | "<" | "≤" | ">" | "≥";

export type FilterConjunction = "AND" | "OR" | "NOR";
export interface Filter {
	type: "filter";
	field: string;
	operator: FilterOperator;
	value?: string;
}

/** A group nested one level inside a root FilterGroup. Leaf filters only - no further nesting, so 2 levels (root + subgroup) is a hard ceiling. */
export interface FilterSubgroup {
	type: "group";
	operator: FilterConjunction;
	conditions: Filter[];
}

export interface FilterGroup {
	type: "group";
	operator: FilterConjunction;
	conditions: (Filter | FilterSubgroup)[];
}

export type AnyFilterGroup = FilterGroup | FilterSubgroup;


export type BaseFileHandling = "file" | "results" | "both";
export type RenderContext = "file" | "base" | "canvas";
export interface RuleConfig {
	id: string;
	name: string;
	filterGroup: FilterGroup;
	template: string;
	enableTemplateForFile: boolean;
	enableTemplateForBase: boolean;
	enableTemplateForCanvas: boolean;
	enabled: boolean;
	commandIds: string[];
	baseFileHandling: BaseFileHandling;
}

export interface CommandConfig<T extends Record<string, unknown> = Record<string, unknown>> {
	enabled: boolean;
	params: T;
};

export type PropertyType = "text" | "number" | "date" | "datetime" | "list" | "checkbox" | "file" | "unknown";

export interface CustomRulesSettings {
	enabled: boolean;
	workInLivePreview: boolean;
	workInCanvas: boolean;
	processBaseResultsAutomatically: boolean;
	processOnSave: boolean;
	debug: boolean;
	showNotices: boolean;
	rules: RuleConfig[];
	// Use the base version of the type to allow variety
	commands: Record<string, CommandConfig>;
}

/**
 * Interface for canvas node structure
 * CanvasView and CanvasNode types are not exported from Obsidian, so we define minimal interfaces
 */
export interface CanvasNode {
	file?: TFile;
	nodeEl?: HTMLElement;
}

/**
 * Interface for canvas structure
 * CanvasView type is not exported from Obsidian, so we define a minimal interface
 */
export interface CanvasView {
	canvas?: {
		nodes?: CanvasNode[];
	};
}

export interface PropertyDef {
	key: string;
	type: PropertyType;
}

export interface SuggestItem {
	label: string;
	value: string;
	icon?: string;
}

export type CommandSaveFn = (updatedConfig: Partial<CommandConfig>) => Promise<void>;
export type CommandSettingCallback<TConfig extends Record<string, unknown> = Record<string, unknown>> = (currentConfig: CommandConfig<TConfig>, saveFn: CommandSaveFn) => SettingGroupItem[];

export type CommandWithSetup<TConfig extends Record<string, unknown> = Record<string, unknown>> = Command & {
	// human readable description of what the command does
	description?: string;
	// callback to add the command to the SettingsGroup for this command. The setting will already have a name, description, icon, and enabled toggle.
	settingCallback?: CommandSettingCallback<TConfig>;
};

export type ProcessMarkdownViewOptions = {
	skipCommandExecution?: boolean;
	forceTemplateIndex?: number;
	baseFileHandling?: BaseFileHandling;
	renderContext?: RenderContext;
}