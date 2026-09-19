import { type App, ButtonComponent, Modal, Setting } from "obsidian";
import type { RuleConfig } from "types";

/** Lets the user tick which rules to export; the caller does the saving. */
export class ExportRulesModal extends Modal {
	private selected: Set<number>;

	constructor(
		app: App,
		private rules: RuleConfig[],
		private onExport: (rules: RuleConfig[]) => void,
	) {
		super(app);
		this.setTitle("Export rules");
		this.selected = new Set(rules.map((_, i) => i));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: "Choose the rules to save to a file in your vault." });

		let exportBtn: ButtonComponent | undefined;
		const refresh = () => exportBtn?.setDisabled(this.selected.size === 0);

		this.rules.forEach((rule, i) => {
			new Setting(contentEl).setName(rule.name).addToggle((toggle) =>
				toggle.setValue(true).onChange((on) => {
					if (on) this.selected.add(i);
					else this.selected.delete(i);
					refresh();
				}),
			);
		});

		const buttons = contentEl.createDiv("modal-button-container");
		exportBtn = new ButtonComponent(buttons)
			.setButtonText("Export")
			.setCta()
			.onClick(() => {
				// Keep list order so re-importing preserves rule priority.
				this.onExport(this.rules.filter((_, i) => this.selected.has(i)));
				this.close();
			});
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
		refresh();
	}

	onClose() {
		this.contentEl.empty();
	}
}
