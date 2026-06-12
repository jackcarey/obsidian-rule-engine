import { EditorView, keymap, drawSelection, ViewUpdate } from "@codemirror/view";
import { EditorState, Extension, Transaction } from "@codemirror/state";
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { closeBrackets, closeBracketsKeymap, autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { html } from "@codemirror/lang-html";
import { tags as t } from "@lezer/highlight";

const obsidianHighlightStyle = HighlightStyle.define([
    { tag: t.tagName, color: "var(--code-tag)" },
    { tag: t.attributeName, color: "var(--code-property)" },
    { tag: [t.string, t.attributeValue], color: "var(--code-string)" },
    { tag: t.comment, color: "var(--code-comment)", fontStyle: "italic" },
    { tag: t.keyword, color: "var(--code-keyword)" },
    { tag: [t.number, t.bool], color: "var(--code-value)" },
    { tag: t.punctuation, color: "var(--code-punctuation)" },
    { tag: t.operator, color: "var(--code-operator)" },
    { tag: t.invalid, color: "var(--text-error)" },
]);

const obsidianTheme = EditorView.theme({
    "&": { color: "var(--text-normal)", backgroundColor: "var(--background-primary)" },
    ".cm-content": { caretColor: "var(--text-normal)", padding: "4px 0" },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "var(--text-normal)" },
    ".cm-activeLine": { backgroundColor: "transparent" },
    ".cm-tooltip": {
        backgroundColor: "var(--background-primary)",
        border: "1px solid var(--background-modifier-border)",
        color: "var(--text-normal)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "var(--background-modifier-hover)",
        color: "var(--text-normal)",
    },
    ".cm-selectionBackground, ::selection": { backgroundColor: "var(--text-selection) !important" },
});

const FILE_VARS = [
    { label: "file.basename", detail: "name without extension" },
    { label: "file.name", detail: "name with extension" },
    { label: "file.path", detail: "full path" },
    { label: "file.folder", detail: "parent folder" },
    { label: "file.extension", detail: "extension" },
    { label: "file.size", detail: "size in bytes" },
    { label: "file.ctime", detail: "creation time" },
    { label: "file.mtime", detail: "modified time" },
    { label: "file.content", detail: "markdown body" },
];

const FILTER_OPTIONS = [
    "date", "date_modify", "capitalize", "upper", "lower", "title", "camel", "kebab",
    "snake", "trim", "replace", "wikilink", "link", "image", "blockquote", "strip_tags",
    "split", "join", "first", "last", "slice", "count", "calc",
].map(label => ({ label, type: "function" as const }));

function makeCompletion(extraVars: { label: string; detail?: string }[]) {
    return (ctx: CompletionContext): CompletionResult | null => {
        const { pos, state } = ctx;
        const before = state.sliceDoc(state.doc.lineAt(pos).from, pos);
        const openAt = before.lastIndexOf("{{");
        if (openAt === -1) return null;
        const inner = before.slice(openAt + 2);
        if (inner.includes("}}")) return null;
        const pipeAt = inner.lastIndexOf("|");
        if (pipeAt !== -1) {
            const m = inner.slice(pipeAt + 1).trimStart().match(/^([a-zA-Z_]*)/);
            return m ? { from: pos - m[0].length, options: FILTER_OPTIONS } : null;
        }
        const m = inner.match(/^([a-zA-Z0-9_.]*)/);
        return m ? { from: pos - m[0].length, options: [...FILE_VARS, ...extraVars] } : null;
    };
}

// Auto-close {{ to {{|}}
const autoCloseDoubleBrace = EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== "{") return false;
    if (from === 0 || view.state.sliceDoc(from - 1, from) !== "{") return false;
    if (view.state.sliceDoc(to, to + 2) === "}}") return false;
    if (view.state.sliceDoc(to, to + 1) === "}") {
        // closeBrackets added one `}` — add second `{` and mirror `}`
        view.dispatch({
            changes: [{ from, to, insert: "{" }, { from: to + 1, to: to + 1, insert: "}" }],
            selection: { anchor: from + 1 },
            annotations: Transaction.userEvent.of("input.autoclose"),
        });
    } else {
        view.dispatch({
            changes: { from, to, insert: "{}}" },
            selection: { anchor: from + 1 },
            annotations: Transaction.userEvent.of("input.autoclose"),
        });
    }
    return true;
});

export interface TemplateEditorOptions {
    initialContent: string;
    onChange?: (content: string) => void;
    extraVars?: { label: string; detail?: string }[];
}

export function createTemplateEditor(container: HTMLElement, options: TemplateEditorOptions): EditorView {
    const exts: Extension[] = [
        history(),
        html(),
        autoCloseDoubleBrace,
        autocompletion({ override: [makeCompletion(options.extraVars ?? [])], defaultKeymap: true }),
        drawSelection(),
        indentOnInput(),
        indentUnit.of("    "),
        syntaxHighlighting(obsidianHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        obsidianTheme,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
    ];
    if (options.onChange) {
        exts.push(EditorView.updateListener.of((u: ViewUpdate) => {
            if (u.docChanged) options.onChange!(u.state.doc.toString());
        }));
    }
    return new EditorView({
        state: EditorState.create({ doc: options.initialContent, extensions: exts }),
        parent: container,
    });
}

export function setEditorContent(view: EditorView, content: string): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
}
