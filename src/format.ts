/** "1 rule", "2 rules". */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Notice text for a caught error; falls back to the name when there is no message. */
export const errorNoticeText = (e: Error): string => `⛔ ${e.message?.length ? e.message : e.name}`;
