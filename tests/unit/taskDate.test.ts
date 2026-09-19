import { describe, expect, it } from "vitest";
import { applyTaskDueDates } from "../../src/taskDates";

const D = "2026-01-02";

describe("applyTaskDueDates - formats", () => {
	it("appends the emoji format by default", () => {
		expect(applyTaskDueDates("- [ ] Task", D)).toEqual({
			text: `- [ ] Task 📅 ${D}`,
			changed: 1,
		});
	});
	it("appends the emoji format when asked", () => {
		expect(applyTaskDueDates("- [ ] Task", D, "emoji").text).toBe(`- [ ] Task 📅 ${D}`);
	});
	it("appends the dataview format", () => {
		expect(applyTaskDueDates("- [ ] Task", D, "dataview")).toEqual({
			text: `- [ ] Task [due:: ${D}]`,
			changed: 1,
		});
	});
	it("handles indented tasks", () => {
		expect(applyTaskDueDates("  - [ ] Sub", D).text).toBe(`  - [ ] Sub 📅 ${D}`);
	});
});

describe("applyTaskDueDates - already dated", () => {
	const dated = [
		"- [ ] Task 📅 2025-05-05",
		"- [ ] Task [due:: 2025-05-05]",
		"- [ ] Task (due:: 2025-05-05)",
		"- [ ] Task due:: 2025-05-05",
	];
	for (const line of dated) {
		for (const format of ["emoji", "dataview"] as const) {
			it(`skips "${line}" in ${format} format`, () => {
				expect(applyTaskDueDates(line, D, format)).toEqual({ text: line, changed: 0 });
			});
		}
	}
	it("does not treat other dataview fields as a due date", () => {
		expect(applyTaskDueDates("- [ ] Task [start:: 2025-05-05]", D, "dataview").changed).toBe(1);
	});
});

describe("applyTaskDueDates - lines left alone", () => {
	it("ignores `* [ ]` bullets", () => {
		expect(applyTaskDueDates("* [ ] Task", D)).toEqual({ text: "* [ ] Task", changed: 0 });
	});
	it("ignores checked tasks", () => {
		expect(applyTaskDueDates("- [x] Done", D)).toEqual({ text: "- [x] Done", changed: 0 });
	});
	it("ignores plain text and plain bullets", () => {
		const text = "Some text\n- bullet\n";
		expect(applyTaskDueDates(text, D)).toEqual({ text, changed: 0 });
	});
});

describe("applyTaskDueDates - whole text", () => {
	it("updates several tasks and leaves the rest", () => {
		const input = ["# Title", "- [ ] One", "- [x] Two", "- [ ] Three 📅 2025-01-01", "- [ ] Four"].join("\n");
		const out = applyTaskDueDates(input, D, "dataview");
		expect(out.changed).toBe(2);
		expect(out.text).toBe(
			["# Title", `- [ ] One [due:: ${D}]`, "- [x] Two", "- [ ] Three 📅 2025-01-01", `- [ ] Four [due:: ${D}]`].join("\n"),
		);
	});
	it("trims trailing whitespace before appending", () => {
		expect(applyTaskDueDates("- [ ] Task   \t", D).text).toBe(`- [ ] Task 📅 ${D}`);
	});
	it("keeps a trailing newline", () => {
		expect(applyTaskDueDates("- [ ] Task\n", D).text).toBe(`- [ ] Task 📅 ${D}\n`);
	});
	it("adds no trailing newline when there was none", () => {
		expect(applyTaskDueDates("- [ ] A\n- [ ] B", D).text.endsWith("\n")).toBe(false);
	});
	it("preserves CRLF line endings", () => {
		expect(applyTaskDueDates("- [ ] A\r\n- [ ] B\r\n", D).text).toBe(
			`- [ ] A 📅 ${D}\r\n- [ ] B 📅 ${D}\r\n`,
		);
	});
	it("is idempotent", () => {
		const once = applyTaskDueDates("- [ ] A\n- [ ] B\n", D, "dataview").text;
		expect(applyTaskDueDates(once, D, "dataview")).toEqual({ text: once, changed: 0 });
	});
	it("returns empty text unchanged", () => {
		expect(applyTaskDueDates("", D)).toEqual({ text: "", changed: 0 });
	});
});
