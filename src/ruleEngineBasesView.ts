import ObsidianRuleEnginePlugin from "main";
import { BasesEntry, BasesView, HoverParent, HoverPopover, Keymap, parsePropertyId, QueryController } from "obsidian";

export const RULE_ENGINE_BASE_VIEW_ID = 'rule-engine-base';

export class RuleEngineBasesView extends BasesView implements HoverParent {
    type = RULE_ENGINE_BASE_VIEW_ID;
    private plugin: ObsidianRuleEnginePlugin;
    private containerEl: HTMLElement;
    public hoverPopover: HoverPopover | null = null;

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: ObsidianRuleEnginePlugin) {
        super(controller);
        this.plugin = plugin;
        this.containerEl = scrollEl.createDiv({ cls: 'rule-bases-view-container' });

        // @ts-expect-error eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const viewRegistry = this.app.viewRegistry;
        console.debug(`RuleEngineBasesView viewRegistry`, {
            viewRegistry,
            byType: viewRegistry.getViewCreatorByType('bases-table'),
            controller,
            window
        });
    }

    private lastDataHash: string = "";

    private get currentDataHash(): string {
        const dataHash = this.data.data.map(val => `${val.file.path}${val.file.stat.mtime}`).sort().join("_").toLowerCase();
        const propertyHash = this.data.properties.sort().join("_");
        const str = [dataHash, propertyHash].join("_");
        // FNV-1a hash
        let hash = 0x811c9dc5; // Offset basis
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193); // Prime multiplier
        }
        // Return as an unsigned hex string (e.g., "7f3a12b4")
        return (hash >>> 0).toString(16);
    }

    public onDataUpdated(): void {
        this.containerEl.empty();

        // --- 1. Container Baseline Style ---
        // Forces the view to be a vertical scrollable block, bypassing parent flex squashing.
        this.containerEl.setAttribute('style', `
            display: block !important;
            width: 100%;
            height: 100%;
            overflow-y: auto;
            padding:0;
            margin:0;
            box-sizing: border-box;
        `);

        const layoutMode = this.config.get('layout') ?? 'table';
        const order = this.config.getOrder();

        if (layoutMode === 'table') {
            const table = this.containerEl.createEl('table');
            table.setAttribute('style', `
            width: 100%;
            border-collapse: collapse;
            font-size: var(--font-small);
        `);
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            order.forEach(id => {
                const th = headerRow.createEl('th', { text: parsePropertyId(id).name });
                th.setAttribute('style', `
                text-align: left;
                padding: 4px 8px;
                border-bottom: 2px solid var(--background-modifier-border);
                color: var(--text-muted);
            `);
            });
            const tbody = table.createEl('tbody');
            for (let idx = 0; idx < this.data.groupedData.length; ++idx) {
                if (idx) {
                    tbody.append(headerRow.cloneNode(true));
                }
                const group = this.data.groupedData[idx];
                if (group?.entries?.length) {
                    this.renderGroupTableRows(tbody, group.entries, order);
                }
            }
        }

        if (layoutMode === 'grid') {
            for (const group of this.data.groupedData) {
                const groupWrapper = this.containerEl.createDiv();
                groupWrapper.style.border = `margin:0;padding:0;1px solid red`;
                this.renderGrid(groupWrapper, group.entries, order);
            }
        }

        if (this.plugin.settings.allowBaseResultExecution) {
            const thisHash = this.currentDataHash;
            const dataChanged = this.lastDataHash !== thisHash;
            // Command execution only takes place if the data has changed, not the order or grouping
            if (dataChanged) {
                for (const group of this.data.groupedData) {
                    for (const entry of group.entries) {
                        const { baseFileHandling, commandIds } = this.plugin.extractMatchingRuleParameters(entry.file, { baseFileHandling: "results" });
                        this.plugin.executeCommands(baseFileHandling, commandIds, entry.file);
                    }
                    this.lastDataHash = thisHash;
                }
            }
        }
    }

    private renderGrid(parent: HTMLElement, entries: BasesEntry[], order: string[]) {
        const widthPc = String(this.config.get("widthPercentage")) + "%";
        const heightPc = String(this.config.get("heightPercentage")) + "%";
        const gapPx = Number(this.config.get('cardGap'));
        const grid = parent.createDiv();
        // --- 2. Inlined Grid Engine ---
        grid.setAttribute('style', `
            display: grid; !important;
            grid-template-columns: repeat(auto-fill, ${widthPc});
            grid-template-rows: repeat(auto-fill, ${heightPc});
            gap: ${gapPx}px;
            width: 100%;
            min-height: max-content;
            align-items: start;
            border: 1px solid blue;
        `);

        for (const entry of entries) {
            const card = grid.createDiv();
            card.setAttribute('style', `
                background-color: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: var(--radius-m);
                display: flex;
                flex-direction: column;
                gap: 2px;
                box-shadow: var(--shadow-s);
                width:${widthPc};
                height:${heightPc};
                min-height: 3lh;
                border: 1px solid green;
            `);

            const { matchedTemplate } = this.plugin.extractMatchingRuleParameters(entry.file, { baseFileHandling: "results" });

            if (matchedTemplate?.length) {
                this.plugin.injectCustomView(card, entry.file, matchedTemplate).catch(e => console.error(e));
                continue;
            } else {
                // Render properties as rows inside the card
                for (const propId of order) {
                    // @ts-expect-error
                    const { type, name } = parsePropertyId(propId);
                    // @ts-expect-error
                    const value = entry.getValue(propId);
                    if (!value && name !== 'name') continue;

                    const row = card.createDiv();
                    // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                    row.style.display = "flex";
                    // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                    row.style.justifyContent = "space-between";
                    // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                    row.style.fontSize = "var(--font-small)";

                    if (name === 'name' && type === 'file') {
                        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                        row.style.fontWeight = "bold";
                        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                        row.style.borderBottom = "1px solid var(--background-modifier-border)";
                        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                        row.style.marginBottom = "4px";
                        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                        row.style.paddingBottom = "4px";
                        this.renderFileLink(row, entry);
                    } else {
                        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                        row.createSpan({ text: name, cls: 'card-label' }).style.color = "var(--text-muted)";
                        row.createSpan({ text: value?.toString() ?? '' });
                    }
                }
            }
        }
    }

    private renderGroupTableRows(tbody: HTMLElement, entries: BasesEntry[], order: string[]) {
        for (const entry of entries) {
            const tr = tbody.createEl('tr');
            order.forEach(id => {
                const td = tr.createEl('td');
                // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                td.style.padding = "8px";
                // eslint-disable-next-line obsidianmd/no-static-styles-assignment
                td.style.borderBottom = "1px solid var(--background-modifier-border-soft)";

                //@ts-expect-error
                const { type, name } = parsePropertyId(id);
                //@ts-expect-error
                const value = entry.getValue(id);

                if (name === 'name' && type === 'file') {
                    this.renderFileLink(td, entry);
                } else {
                    if (value === null) {
                        td.setText('-');
                    } else {
                        td.setText(value?.toString() ?? "");
                    }
                }
            });
        }
    }

    private renderFileLink(container: HTMLElement, entry: BasesEntry) {
        const linkEl = container.createEl('a', { text: entry.file.name });
        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
        linkEl.style.color = "var(--text-accent)";
        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
        linkEl.style.cursor = "pointer";

        linkEl.onClickEvent((evt) => {
            evt.preventDefault();
            const modEvent = Keymap.isModEvent(evt);
            void this.plugin.app.workspace.openLinkText(entry.file.path, '', modEvent);
        });

        linkEl.addEventListener('mouseover', (evt) => {
            this.plugin.app.workspace.trigger('hover-link', {
                event: evt, source: 'bases', hoverParent: this,
                targetEl: linkEl, linktext: entry.file.path,
            });
        });
    }
}