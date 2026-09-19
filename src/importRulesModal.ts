import { type App, ButtonComponent, FuzzySuggestModal, Modal, type TFile } from "obsidian";
import { plural } from "format";
import type { ParsedImport } from "ruleImport";

export class PickRuleFileModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onPick: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder("Choose a rules .json file");
	}

	getItems(): TFile[] {
		// Newest first so a fresh export is on top.
		return this.app.vault
			.getFiles()
			.filter((f) => f.extension === "json")
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

/** Previews what was found so the user can pick add or replace. */
export class ImportRulesModal extends Modal {
	constructor(
		app: App,
		private fileName: string,
		private result: ParsedImport,
		private onImport: (result: ParsedImport, replace: boolean) => void,
	) {
		super(app);
		this.setTitle("Import rules");
	}

	onOpen() {
		const { contentEl } = this;
		const { rules, skipped } = this.result;
		contentEl.createEl("p", {
			text:
				`Found ${plural(rules.length, "rule")} in ${this.fileName}` +
				(skipped ? ` (${skipped} invalid, will be skipped)` : "") +
				":",
		});
		const list = contentEl.createEl("ul");
		for (const rule of rules) list.createEl("li", { text: rule.name });

		const run = (replace: boolean) => {
			this.onImport(this.result, replace);
			this.close();
		};
		const buttons = contentEl.createDiv("modal-button-container");
		new ButtonComponent(buttons).setButtonText("Add to existing").setCta().onClick(() => run(false));
		new ButtonComponent(buttons).setButtonText("Replace all").setDestructive().onClick(() => run(true));
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
	}
}
