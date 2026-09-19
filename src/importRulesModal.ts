import { type App, ButtonComponent, FuzzySuggestModal, Modal, type TFile } from "obsidian";
import type { ParsedImport } from "ruleImport";

/** Picks a .json file from the vault, newest first so a fresh export is on top. */
export class PickRuleFileModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onPick: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder("Choose a rules .json file");
	}

	getItems(): TFile[] {
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

/** Shows what was found in the chosen file; the caller decides how to merge. */
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
		contentEl.empty();
		const { rules, skipped } = this.result;
		contentEl.createEl("p", {
			text:
				`Found ${rules.length} rule${rules.length === 1 ? "" : "s"} in ${this.fileName}` +
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
		new ButtonComponent(buttons)
			.setButtonText("Add to existing")
			.setCta()
			.onClick(() => run(false));
		new ButtonComponent(buttons)
			.setButtonText("Replace all")
			.setDestructive()
			.onClick(() => run(true));
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}
