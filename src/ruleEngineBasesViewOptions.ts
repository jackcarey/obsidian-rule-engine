import { ViewOption } from "obsidian";

export function getRuleEngineViewOptions(): ViewOption[] {
    return [
        //todo: could be interesting to restrict a view to specific rules, by ID
        {
            type: 'dropdown',
            key: 'layout',
            displayName: 'Layout mode',
            default: 'table',
            options: {
                table: 'Table',
                grid: 'Cards', // We map 'grid' key to 'Cards' UI text
            }
        },
        // {
        //     type: 'group',
        //     displayName: 'Appearance',
        //     items: [
        //         {
        //             type: 'toggle',
        //             key: 'showLabels',
        //             displayName: 'Show card labels',
        //             default: true
        //         }
        //     ]
        // }
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