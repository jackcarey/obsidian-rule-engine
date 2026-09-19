import { type App, ButtonComponent, Modal, Setting } from "obsidian";
import type { RuleConfig } from "types";

export class ExportRulesModal extends Modal {
	private selected: Set<RuleConfig>;

	constructor(
		app: App,
		private rules: RuleConfig[],
		private onExport: (rules: RuleConfig[]) => void,
	) {
		super(app);
		this.setTitle("Export rules");
		this.selected = new Set(rules);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: "Choose the rules to save to a file in your vault." });

		for (const rule of this.rules) {
			new Setting(contentEl).setName(rule.name).addToggle((toggle) =>
				toggle.setValue(true).onChange((on) => {
					if (on) this.selected.add(rule);
					else this.selected.delete(rule);
					exportBtn.setDisabled(this.selected.size === 0);
				}),
			);
		}

		const buttons = contentEl.createDiv("modal-button-container");
		const exportBtn = new ButtonComponent(buttons)
			.setButtonText("Export")
			.setCta()
			.onClick(() => {
				// List order, so re-importing keeps rule priority.
				this.onExport(this.rules.filter((r) => this.selected.has(r)));
				this.close();
			});
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
	}
}
