import {
    OPERATORS,
    RELATIVE_DATE_UNITS,
    RELATIVE_DATE_UNITS_PLURAL,
} from "consts";
import type ObsidianRuleEnginePlugin from "main";
import {
    AbstractInputSuggest,
    type App,
    ButtonComponent,
    Modal,
    type Setting,
    SettingGroup,
    setIcon,
} from "obsidian";
import type {
    AnyFilterGroup,
    Filter,
    FilterConjunction,
    FilterGroup,
    FilterOperator,
    FilterSubgroup,
    PropertyDef,
    PropertyType,
} from "types";

/**
 * Built-in type-ahead suggester for the filter property field, attached to a
 * plain text input. Unlike the old fuzzy-modal picker, the input stays
 * editable - an unrecognised typed value is still committed as-is, so users
 * can reference properties the vault scan hasn't indexed yet.
 */
class PropertySuggest extends AbstractInputSuggest<PropertyDef> {
    constructor(
        app: App,
        inputEl: HTMLInputElement,
        private plugin: ObsidianRuleEnginePlugin,
        private properties: PropertyDef[],
        private onPick: (prop: PropertyDef) => void,
    ) {
        super(app, inputEl);
    }

    protected getSuggestions(query: string): PropertyDef[] {
        const q = query.toLowerCase();
        return this.properties.filter((p) =>
            this.plugin.getPropertyLabel(p.key).toLowerCase().includes(q),
        );
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

/**
 * Appends the value control(s) for a filter row into `setting`. Every branch
 * uses Setting's own built-in components (addText/addDropdown) except the
 * multi-select case, which stays a hand-built pill widget on purpose - there
 * is no built-in multi-value control in Obsidian's Setting API.
 */
function createFilterValueInput(
    setting: Setting,
    type: PropertyType,
    value: string | undefined,
    onChange: (val: string) => void,
    operator?: string,
): void {
    const safeValue = value || "";
    const needsMultiSelect =
        operator === "contains any of" ||
        operator === "does not contain any of" ||
        operator === "contains all of" ||
        operator === "does not contain all of" ||
        operator === "has tag" ||
        operator === "does not have tag";
    if (needsMultiSelect) {
        const container = setting.controlEl;
        // Multi-select container for operators that accept multiple values
        const multiSelectContainer = container.createDiv({
            cls: "ore-multi-select-container",
            attr: { tabindex: "-1" },
        });

        // Parse existing values (comma-separated)
        const values: string[] = safeValue
            ? safeValue
                .split(",")
                .map((v) => v.trim())
                .filter((v) => v.length > 0)
            : [];

        // Create contenteditable input
        const input = multiSelectContainer.createDiv({
            cls: "ore-multi-select-input",
            attr: {
                contenteditable: "true",
                tabindex: "0",
                "data-placeholder": "Empty",
            },
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
            return Array.from(
                multiSelectContainer.querySelectorAll(".multi-select-pill"),
            );
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
            const newValues = pastedText
                .split(/[,\n]/)
                .map((v) => v.trim())
                .filter((v) => v.length > 0);
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
            pills.forEach((pill) => pill.remove());

            // Recreate pills with navigation handlers
            values.forEach((val, index) => {
                createPill(
                    multiSelectContainer,
                    val,
                    () => {
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
                    },
                    (pill: HTMLElement) => {
                        setupPillNavigation(pill);
                    },
                );
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

        return;
    } else if (operator === "within past" || operator === "within future") {
        const validUnits: readonly string[] = RELATIVE_DATE_UNITS_PLURAL;
        // Accept singular units too - matcher.ts's RELATIVE_DATE_UNITS allows them,
        // so a stored "1 minute" must not be treated as invalid and overwritten below.
        const isValidStored = new RegExp(
            `^\\d+\\s+(${RELATIVE_DATE_UNITS.join("|")})$`,
        ).test(safeValue);
        const parts = isValidStored ? safeValue.split(/\s+/) : [];
        const amount = parts[0] || "1";
        const storedUnit = parts[1] || "days";
        const unit = validUnits.includes(storedUnit)
            ? storedUnit
            : `${storedUnit}s`;

        let amountInput!: HTMLInputElement;
        let unitDropdown!: import("obsidian").DropdownComponent;
        const fireChange = () =>
            onChange(`${amountInput.value} ${unitDropdown.getValue()}`);

        setting.addText((text) => {
            text.inputEl.type = "number";
            text.inputEl.min = "1";
            text.inputEl.addClass("ore-relative-date-amount");
            text.setValue(amount);
            amountInput = text.inputEl;
            text.inputEl.oninput = fireChange;
        });
        setting.addDropdown((dropdown) => {
            dropdown.selectEl.addClass("ore-relative-date-unit");
            dropdown.addOptions(Object.fromEntries(validUnits.map((u) => [u, u])));
            dropdown.setValue(unit);
            unitDropdown = dropdown;
            dropdown.onChange(fireChange);
        });
        // Sync stored value to defaults if the stored value was not a valid relative format
        if (!isValidStored) window.setTimeout(fireChange, 0);
        return;
    } else if (type === "date" || type === "datetime") {
        setting.addText((text) => {
            text.inputEl.type = type === "datetime" ? "datetime-local" : "date";
            text.inputEl.max =
                type === "datetime" ? "9999-12-31T23:59" : "9999-12-31";
            text.setValue(safeValue);
            text.inputEl.oninput = () => onChange(text.inputEl.value);
        });
        return;
    } else if (type === "number") {
        setting.addText((text) => {
            text.inputEl.type = "number";
            text.setValue(safeValue);
            text.inputEl.oninput = () => onChange(text.inputEl.value);
        });
        return;
    } else {
        setting.addText((text) => {
            text.setValue(safeValue);
            text.inputEl.addClass("metadata-input", "metadata-input-text");
            text.setPlaceholder("Value...");
            text.inputEl.oninput = () => onChange(text.inputEl.value);
        });
        return;
    }
}

function createPill(
    container: HTMLElement,
    value: string,
    onRemove: () => void,
    onCreated?: (pill: HTMLElement) => void,
): void {
    const pill = container.createDiv({
        cls: "multi-select-pill",
        attr: { tabindex: "0" },
    });
    pill.createDiv({ cls: "multi-select-pill-content", text: value });
    const removeButton = pill.createDiv({
        cls: "multi-select-pill-remove-button",
    });
    setIcon(removeButton, "x");
    removeButton.onclick = (e) => {
        e.stopPropagation();
        onRemove();
    };
    if (onCreated) {
        onCreated(pill);
    }
}

const CONJUNCTION_LABELS: Record<FilterConjunction, string> = {
    AND: "All the following are true",
    OR: "Any of the following are true",
    NOR: "None of the following are true",
};
const CONJUNCTION_VALUES: Record<FilterConjunction, string> = {
    AND: "and",
    OR: "or",
    NOR: "not",
};
const CONJUNCTION_REVERSE: Record<string, FilterConjunction> = {
    and: "AND",
    or: "OR",
    not: "NOR",
};

/**
 * Renders the root filter group and, one level deep, its subgroups - each as
 * its own SettingGroup (built-in Obsidian component) hosting one Setting per
 * row. 2 levels is a hard ceiling: a subgroup never gets an "Add filter
 * group" button, and FilterSubgroup's own conditions are typed Filter[] only,
 * so a third level can't be constructed even by mistake.
 */
class FilterBuilder {
    availableProperties: PropertyDef[];

    constructor(
        public plugin: ObsidianRuleEnginePlugin,
        public root: FilterGroup,
        public onSave: () => void,
        public onRefresh: () => void,
    ) {
        this.availableProperties = this.plugin.scanVaultProperties();
    }

    render(container: HTMLElement) {
        const settingGroup = new SettingGroup(container);
        this.renderConjunction(settingGroup, this.root);
        this.renderConditions(settingGroup, this.root.conditions, true);

        settingGroup.addSetting((setting) => {
            setting.addButton((btn) =>
                btn
                    .setIcon("plus")
                    .setButtonText("Add filter")
                    .onClick(() => {
                        this.root.conditions.push({
                            type: "filter",
                            field: "file",
                            operator: "links to",
                            value: "",
                        });
                        this.onSave();
                        this.onRefresh();
                    })
                    .buttonEl.addClass("ore-text-icon-button"),
            );
            setting.addButton((btn) =>
                btn
                    .setIcon("plus")
                    .setButtonText("Add filter group")
                    .onClick(() => {
                        this.root.conditions.push({
                            type: "group",
                            operator: "AND",
                            conditions: [],
                        });
                        this.onSave();
                        this.onRefresh();
                    })
                    .buttonEl.addClass("ore-text-icon-button"),
            );
        });
    }

    private renderConjunction(settingGroup: SettingGroup, group: AnyFilterGroup) {
        settingGroup.addSetting((setting) => {
            setting.addDropdown((dropdown) => {
                dropdown.selectEl.addClass("conjunction");
                dropdown.addOptions({
                    and: CONJUNCTION_LABELS.AND,
                    or: CONJUNCTION_LABELS.OR,
                    not: CONJUNCTION_LABELS.NOR,
                });
                dropdown.setValue(CONJUNCTION_VALUES[group.operator] || "and");
                dropdown.onChange((newVal) => {
                    const val = CONJUNCTION_REVERSE[newVal];
                    if (val) {
                        group.operator = val;
                        this.onSave();
                        this.onRefresh();
                    }
                });
            });
        });
    }

    private renderConditions(
        settingGroup: SettingGroup,
        conditions: (Filter | FilterSubgroup)[],
        allowSubgroups: boolean,
    ) {
        if (conditions.length === 0) {
            const placeholderFilter: Filter = {
                type: "filter",
                field: "file",
                operator: "links to",
                value: "",
            };
            this.renderFilterRow(
                settingGroup,
                placeholderFilter,
                conditions,
                0,
                -1,
                true,
            );
            return;
        }

        conditions.forEach((condition, index) => {
            const conjunctionWord =
                index === 0
                    ? "Where"
                    : conditions === this.root.conditions
                        ? this.root.operator === "OR" || this.root.operator === "NOR"
                            ? "or"
                            : "and"
                        : "and";

            if (allowSubgroups && condition.type === "group") {
                this.renderSubgroup(settingGroup, condition, conjunctionWord, () => {
                    conditions.splice(index, 1);
                    this.onSave();
                    this.onRefresh();
                });
            } else if (condition.type === "filter") {
                this.renderFilterRow(
                    settingGroup,
                    condition,
                    conditions,
                    index,
                    index,
                    false,
                    conjunctionWord,
                );
            }
        });
    }

    private renderSubgroup(
        parentGroup: SettingGroup,
        subgroup: FilterSubgroup,
        conjunctionWord: string,
        onDelete: () => void,
    ) {
        const wrapper = parentGroup.listEl.createDiv({
            cls: "ore-filter-subgroup",
        });

        // Conjunction word lives in the group's own heading slot, right next
        // to its delete button, instead of a disconnected label above an
        // otherwise-empty header row.
        const settingGroup = new SettingGroup(wrapper).setHeading(conjunctionWord);
        settingGroup.addExtraButton((btn) =>
            btn
                .setIcon("trash-2")
                .setTooltip("Remove filter group")
                .onClick(onDelete),
        );

        this.renderConjunction(settingGroup, subgroup);

        if (subgroup.conditions.length === 0) {
            const placeholderFilter: Filter = {
                type: "filter",
                field: "file",
                operator: "links to",
                value: "",
            };
            this.renderFilterRow(
                settingGroup,
                placeholderFilter,
                subgroup.conditions,
                0,
                -1,
                true,
            );
        } else {
            subgroup.conditions.forEach((filter, index) => {
                const word =
                    index === 0
                        ? "Where"
                        : subgroup.operator === "OR" || subgroup.operator === "NOR"
                            ? "or"
                            : "and";
                this.renderFilterRow(
                    settingGroup,
                    filter,
                    subgroup.conditions,
                    index,
                    index,
                    false,
                    word,
                );
            });
        }

        settingGroup.addSetting((setting) => {
            setting.addButton((btn) =>
                btn
                    .setIcon("plus")
                    .setButtonText("Add filter")
                    .onClick(() => {
                        subgroup.conditions.push({
                            type: "filter",
                            field: "file",
                            operator: "links to",
                            value: "",
                        });
                        this.onSave();
                        this.onRefresh();
                    })
                    .buttonEl.addClass("ore-text-icon-button"),
            );
            // Deliberately no "Add filter group" here - subgroups are the 2nd
            // and last level, both by this UI and by FilterSubgroup's type.
        });
    }

    private renderFilterRow(
        settingGroup: SettingGroup,
        filter: Filter,
        parentConditions: (Filter | FilterSubgroup)[],
        _renderIndex: number,
        index: number,
        isPlaceholder: boolean,
        conjunctionWord: string = "Where",
    ) {
        const currentType = this.plugin.getPropertyType(
            filter.field,
            this.availableProperties,
        );
        // Track if this placeholder has been added to the conditions array
        let placeholderAdded = false;

        settingGroup.addSetting((setting) => {
            setting.settingEl.addClass("ore-filter-row");
            setting.setName(conjunctionWord);

            const commitFieldChange = (newVal: string) => {
                const newType = this.plugin.getPropertyType(
                    newVal,
                    this.availableProperties,
                );
                const validOps =
                    OPERATORS[newType === "datetime" ? "date" : newType] ??
                    OPERATORS["text"];
                const newOperator = validOps?.[0] as FilterOperator;

                if (isPlaceholder && !placeholderAdded) {
                    parentConditions.push({
                        type: "filter",
                        field: newVal,
                        operator: newOperator,
                        value: "",
                    });
                    placeholderAdded = true;
                } else if (isPlaceholder && placeholderAdded) {
                    const conditionIndex = parentConditions.length - 1;
                    const condition = parentConditions[conditionIndex];
                    if (conditionIndex >= 0 && condition?.type === "filter") {
                        condition.field = newVal;
                        condition.operator = newOperator;
                        condition.value = "";
                    }
                } else {
                    filter.field = newVal;
                    filter.operator = newOperator;
                    filter.value = "";
                }

                this.onSave();
                this.onRefresh();
            };

            setting.addText((text) => {
                text.inputEl.addClass("ore-property-input");
                text.setValue(this.plugin.getPropertyLabel(filter.field));
                const propertySuggest = new PropertySuggest(
                    this.plugin.app,
                    text.inputEl,
                    this.plugin,
                    this.availableProperties,
                    (prop) => commitFieldChange(prop.key),
                );
                propertySuggest.onSelect((prop) => commitFieldChange(prop.key));
                text.inputEl.addEventListener("blur", () => {
                    const typed = text.inputEl.value.trim();
                    if (
                        typed.length > 0 &&
                        typed !== this.plugin.getPropertyLabel(filter.field)
                    ) {
                        commitFieldChange(typed);
                    }
                });
            });

            let opsKey = currentType;
            if (currentType === "datetime") opsKey = "date";
            if (currentType === "unknown") opsKey = "text";
            if (!OPERATORS[opsKey]) opsKey = "text";
            const validOps = OPERATORS[opsKey] as FilterOperator[];

            setting.addDropdown((dropdown) => {
                dropdown.selectEl.addClass("ore-filter-operator");
                dropdown.addOptions(Object.fromEntries(validOps.map((op) => [op, op])));
                dropdown.setValue(filter.operator);
                dropdown.onChange((newVal) => {
                    const operator = newVal as FilterOperator;
                    if (isPlaceholder && !placeholderAdded) {
                        parentConditions.push({ ...filter, operator });
                        placeholderAdded = true;
                    } else if (isPlaceholder && placeholderAdded) {
                        const conditionIndex = parentConditions.length - 1;
                        const condition = parentConditions[conditionIndex];
                        if (conditionIndex >= 0 && condition?.type === "filter") {
                            condition.operator = operator;
                        }
                    } else {
                        filter.operator = operator;
                    }

                    this.onSave();
                    this.onRefresh();
                });
            });

            if (!["is empty", "is not empty"].includes(filter.operator)) {
                createFilterValueInput(
                    setting,
                    currentType,
                    filter.value,
                    (val) => {
                        if (isPlaceholder && !placeholderAdded) {
                            parentConditions.push({ ...filter, value: val });
                            placeholderAdded = true;
                        } else if (isPlaceholder && placeholderAdded) {
                            const conditionIndex = parentConditions.length - 1;
                            const condition = parentConditions[conditionIndex];
                            if (conditionIndex >= 0 && condition?.type === "filter") {
                                condition.value = val;
                            }
                        } else {
                            filter.value = val;
                        }

                        this.onSave();
                    },
                    filter.operator,
                );
            }

            const handleDelete = () => {
                if (isPlaceholder) {
                    this.onRefresh();
                } else {
                    parentConditions.splice(index, 1);
                    this.onSave();
                    this.onRefresh();
                }
            };
            setting.addExtraButton((btn) =>
                btn
                    .setIcon("trash-2")
                    .setTooltip("Remove filter")
                    .onClick(handleDelete),
            );
        });
    }
}

/**
 * Hosts the interactive filter-group builder (root group + up to one level of
 * nested subgroups, each row a property/operator/value expression) in its own
 * modal. Edits `root` in place - the same live-mutation pattern EditRuleModal
 * already uses for its command list - so there's no separate save/cancel
 * state here; whatever the outer rule editor does with its own Save/Cancel
 * governs persistence. `onChange` lets the caller refresh a summary view as
 * edits land.
 */
export class FilterModal extends Modal {
    constructor(
        app: App,
        private plugin: ObsidianRuleEnginePlugin,
        private root: FilterGroup,
        ruleName: string,
        private onChange: () => void,
    ) {
        super(app);
        this.setTitle(`Edit filters - ${ruleName}`);
    }

    onOpen() {
        const { contentEl } = this;
        // Same full viewport window + scroll styling as EditRuleModal.
        this.modalEl.addClass("ore-edit-rule-modal-window");
        contentEl.empty();
        contentEl.addClass("ore-filter-modal", "ore-edit-rule-modal");
        const container = contentEl.createDiv({
            cls: "ore-parent-query-container",
        });

        const builder = new FilterBuilder(
            this.plugin,
            this.root,
            () => {
                void this.plugin.saveSettings();
                this.onChange();
            },
            () => {
                container.empty();
                builder.render(container);
            },
        );
        builder.render(container);

        const buttonContainer = contentEl.createDiv("modal-button-container");
        new ButtonComponent(buttonContainer)
            .setButtonText("Done")
            .setCta()
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}
