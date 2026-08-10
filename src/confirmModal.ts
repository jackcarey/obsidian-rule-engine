import { type App, ButtonComponent, Modal } from "obsidian";

/**
 * Small reusable "are you sure?" modal for destructive actions (e.g. deleting
 * a rule) that Obsidian's own framework affordances (like a list's onDelete)
 * trigger immediately with no confirmation step of their own.
 */
export class ConfirmModal extends Modal {
    constructor(
        app: App,
        private message: string,
        private onConfirm: () => void,
        private confirmText: string = "Delete",
    ) {
        super(app);
        this.setTitle("Are you sure?");
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ore-confirm-modal");
        contentEl.createEl("p", { text: this.message });

        const buttonContainer = contentEl.createDiv("modal-button-container");
        new ButtonComponent(buttonContainer)
            .setButtonText(this.confirmText)
            .setDestructive()
            .setCta()
            .onClick(() => {
                this.onConfirm();
                this.close();
            });

        new ButtonComponent(buttonContainer).setButtonText("Cancel").onClick(() => {
            this.close();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
