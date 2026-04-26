import { ComboboxSuggestModal } from "comboSuggestModal";
import { TYPE_ICONS, OPERATORS } from "consts";
import ObsidianRuleEnginePlugin from "main";
import { App, ButtonComponent, Modal, setIcon, Setting, TextAreaComponent } from "obsidian";
import { RuleConfig, BaseFileHandling, SuggestItem, Filter, FilterConjunction, FilterGroup, FilterOperator, PropertyDef, PropertyType } from "types";

function setupComboboxButtonHandlers(
    button: HTMLElement,
    _parent: HTMLElement,
    onOpen: () => void
): void {
    button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
    };

    button.onkeydown = (e) => {
        if (e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            e.stopPropagation();
            onOpen();
        }
    };
}

/**
 * Helper functions for UI component creation
 */
function createComboboxButton(
    container: HTMLElement,
    label: string,
    icon?: string
): HTMLElement {
    const button = container.createDiv({ cls: "ore-combobox-button", attr: { tabindex: "0" } });

    if (icon) {
        const iconEl = button.createDiv({ cls: "ore-combobox-button-icon" });
        setIcon(iconEl, icon);
    }

    const labelEl = button.createDiv({ cls: "ore-combobox-button-label" });
    labelEl.innerText = label;
    setIcon(button.createDiv({ cls: "ore-combobox-button-chevron" }), "chevrons-up-down");

    return button;
}

function createDeleteButton(
    container: HTMLElement,
    onClick: (e: MouseEvent) => void,
    additionalClasses: string = ""
): HTMLElement {
    const deleteBtn = container.createEl("button", {
        cls: `clickable-icon ${additionalClasses}`.trim(),
        attr: { "aria-label": "Remove filter" }
    });
    setIcon(deleteBtn, "trash-2");
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        onClick(e);
    };
    return deleteBtn;
}

function addFocusClasses(button: HTMLElement, parent: HTMLElement): void {
    button.addClass("ore-has-focus");
    parent.addClass("ore-has-focus");
}

function createFilterValueInput(
    container: HTMLElement,
    type: PropertyType,
    value: string | undefined,
    onChange: (val: string) => void,
    operator?: string
): HTMLInputElement | HTMLElement {
    const safeValue = value || "";
    const needsMultiSelect = operator === "contains any of" || operator === "does not contain any of"
        || operator === "contains all of" || operator === "does not contain all of"
        || operator === "has tag" || operator === "does not have tag";
    if (needsMultiSelect) {
        // Multi-select container for operators that accept multiple values
        const multiSelectContainer = container.createDiv({ cls: "ore-multi-select-container", attr: { tabindex: "-1" } });

        // Parse existing values (comma-separated)
        const values: string[] = safeValue ? safeValue.split(",").map(v => v.trim()).filter(v => v.length > 0) : [];

        // Create contenteditable input
        const input = multiSelectContainer.createDiv({
            cls: "ore-multi-select-input",
            attr: {
                contenteditable: "true",
                tabindex: "0",
                "data-placeholder": "Empty"
            }
        });

        // Focus input when clicking on container (but not on child elements)
        multiSelectContainer.addEventListener("click", (e: MouseEvent) => {
            // Only focus if clicking directly on the container, not on pills or input
            if (e.target === multiSelectContainer) {
                e.preventDefault();
                input.focus();
            }
        });

        // Helper to update placeholder based on pill count
        const updatePlaceholder = (): void => {
            if (values.length === 0) {
                input.setAttribute("data-placeholder", "Empty");
            } else {
                input.setAttribute("data-placeholder", "");
            }
        };

        // Helper to get all pills in order
        const getPills = (): HTMLElement[] => {
            return Array.from(multiSelectContainer.querySelectorAll(".multi-select-pill"));
        };

        // Helper to get the index of a pill
        const getPillIndex = (pill: HTMLElement): number => {
            return getPills().indexOf(pill);
        };

        // Helper to focus a pill by index
        const focusPill = (index: number): void => {
            const pills = getPills();
            if (index >= 0 && index < pills.length) {
                pills[index]?.focus();
            }
        };

        // Helper to focus the last pill
        const focusLastPill = (): void => {
            const pills = getPills();
            if (pills.length > 0) {
                pills[pills.length - 1]?.focus();
            }
        };

        // Helper to focus the input
        const focusInput = (): void => {
            input.focus();
        };

        // Helper to clear input and ensure placeholder shows
        const clearInput = () => {
            input.textContent = "";
            // Remove any <br> tags that might prevent :empty from working
            const br = input.querySelector("br");
            if (br) br.remove();
        };

        // Handle keyboard navigation in input
        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const text = input.textContent?.trim() || "";
                if (text.length > 0) {
                    values.push(text);
                    onChange(values.join(","));
                    updatePills();
                    clearInput();
                    updatePlaceholder();
                    // Focus back to input after creating pill
                    setTimeout(() => focusInput(), 0);
                }
            } else if (e.key === "Backspace") {
                // If input is empty, focus the last pill
                const text = input.textContent?.trim() || "";
                if (text.length === 0) {
                    e.preventDefault();
                    focusLastPill();
                }
            }
        });

        // Handle paste to split by comma/newline
        input.addEventListener("paste", (e: ClipboardEvent) => {
            e.preventDefault();
            const pastedText = e.clipboardData?.getData("text") || "";
            const newValues = pastedText.split(/[,\n]/).map(v => v.trim()).filter(v => v.length > 0);
            if (newValues.length > 0) {
                values.push(...newValues);
                onChange(values.join(","));
                updatePills();
                clearInput();
                updatePlaceholder();
            }
        });

        // Helper to set up pill keyboard navigation
        const setupPillNavigation = (pill: HTMLElement): void => {
            pill.addEventListener("keydown", (e: KeyboardEvent) => {
                const currentIndex = getPillIndex(pill);
                if (e.key === "Backspace" || e.key === "Delete") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentIndex > -1 && currentIndex < values.length) {
                        values.splice(currentIndex, 1);
                        onChange(values.join(","));
                        updatePills();
                        // Focus previous pill or input
                        if (values.length > 0) {
                            const newIndex = Math.max(0, currentIndex - 1);
                            setTimeout(() => focusPill(newIndex), 0);
                        } else {
                            setTimeout(() => focusInput(), 0);
                        }
                    }
                } else if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    const pills = getPills();
                    // Focus next pill or input if last pill
                    if (currentIndex < pills.length - 1) {
                        focusPill(currentIndex + 1);
                    } else {
                        focusInput();
                    }
                } else if (e.key === "Tab" && e.shiftKey) {
                    e.preventDefault();
                    // Focus previous pill or input if first pill
                    if (currentIndex > 0) {
                        focusPill(currentIndex - 1);
                    } else {
                        focusInput();
                    }
                }
            });
        };

        // Function to update pills (defined here to access navigation functions)
        const updatePills = (): void => {
            // Remove all pills (but keep the input)
            const pills = multiSelectContainer.querySelectorAll(".multi-select-pill");
            pills.forEach(pill => pill.remove());

            // Recreate pills with navigation handlers
            values.forEach((val, index) => {
                createPill(multiSelectContainer, val, () => {
                    if (index > -1 && index < values.length) {
                        values.splice(index, 1);
                        onChange(values.join(","));
                        updatePills();
                        updatePlaceholder();
                        // After deletion, focus the previous pill or input
                        if (values.length > 0) {
                            const newIndex = Math.min(index, values.length - 1);
                            setTimeout(() => focusPill(newIndex), 0);
                        } else {
                            setTimeout(() => focusInput(), 0);
                        }
                    }
                }, (pill: HTMLElement) => {
                    setupPillNavigation(pill);
                });
            });

            // Ensure input is last
            multiSelectContainer.appendChild(input);
            // Update placeholder after pills are updated
            updatePlaceholder();
        };

        // Initial render of pills
        updatePills();
        // Set initial placeholder
        updatePlaceholder();

        return multiSelectContainer;
    } else if (type === "date" || type === "datetime") {
        const input = container.createEl("input", {
            type: type === "datetime" ? "datetime-local" : "date",
            value: safeValue,
            attr: {
                max: type === "datetime" ? "9999-12-31T23:59" : "9999-12-31"
            }
        });
        input.oninput = () => onChange(input.value);
        return input;
    } else if (type === "number") {
        const input = container.createEl("input", { type: "number", value: safeValue });
        input.oninput = () => onChange(input.value);
        return input;
    } else {
        const input = container.createEl("input", { type: "text", value: safeValue });
        input.addClass("metadata-input", "metadata-input-text");
        input.placeholder = "Value...";
        input.oninput = () => onChange(input.value);
        return input;
    }
}

function createPill(container: HTMLElement, value: string, onRemove: () => void, onCreated?: (pill: HTMLElement) => void): void {
    const pill = container.createDiv({ cls: "multi-select-pill", attr: { tabindex: "0" } });
    pill.createDiv({ cls: "multi-select-pill-content", text: value });
    const removeButton = pill.createDiv({ cls: "multi-select-pill-remove-button" });
    setIcon(removeButton, "x");
    removeButton.onclick = (e) => {
        e.stopPropagation();
        onRemove();
    };
    if (onCreated) {
        onCreated(pill);
    }
}


class FilterBuilder {
    availableProperties: PropertyDef[];

    constructor(
        public plugin: ObsidianRuleEnginePlugin,
        public root: FilterGroup,
        public onSave: () => void,
        public onRefresh: () => void
    ) {
        this.availableProperties = this.scanVaultProperties();
    }

    /**
     * Gets the display label for a property key
     */
    getPropertyLabel(key: string): string {
        const labelMap: Record<string, string> = {
            "file.name": "file name",
            "file.path": "file path",
            "file.folder": "folder",
            "file.size": "file size",
            "file.ctime": "created time",
            "file.mtime": "modified time"
        };
        return labelMap[key] || key;
    }

    /**
     * Gets the icon for a property
     */
    getPropertyIcon(key: string, type: PropertyType): string {
        if (key === "file tags") return "tags";
        if (key === "aliases") return "forward";
        if (key === "file.ctime" || key === "file.mtime") return "clock";
        return TYPE_ICONS[type] || "pilcrow";
    }

    /**
     * Scans the vault to find properties and INFER their types.
     */
    scanVaultProperties(): PropertyDef[] {
        const app = this.plugin.app;
        const propMap = new Map<string, PropertyType>();

        // Define built-in properties in the desired order
        const builtInProps: Array<[string, PropertyType]> = [
            ["file", "file"],
            ["file.name", "text"],
            ["file.path", "text"],
            ["file.folder", "text"],
            ["file.ctime", "date"],
            ["file.mtime", "date"],
            ["file.size", "number"],
            ["file tags", "list"],
            ["aliases", "list"]
        ];

        // Add built-in properties
        for (const [key, type] of builtInProps) {
            propMap.set(key, type);
        }

        // Scan frontmatter properties
        const files = app.vault.getMarkdownFiles();
        for (const file of files) {
            const cache = app.metadataCache.getFileCache(file);
            if (cache?.frontmatter) {
                for (const key of Object.keys(cache.frontmatter)) {
                    if (key === "position" || key === "tags" || key === "aliases") continue;
                    if (propMap.has(key) && propMap.get(key) !== "unknown") continue;
                    const val = cache.frontmatter[key] as string | number | boolean | string[] | undefined;
                    const type = this.inferType(val);
                    propMap.set(key, type);
                }
            }
        }

        // Separate built-in and custom properties
        const builtInKeys = new Set(builtInProps.map(([key]) => key));
        const builtIn: PropertyDef[] = [];
        const custom: PropertyDef[] = [];

        for (const [key, type] of propMap.entries()) {
            const def = { key, type };
            if (builtInKeys.has(key)) {
                builtIn.push(def);
            } else {
                custom.push(def);
            }
        }

        // Sort built-in by the defined order, custom alphabetically
        builtIn.sort((a, b) => {
            const aIndex = builtInProps.findIndex(([key]) => key === a.key);
            const bIndex = builtInProps.findIndex(([key]) => key === b.key);
            return aIndex - bIndex;
        });
        custom.sort((a, b) => a.key.localeCompare(b.key));

        return [...builtIn, ...custom];
    }

    inferType(val: unknown): PropertyType {
        if (val === null || val === undefined) return "unknown";
        if (Array.isArray(val)) return "list";
        if (typeof val === "number") return "number";
        if (typeof val === "boolean") return "checkbox";
        if (typeof val === "string") {
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return "date";
            if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return "datetime";
        }
        return "text";
    }

    getPropertyType(key: string): PropertyType {
        const def = this.availableProperties.find(p => p.key === key);
        return def ? def.type : "text";
    }

    render(container: HTMLElement) {
        this.renderGroup(container, this.root, true);
    }

    renderGroup(container: HTMLElement, group: FilterGroup, isRoot: boolean = false) {
        const groupDiv = container.createDiv({ cls: "filter-group" });
        const header = groupDiv.createDiv({ cls: "filter-group-header" });

        const labelMap: Record<string, string> = {
            "AND": "All the following are true",
            "OR": "Any of the following are true",
            "NOR": "None of the following are true"
        };

        const valueMap: Record<string, string> = {
            "AND": "and",
            "OR": "or",
            "NOR": "not"
        };
        const reverseValueMap: Record<string, FilterConjunction> = {
            "and": "AND",
            "or": "OR",
            "not": "NOR"
        };

        const select = header.createEl("select", {
            cls: "conjunction dropdown",
            attr: { value: valueMap[group.operator] || "and" }
        });

        select.createEl("option", {
            attr: { value: "and" },
            text: labelMap["AND"]
        });
        select.createEl("option", {
            attr: { value: "or" },
            text: labelMap["OR"]
        });
        select.createEl("option", {
            attr: { value: "not" },
            text: labelMap["NOR"]
        });

        select.value = valueMap[group.operator] || "and";

        select.onchange = () => {
            const val = reverseValueMap[select.value];
            if (val) {
                group.operator = val;
                this.onSave();
                this.onRefresh();
            }
        };


        const statementsContainer = groupDiv.createDiv({ cls: "filter-group-statements" });

        // If conditions is empty, show a default empty rule
        if (group.conditions.length === 0) {
            const rowWrapper = statementsContainer.createDiv({ cls: "filter-row" });
            const conjLabel = rowWrapper.createSpan({ cls: "conjunction" });
            conjLabel.innerText = "Where";

            // Create a temporary placeholder filter
            const placeholderFilter: Filter = { type: "filter", field: "file", operator: "links to", value: "" };
            this.renderFilterRow(rowWrapper, placeholderFilter, group, -1, true);
        } else {
            group.conditions.forEach((condition, index) => {
                const rowWrapper = statementsContainer.createDiv({ cls: "filter-row" });
                const conjLabel = rowWrapper.createSpan({ cls: "conjunction" });
                if (index === 0) {
                    conjLabel.innerText = "Where";
                } else {
                    conjLabel.innerText = (group.operator === "OR" || group.operator === "NOR") ? "or" : "and";
                }

                if (condition.type === "group") {
                    rowWrapper.addClass("mod-group");
                    this.renderGroup(rowWrapper, condition);

                    const h = rowWrapper.querySelector(".filter-group-header");
                    if (h) {
                        const headerActionsDiv = h.createDiv({ cls: "filter-group-header-actions" });
                        createDeleteButton(headerActionsDiv, () => {
                            group.conditions.splice(index, 1);
                            this.onSave();
                            this.onRefresh();
                        });
                    }
                } else {
                    this.renderFilterRow(rowWrapper, condition, group, index);
                }
            });
        }

        const actionsDiv = groupDiv.createDiv({ cls: "filter-group-actions" });
        this.createSimpleBtn(actionsDiv, "plus", "Add filter", () => {
            group.conditions.push({ type: "filter", field: "file", operator: "links to", value: "" });
            this.onSave(); this.onRefresh();
        });
        this.createSimpleBtn(actionsDiv, "plus", "Add filter group", () => {
            group.conditions.push({ type: "group", operator: "AND", conditions: [] });
            this.onSave(); this.onRefresh();
        });
    }

    renderFilterRow(row: HTMLElement, filter: Filter, parentGroup: FilterGroup, index: number, isPlaceholder: boolean = false) {
        const statement = row.createDiv({ cls: "ore-filter-statement" });
        const expression = statement.createDiv({ cls: "ore-filter-expression metadata-property" });

        const currentType = this.getPropertyType(filter.field);

        // Track if this placeholder has been added to the conditions array
        let placeholderAdded = false;

        const propertyBtn = createComboboxButton(
            expression,
            this.getPropertyLabel(filter.field),
            this.getPropertyIcon(filter.field, currentType)
        );

        const openPropertyModal = () => {
            addFocusClasses(propertyBtn, expression);
            this.openSuggestModal(
                this.availableProperties.map(p => ({
                    label: this.getPropertyLabel(p.key),
                    value: p.key,
                    icon: this.getPropertyIcon(p.key, p.type)
                })),
                filter.field,
                (newVal) => {
                    const newType = this.getPropertyType(newVal);
                    const validOps = OPERATORS[newType === "datetime" ? "date" : newType] ?? OPERATORS["text"];
                    const newOperator = validOps?.[0] as FilterOperator;

                    // If this is a placeholder, add it to the conditions array
                    if (isPlaceholder && !placeholderAdded) {
                        parentGroup.conditions.push({
                            type: "filter",
                            field: newVal,
                            operator: newOperator,
                            value: ""
                        });
                        placeholderAdded = true;
                    } else if (isPlaceholder && placeholderAdded) {
                        // Update the filter in the conditions array
                        const conditionIndex = parentGroup.conditions.length - 1;
                        if (conditionIndex >= 0 && parentGroup.conditions[conditionIndex]?.type === "filter") {
                            const conditionFilter = parentGroup.conditions[conditionIndex];
                            conditionFilter.field = newVal;
                            conditionFilter.operator = newOperator;
                            conditionFilter.value = "";
                        }
                    } else {
                        filter.field = newVal;
                        filter.operator = newOperator;
                        filter.value = "";
                    }

                    this.onSave();
                    this.onRefresh();
                },
                propertyBtn
            );
        };

        setupComboboxButtonHandlers(propertyBtn, statement, openPropertyModal);

        let opsKey = currentType;
        if (currentType === "datetime") opsKey = "date";
        if (currentType === "unknown") opsKey = "text";
        if (!OPERATORS[opsKey]) opsKey = "text";

        const validOps = OPERATORS[opsKey] as FilterOperator[];

        const operatorBtn = createComboboxButton(expression, filter.operator);

        const openOperatorModal = () => {
            addFocusClasses(operatorBtn, expression);
            this.openSuggestModal(
                validOps.map(op => ({ label: op, value: op })),
                filter.operator,
                (newVal) => {
                    const operator = newVal as FilterOperator;
                    // If this is a placeholder, add it to the conditions array first
                    if (isPlaceholder && !placeholderAdded) {
                        parentGroup.conditions.push({ ...filter, operator });
                        placeholderAdded = true;
                    } else if (isPlaceholder && placeholderAdded) {
                        // Update the filter in the conditions array (it's the last one we added)
                        const conditionIndex = parentGroup.conditions.length - 1;
                        if (conditionIndex >= 0 && parentGroup.conditions[conditionIndex]?.type === "filter") {
                            parentGroup.conditions[conditionIndex].operator = operator;
                        }
                    } else {
                        filter.operator = operator;
                    }

                    this.onSave();
                    this.onRefresh();
                },
                operatorBtn
            );
        };

        setupComboboxButtonHandlers(operatorBtn, statement, openOperatorModal);

        const handleDelete = () => {
            if (isPlaceholder) {
                // For placeholder, just refresh to show the default again
                this.onRefresh();
            } else {
                parentGroup.conditions.splice(index, 1);
                this.onSave();
                this.onRefresh();
            }
        };

        if (!["is empty", "is not empty"].includes(filter.operator)) {
            const rhs = expression.createDiv({ cls: "ore-filter-rhs-container metadata-property-value" });

            createFilterValueInput(rhs, currentType, filter.value, (val) => {
                // If this is a placeholder, add it to the conditions array first
                if (isPlaceholder && !placeholderAdded) {
                    parentGroup.conditions.push({ ...filter, value: val });
                    placeholderAdded = true;
                } else if (isPlaceholder && placeholderAdded) {
                    // Update the filter in the conditions array (it's the last one we added)
                    const conditionIndex = parentGroup.conditions.length - 1;
                    if (conditionIndex >= 0 && parentGroup.conditions[conditionIndex]?.type === "filter") {
                        parentGroup.conditions[conditionIndex].value = val;
                    }
                } else {
                    filter.value = val;
                }

                this.onSave();
            }, filter.operator);
        }

        const actions = expression.createDiv({ cls: "ore-filter-row-actions" });
        createDeleteButton(actions, handleDelete);
    }

    openSuggestModal(
        items: { label: string, value: string, icon?: string }[],
        selectedValue: string,
        onSelect: (val: string) => void,
        anchorEl?: HTMLElement
    ) {
        const modal = new ComboboxSuggestModal(this.plugin.app, items, selectedValue, onSelect, anchorEl);
        modal.open();
    }

    createSimpleBtn(container: HTMLElement, icon: string, text: string, onClick: () => void) {
        const btn = container.createDiv({ cls: "ore-text-icon-button", attr: { tabindex: "0" } });
        setIcon(btn.createSpan({ cls: "ore-text-button-icon" }), icon);
        btn.createSpan({ cls: "ore-text-button-label", text: text });
        btn.onclick = (e) => { e.stopPropagation(); onClick(); };
    }
}

export class EditRuleModal extends Modal {
    rule: RuleConfig;

    openSuggestModal(
        items: { label: string, value: string, icon?: string }[],
        selectedValue: string,
        onSelect: (val: string) => void,
        anchorEl?: HTMLElement
    ) {
        const modal = new ComboboxSuggestModal(this.plugin.app, items, selectedValue, onSelect, anchorEl);
        modal.open();
    }

    constructor(
        app: App,
        private plugin: ObsidianRuleEnginePlugin,
        rule: RuleConfig,
        private ruleIndex: number,
        private onSave: () => void
    ) {
        super(app);
        this.rule = JSON.parse(JSON.stringify(rule)) as RuleConfig;
        this.setTitle('Edit rule');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ore-edit-rule-modal");

        new Setting(contentEl)
            .setName("Rule name")
            .setDesc("The name of the rule will be displayed in the rule list.")
            .addText(text => {
                text.setValue(this.rule.name)
                    .onChange((value) => {
                        this.rule.name = value;
                    });
                requestAnimationFrame(() => {
                    text.inputEl.select();
                });
            });

        new Setting(contentEl)
            .setName('Enabled')
            .setDesc('')
            .addToggle(toggle => {
                toggle
                    .setValue(this.rule.enabled)
                    .onChange(val => { this.rule.enabled = val; });
            });

        if (this.plugin.settings.processBaseResultsAutomatically) {
            new Setting(contentEl)
                .setName("File handling")
                .setDesc(`How should this rule execute commands?`)
                .addDropdown(dd => {
                    const options: Record<BaseFileHandling, string> = {
                        'file': 'On markdown files',
                        'results': 'Across .base results',
                        'both': 'Both'
                    };
                    dd.addOptions(options);
                    dd.setValue(this.rule.baseFileHandling);
                    dd.disabled = this.plugin.settings.processBaseResultsAutomatically;
                    dd.onChange(val => {
                        const allowed = ["file", "results", "both"];
                        if (allowed.includes(val)) {
                            this.rule.baseFileHandling = val as BaseFileHandling;
                            this.onOpen();
                        }
                    });
                });
        }

        new Setting(contentEl).setHeading().setName("Filters");
        const rulesContainer = contentEl.createDiv({ cls: "ore-parent-query-container" });

        const builder = new FilterBuilder(
            this.plugin,
            this.rule.filterGroup,
            () => { void this.plugin.saveSettings(); },
            () => { rulesContainer.empty(); builder.render(rulesContainer); }
        );
        builder.render(rulesContainer);


        new Setting(contentEl)
            .setHeading()
            .setName("Commands")
            .setDesc("Executed in order. Only shows & executes commands available in the current context.")
            .addButton(btn => {
                btn.setCta()
                    .setIcon("plus")
                    .setButtonText("Add")
                    .onClick(() => {
                        const firstCmdId = Object.keys(this.plugin.obsidianCommands)[0];
                        if (firstCmdId) {
                            this.rule.commandIds.push(firstCmdId);
                            renderCommandIdList();
                        } else {
                            this.plugin.debug(`failed to add new command ID to rule`);
                        }
                    });
            });

        const commandsContainer = contentEl.createEl("ol", { cls: "ore-parent-commands-container" });
        commandsContainer.role = "list";
        const renderCommandIdList = () => {
            commandsContainer.empty();
            this.rule.commandIds.forEach((id, idx) => {
                const childLiEl = commandsContainer.createEl("li", { cls: "ore-command-id-list-item" });
                new Setting(childLiEl).addButton(btn => {
                    btn.setIcon("terminal")
                        .setButtonText(this.plugin.obsidianCommands[id]?.name ?? id)
                        .onClick(() => {
                            const items: SuggestItem[] = Object.values(this.plugin.obsidianCommands).map(cmd => ({
                                label: cmd.name,
                                value: cmd.id,
                                icon: cmd.icon
                            })).sort((a, b) => a.label.localeCompare(b.label));
                            const selectedValue = '';
                            const onSelect = (val: string) => {
                                this.rule.commandIds[idx] = val;
                                renderCommandIdList();
                            };
                            this.openSuggestModal(items, selectedValue, onSelect, btn.buttonEl);
                        });
                })
                    .addExtraButton(btn => {
                        btn.setIcon("trash-2").onClick(() => {
                            this.rule.commandIds.splice(idx, 1);
                            renderCommandIdList();
                        });
                    });
            });
        };
        renderCommandIdList();

        new Setting(contentEl)
            .setHeading()
            .setName("HTML template")
            .setDesc("Leave blank for no template. Use {{mustache}} syntax for variables.");
        const taEl = new TextAreaComponent(contentEl)
            .setPlaceholder(`<h1>{{file.title}}</h1><main>{{file.content}}</main>`)
            .setValue(this.rule.template)
            .onChange(val => this.rule.template = val);
        taEl.inputEl.classList.add(`ore-textarea`);
        taEl.inputEl.rows = 12;

        const buttonContainer = contentEl.createDiv('modal-button-container');
        new ButtonComponent(buttonContainer)
            .setButtonText("Save")
            .setCta()
            .onClick(async () => {
                this.plugin.settings.rules[this.ruleIndex] = this.rule;
                await this.plugin.saveSettings();
                this.onSave();
                this.close();
            });

        new ButtonComponent(buttonContainer)
            .setButtonText("Cancel")
            .onClick(() => {
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}