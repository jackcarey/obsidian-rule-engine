export type TaskDateFormat = 'emoji' | 'dataview';

// Unchecked "- [ ]" tasks only; other bullets and checked tasks are left alone.
const OPEN_TASK = /^\s*-\s\[ \]\s/;
// Matches [due:: x], (due:: x) and bare due:: x.
const DATAVIEW_DUE = /(^|[\s[(])due::/;

/** True if the task already has a due date in either format. */
function hasDueDate(line: string): boolean {
    return line.includes('📅') || DATAVIEW_DUE.test(line);
}

/**
 * Appends a due date to open tasks that don't have one.
 * Checking both formats stops us doubling up when the user switches format.
 */
export function applyTaskDueDates(
    text: string,
    date: string,
    format: TaskDateFormat = 'emoji',
): { text: string; changed: number } {
    const suffix = format === 'dataview' ? ` [due:: ${date}]` : ` 📅 ${date}`;
    let changed = 0;
    const lines = text.split('\n').map(rawLine => {
        // Keep CRLF endings intact, trimEnd would otherwise drop the \r.
        const cr = rawLine.endsWith('\r') ? '\r' : '';
        const line = cr ? rawLine.slice(0, -1) : rawLine;
        if (!OPEN_TASK.test(line) || hasDueDate(line)) return rawLine;
        changed++;
        return `${line.trimEnd()}${suffix}${cr}`;
    });
    return { text: lines.join('\n'), changed };
}
