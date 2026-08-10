import {
    type App,
    type FuzzyMatch,
    FuzzySuggestModal,
    Platform,
    setIcon,
} from "obsidian";
import type { SuggestItem } from "types";

function removeFocusClasses(
    button: HTMLElement | null,
    parent: HTMLElement | null,
): void {
    if (button) {
        button.removeClass("ore-has-focus");
    }
    if (parent) {
        parent.removeClass("ore-has-focus");
    }
}

/**
 * Combobox-styled fuzzy suggest modal, currently used for the rule command
 * picker (property and operator selection moved to built-in Obsidian
 * components - a text input with AbstractInputSuggest, and DropdownComponent,
 * respectively - since those don't need fuzzy search over an open-ended list).
 * Behaviour and styles are disabled on mobile so it works with native controls.
 */
export class ComboboxSuggestModal extends FuzzySuggestModal<SuggestItem> {
    private items: SuggestItem[];
    private selectedValue: string;
    private onSelect: (val: string) => void;
    private anchorEl: HTMLElement | null = null;
    private clickOutsideHandler: ((evt: MouseEvent) => void) | null = null;

    constructor(
        app: App,
        items: SuggestItem[],
        selectedValue: string,
        onSelect: (val: string) => void,
        anchorEl?: HTMLElement,
    ) {
        super(app);
        this.items = items;
        this.selectedValue = selectedValue;
        this.onSelect = onSelect;
        if (!Platform.isMobile) {
            this.anchorEl = anchorEl || null;
        }
    }

    getItems(): SuggestItem[] {
        return this.items;
    }

    getItemText(item: SuggestItem): string {
        return item.label;
    }

    onOpen() {
        void super.onOpen();
        //don't do the style and behaviour change on mobile
        if (Platform.isMobile) return;

        // Style modal as combobox. Positioning/background are set as inline
        // styles rather than CSS classes - Obsidian sets its own inline
        // position/margin/transform/display for the modal open/close
        // animation, and only a later inline-style write (not a stylesheet
        // rule, however specific) can reliably override that.
        window.requestAnimationFrame(() => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- tsc disagrees with eslint's type-narrowing here: closest() returns Element, and setCssStyles/hide/show are HTMLElement-only, so the cast is genuinely required for tsc to compile.
            const modalContainer = this.modalEl.closest(
                ".modal-container",
            ) as HTMLElement | null;
            if (modalContainer) {
                modalContainer.addClass("ore-modal-container");
                modalContainer.removeClass("mod-dim");
                modalContainer.setCssStyles({ background: "transparent" });
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see above
                const modalBg = modalContainer.querySelector(
                    ".modal-bg",
                ) as HTMLElement | null;
                modalBg?.hide();
            }
        });

        this.modalEl.addClass("ore-suggestion-container", "ore-combobox");
        this.modalEl.setCssStyles({
            position: "fixed",
            margin: "0",
            transform: "none",
        });

        // Position relative to anchor element
        if (this.anchorEl) {
            const rect = this.anchorEl.getBoundingClientRect();
            this.modalEl.setCssStyles({
                left: `${rect.left}px`,
                top: `${rect.bottom + 5}px`,
            });
        }

        // Style input and container
        const promptEl = this.modalEl.querySelector(".prompt-input-container");
        if (promptEl) {
            promptEl.addClass("ore-search-input-container");
            const input = promptEl.querySelector("input");
            if (input) {
                input.setAttribute("type", "search");
                input.setAttribute("placeholder", "Search...");

                // Show/hide clear button based on input text
                const updateClearButtonVisibility = () => {
                    const clearButton = promptEl.querySelector(
                        ".search-input-clear-button",
                    ) as HTMLElement;
                    clearButton?.toggle(input.value.trim().length > 0);
                };

                // Initial state - use requestAnimationFrame to ensure DOM is ready
                window.requestAnimationFrame(() => {
                    updateClearButtonVisibility();
                });

                // Update on input change
                input.addEventListener("input", updateClearButtonVisibility);
            }
        }

        const suggestionsEl = this.modalEl.querySelector(".suggestion-container");
        if (suggestionsEl) {
            suggestionsEl.addClass("ore-suggestion");
        }

        // Keep anchor focused
        if (this.anchorEl) {
            if (this.anchorEl.getAttribute("tabindex") === "-1") {
                this.anchorEl.setAttribute("tabindex", "0");
            }
            window.requestAnimationFrame(() => {
                this.anchorEl?.focus();
            });
        }

        // Click-outside handler
        this.clickOutsideHandler = (evt: MouseEvent) => {
            const target = evt.target as Node;
            const isOutsideModal =
                !this.modalEl.contains(target) && this.modalEl !== target;
            const isNotAnchor =
                this.anchorEl !== target && !this.anchorEl?.contains(target);
            if (isOutsideModal && isNotAnchor) {
                this.close();
            }
        };

        window.setTimeout(() => {
            document.addEventListener("mousedown", this.clickOutsideHandler!);
        }, 0);
    }

    renderSuggestion(match: FuzzyMatch<SuggestItem>, el: HTMLElement): void {
        const item = match.item;
        el.addClass("ore-suggestion-item", "ore-mod-complex", "ore-mod-toggle");

        if (item.value === this.selectedValue) {
            const checkIcon = el.createDiv({
                cls: "ore-suggestion-icon ore-mod-checked",
            });
            setIcon(checkIcon, "check");
        }

        if (item.icon) {
            const iconDiv = el.createDiv({ cls: "ore-suggestion-icon" });
            const flair = iconDiv.createSpan({ cls: "ore-suggestion-flair" });
            setIcon(flair, item.icon);
        }

        const content = el.createDiv({ cls: "ore-suggestion-content" });
        content.createDiv({ cls: "ore-suggestion-title", text: item.label });
    }

    onChooseItem(item: SuggestItem): void {
        this.onSelect(item.value);
    }

    onClose() {
        if (Platform.isMobile) {
            super.onClose();
            return;
        }
        if (this.clickOutsideHandler) {
            document.removeEventListener("mousedown", this.clickOutsideHandler);
            this.clickOutsideHandler = null;
        }

        // Remove focus class from button and ore-filter-statement
        if (this.anchorEl) {
            // Find the ore-filter-expression element that contains the anchor
            const expression = this.anchorEl.closest(
                ".ore-filter-expression",
            ) as HTMLElement;
            removeFocusClasses(this.anchorEl, expression);
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see the matching cast in onOpen()
        const modalContainer = this.modalEl.closest(
            ".modal-container",
        ) as HTMLElement | null;
        if (modalContainer) {
            modalContainer.removeClass("ore-modal-container");
            modalContainer.addClass("mod-dim");
            // These elements are reused by Obsidian across modals, so the
            // inline styles we set in onOpen() must be cleared here - removing
            // our marker class alone wouldn't undo them.
            modalContainer.setCssStyles({ background: "" });
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- see above
            const modalBg = modalContainer.querySelector(
                ".modal-bg",
            ) as HTMLElement | null;
            modalBg?.show();
        }
        super.onClose();
    }
}
