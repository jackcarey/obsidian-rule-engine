import { OPERATORS, RELATIVE_DATE_UNITS, RELATIVE_DATE_UNITS_PLURAL } from "consts";
import ObsidianRuleEnginePlugin from "main";
import { AbstractInputSuggest, App, ButtonComponent, DropdownComponent, ExtraButtonComponent, Modal, setIcon } from "obsidian";
import { Filter, FilterConjunction, FilterGroup, FilterOperator, PropertyDef, PropertyType } from "types";

/**
 * Built-in type-ahead suggester for the filter property field, attached to a
 * plain text input. Unlike the old fuzzy-modal picker, the input stays
 * editable — an unrecognised typed value is still committed as-is, so users
 * can reference properties the vault scan hasn't indexed yet.
 */
class PropertySuggest extends AbstractInputSuggest<PropertyDef> {
    constructor(
        app: App,
        inputEl: HTMLInputElement,
        private plugin: ObsidianRuleEnginePlugin,
        private properties: PropertyDef[],
        private onPick: (prop: PropertyDef) => void
    ) {
        super(app, inputEl);
    }

    protected getSuggestions(query: string): PropertyDef[] {
        const q = query.toLowerCase();
        return this.properties.filter(p => this.plugin.getPropertyLabel(p.key).toLowerCase().includes(q));
    }

    renderSuggestion(prop: PropertyDef, el: HTMLElement): void {
        const iconEl = el.createSpan({ cls: "ore-combobox-button-icon" });
        setIcon(iconEl, this.plugin.getPropertyIcon(prop.key, prop.type));
        el.createSpan({ text: this.plugin.getPropertyLabel(prop.key) });
    }

    selectSuggestion(prop: PropertyDef, _evt: MouseEvent | KeyboardEvent): void {
        this.setValue(this.plugin.getPropertyLabel(prop.key));
        this.close();
        this.onPick(prop);
    }
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
                    window.setTimeout(() => focusInput(), 0);
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
                            window.setTimeout(() => focusPill(newIndex), 0);
                        } else {
                            window.setTimeout(() => focusInput(), 0);
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
                            window.setTimeout(() => focusPill(newIndex), 0);
                        } else {
                            window.setTimeout(() => focusInput(), 0);
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
    } else if (operator === "within past" || operator === "within future") {
        const validUnits: readonly string[] = RELATIVE_DATE_UNITS_PLURAL;
        // Accept singular units too — matcher.ts's RELATIVE_DATE_UNITS allows them,
        // so a stored "1 minute" must not be treated as invalid and overwritten below.
        const isValidStored = new RegExp(`^\\d+\\s+(${RELATIVE_DATE_UNITS.join("|")})$`).test(safeValue);
        const parts = isValidStored ? safeValue.split(/\s+/) : [];
        const amount = parts[0] || "1";
        const storedUnit = parts[1] || "days";
        const unit = validUnits.includes(storedUnit) ? storedUnit : `${storedUnit}s`;
        const wrapper = container.createDiv({ cls: "ore-relative-date-container" });
        const numInput = wrapper.createEl("input", { type: "number", value: amount, attr: { min: "1" } });
        numInput.addClass("ore-relative-date-amount");
        const unitDropdown = new DropdownComponent(wrapper);
        unitDropdown.addOptions(Object.fromEntries(validUnits.map(u => [u, u])));
        unitDropdown.setValue(unit);
        const fireChange = () => onChange(`${numInput.value} ${unitDropdown.getValue()}`);
        numInput.oninput = fireChange;
        unitDropdown.onChange(fireChange);
        // Sync stored value to defaults if the stored value was not a valid relative format
        if (!isValidStored) window.setTimeout(fireChange, 0);
        return wrapper;
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
        this.availableProperties = this.plugin.scanVaultProperties();
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

        const conjunctionDropdown = new DropdownComponent(header);
        conjunctionDropdown.selectEl.addClass("conjunction");
        conjunctionDropdown.addOptions({
            and: labelMap["AND"]!,
            or: labelMap["OR"]!,
            not: labelMap["NOR"]!,
        });
        conjunctionDropdown.setValue(valueMap[group.operator] || "and");
        conjunctionDropdown.onChange((newVal) => {
            const val = reverseValueMap[newVal];
            if (val) {
                group.operator = val;
                this.onSave();
                this.onRefresh();
            }
        });


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
                        new ExtraButtonComponent(headerActionsDiv)
                            .setIcon("trash-2")
                            .setTooltip("Remove filter")
                            .onClick(() => {
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
        new ButtonComponent(actionsDiv)
            .setIcon("plus")
            .setButtonText("Add filter")
            .onClick(() => {
                group.conditions.push({ type: "filter", field: "file", operator: "links to", value: "" });
                this.onSave(); this.onRefresh();
            })
            .buttonEl.addClass("ore-text-icon-button");
        new ButtonComponent(actionsDiv)
            .setIcon("plus")
            .setButtonText("Add filter group")
            .onClick(() => {
                group.conditions.push({ type: "group", operator: "AND", conditions: [] });
                this.onSave(); this.onRefresh();
            })
            .buttonEl.addClass("ore-text-icon-button");
    }

    renderFilterRow(row: HTMLElement, filter: Filter, parentGroup: FilterGroup, index: number, isPlaceholder: boolean = false) {
        const statement = row.createDiv({ cls: "ore-filter-statement" });
        const expression = statement.createDiv({ cls: "ore-filter-expression metadata-property" });

        const currentType = this.plugin.getPropertyType(filter.field, this.availableProperties);

        // Track if this placeholder has been added to the conditions array
        let placeholderAdded = false;

        const commitFieldChange = (newVal: string) => {
            const newType = this.plugin.getPropertyType(newVal, this.availableProperties);
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
        };

        const propertyInput = expression.createEl("input", {
            type: "text",
            value: this.plugin.getPropertyLabel(filter.field),
            cls: "ore-property-input",
        });
        const propertySuggest = new PropertySuggest(
            this.plugin.app,
            propertyInput,
            this.plugin,
            this.availableProperties,
            (prop) => commitFieldChange(prop.key)
        );
        propertySuggest.onSelect((prop) => commitFieldChange(prop.key));
        propertyInput.addEventListener("blur", () => {
            const typed = propertyInput.value.trim();
            if (typed.length > 0 && typed !== this.plugin.getPropertyLabel(filter.field)) {
                commitFieldChange(typed);
            }
        });

        let opsKey = currentType;
        if (currentType === "datetime") opsKey = "date";
        if (currentType === "unknown") opsKey = "text";
        if (!OPERATORS[opsKey]) opsKey = "text";

        const validOps = OPERATORS[opsKey] as FilterOperator[];

        const operatorDropdown = new DropdownComponent(expression);
        operatorDropdown.addOptions(Object.fromEntries(validOps.map(op => [op, op])));
        operatorDropdown.setValue(filter.operator);
        operatorDropdown.onChange((newVal) => {
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
        });

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
        new ExtraButtonComponent(actions).setIcon("trash-2").setTooltip("Remove filter").onClick(handleDelete);
    }
}

/**
 * Hosts the interactive filter-group builder (AND/OR/NOR groups, arbitrarily
 * nested, each row a property/operator/value expression) in its own modal.
 * Edits `root` in place — the same live-mutation pattern EditRuleModal already
 * uses for its command list — so there's no separate save/cancel state here;
 * whatever the outer rule editor does with its own Save/Cancel governs
 * persistence. `onChange` lets the caller refresh a summary view as edits land.
 */
export class FilterModal extends Modal {
    constructor(
        app: App,
        private plugin: ObsidianRuleEnginePlugin,
        private root: FilterGroup,
        private onChange: () => void
    ) {
        super(app);
        this.setTitle("Edit filters");
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ore-filter-modal");
        const container = contentEl.createDiv({ cls: "ore-parent-query-container" });

        const builder = new FilterBuilder(
            this.plugin,
            this.root,
            () => { void this.plugin.saveSettings(); this.onChange(); },
            () => { container.empty(); builder.render(container); }
        );
        builder.render(container);

        const buttonContainer = contentEl.createDiv('modal-button-container');
        new ButtonComponent(buttonContainer)
            .setButtonText("Done")
            .setCta()
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}
