import ObsidianRuleEnginePlugin from "main";
import { BasesEntry, BasesView, HoverParent, HoverPopover, Keymap, parsePropertyId, QueryController, ViewOption } from "obsidian";

export const RULE_ENGINE_BASE_VIEW_ID = 'rule-engine-base';

export function getRuleEngineViewOptions(): ViewOption[] {
    return [
        // // Slider option
        // {
        //     type: 'slider',
        //     key: 'itemSize',
        //     displayName: 'Item size',
        //     min: 8,
        //     max: 48,
        //     step: 4,
        //     default: 16
        // },

        // // Dropdown option
        // {
        //     type: 'dropdown',
        //     key: 'layout',
        //     displayName: 'Layout mode',
        //     default: 'grid',
        //     options: {
        //         grid: 'Grid',
        //         list: 'List',
        //         compact: 'Compact'
        //     }
        // },

        // // Property selector
        // {
        //     type: 'property',
        //     key: 'groupByProperty',
        //     displayName: 'Group by',
        //     placeholder: 'Select property',
        //     filter: (prop) => !prop.startsWith('file.') // Optional filter
        // },

        // // Toggle option
        // {
        //     type: 'toggle',
        //     key: 'showLabels',
        //     displayName: 'Show labels',
        //     default: true
        // },
        // // Text input
        // {
        //     type: 'text',
        //     key: 'customPrefix',
        //     displayName: 'Custom prefix',
        //     placeholder: 'Enter prefix...'
        // },

        // // Grouped options (collapsible section)
        // {
        //     type: 'group',
        //     displayName: 'Advanced Options',
        //     items: [
        //         {
        //             type: 'toggle',
        //             key: 'debugMode',
        //             displayName: 'Debug mode',
        //             default: false
        //         },
        //         {
        //             type: 'slider',
        //             key: 'maxItems',
        //             displayName: 'Max items',
        //             min: 10,
        //             max: 1000,
        //             step: 10,
        //             default: 100
        //         }
        //     ]
        // }
    ]
}

// Add `implements HoverParent` to enable hovering over file links.
export class RuleEngineBasesView extends BasesView implements HoverParent {
    type = RULE_ENGINE_BASE_VIEW_ID;
    private plugin: ObsidianRuleEnginePlugin
    private containerEl: HTMLElement

    public hoverPopover: HoverPopover | null = null;

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: ObsidianRuleEnginePlugin) {
        super(controller);
        this.plugin = plugin
        this.containerEl = scrollEl.createDiv({ cls: 'rule-bases-view-container' })
    }

    private renderEntry(containerEl: HTMLElement, entry: BasesEntry, matchedTemplate?: string): void {
        const order = this.config.getOrder();
        // The property separator configured by the ViewOptions above can be
        // retrieved from the view config. Be sure to set a default value.
        // const propertySeparator: string = this.config.get('separator') ?? ' - ';
        const propertySeparator: string = ' | ';

        containerEl.createEl('li', 'bases-list-entry', (el) => {
            if (matchedTemplate?.length) {
                el.style = `list-style: none;display:flex;`;
                el.createDiv({ cls: 'custom-view-container' }, (divEl) => {
                    this.plugin.injectCustomView(divEl, entry.file, matchedTemplate).catch(e => this.plugin.debug(e));
                });
                return;
            }
            let firstProp = true;
            for (const propertyName of order) {
                // Properties in the order can be parsed to determine what type
                // they are: formula, note, or file.
                const { type, name } = parsePropertyId(propertyName);

                // `entry.getValue` returns the evaluated result of the property
                // in the context of this entry.
                const value = entry.getValue(propertyName);

                // Skip rendering properties which have an empty value.
                // The list items for each file may have differing length.
                if (!value) continue;

                if (!firstProp) {
                    el.createSpan({
                        cls: 'bases-list-separator',
                        text: propertySeparator
                    });
                }
                firstProp = false;

                // If the `file.name` property is included in the order, render
                // it specially so that it links to that file.
                if (name === 'name' && type === 'file') {
                    const fileName = String(entry.file.name);
                    const linkEl = el.createEl('a', { text: fileName });
                    linkEl.onClickEvent((evt) => {
                        if (evt.button !== 0 && evt.button !== 1) return;
                        evt.preventDefault();
                        const path = entry.file.path;
                        const modEvent = Keymap.isModEvent(evt);
                        void this.plugin.app.workspace.openLinkText(path, '', modEvent);
                    });

                    linkEl.addEventListener('mouseover', (evt) => {
                        this.plugin.app.workspace.trigger('hover-link', {
                            event: evt,
                            source: 'bases',
                            hoverParent: this,
                            targetEl: linkEl,
                            linktext: entry.file.path,
                        });
                    });
                }
                // For all other properties, just display the value as text.
                // In your view you may also choose to use the `Value.renderTo`
                // API to better support photos, links, icons, etc.
                else {
                    el.createSpan({
                        cls: 'bases-list-entry-property',
                        text: value === null ? '' : value?.toString()?.length ? value?.toString() : ''
                    });
                }
            }
        });
    }

    public onDataUpdated(): void {
        console.debug(`RuleEngineBasesView`, {
            entries: this.data.data,
            containerEl: this.containerEl,
            plugin: this.plugin
        });

        // Clear entries created by previous iterations. Remember, you should
        // instead attempt element reuse when possible.
        this.containerEl.empty();
        this.containerEl.style = `width:100%;height:100%;`;

        // this.data contains both grouped and ungrouped versions of the data.
        // If it's appropriate for your view type, use the grouped form.
        for (const group of this.data.groupedData) {
            const groupEl = this.containerEl.createDiv('bases-list-group');
            const groupListEl = groupEl.createEl('ul', 'bases-list-group-list');

            // Each entry in the group is a separate file in the vault matching
            // the Base filters. For list view, each entry is a separate line.
            for (const entry of group.entries) {
                const { matchedTemplate, commandIds, baseFileHandling } = this.plugin.extractMatchingRuleParameters(entry.file, { baseFileHandling: "results" });
                this.renderEntry(groupListEl, entry, matchedTemplate);
                this.plugin.executeCommands(baseFileHandling, commandIds, entry.file);
            }
        }
    }
}