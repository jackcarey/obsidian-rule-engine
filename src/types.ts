import { Command, SettingGroup, type TFile } from "obsidian";

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
	| "after" | "on or after";

export type FilterConjunction = "AND" | "OR" | "NOR";
export interface Filter {
	type: "filter";
	field: string;
	operator: FilterOperator;
	value?: string;
}

export interface FilterGroup {
	type: "group";
	operator: FilterConjunction;
	conditions: (Filter | FilterGroup)[];
}

export interface ViewConfig {
	id: string;
	name: string;
	rules: FilterGroup;
	template: string;
}

export type CommandConfig = Record<string, unknown> & { enabled: boolean };


export type PropertyType = "text" | "number" | "date" | "datetime" | "list" | "checkbox" | "file" | "unknown";

export interface CustomViewsSettings {
	enabled: boolean;
	workInLivePreview: boolean;
	workInCanvas: boolean;
	views: ViewConfig[];
	commands: CommandConfig[];
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

export type CommandSaveFn = (updatedConfig: Partial<Omit<CommandConfig, 'id'>>) => void;
export type CommandSettingCallback = (setting: SettingGroup, currentConfig: CommandConfig, saveFn: CommandSaveFn) => void

export type CommandWithSetup = Command & {
	// human readable description of what the command does
	description?: string;
	// callback to add the command to the SettingsGroup for this command. The setting will already have a name, description, icon, and enabled toggle.
	settingCallback?: CommandSettingCallback
};