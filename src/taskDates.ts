export type TaskDateFormat = 'emoji' | 'dataview';

const OPEN_TASK = /^\s*-\s\[ \]\s/;
// [due:: x], (due:: x) or bare due:: x
const DATAVIEW_DUE = /(^|[\s[(])due::/;

/** Local YYYY-MM-DD; toISOString would shift the day for users far from UTC. */
export function formatLocalDate(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Skips tasks dated in either format, so switching format never doubles up. */
export function withDueDate(line: string, date: string, format: TaskDateFormat = 'emoji'): string {
    if (!OPEN_TASK.test(line) || line.includes('📅') || DATAVIEW_DUE.test(line)) return line;
    return `${line.trimEnd()}${format === 'dataview' ? ` [due:: ${date}]` : ` 📅 ${date}`}`;
}
