import { describe, expect, it } from "vitest";
import { formatLocalDate, withDueDate } from "../../src/taskDates";

const D = "2026-01-02";

describe("withDueDate", () => {
	it("appends the emoji format by default", () => {
		expect(withDueDate("- [ ] Task", D)).toBe(`- [ ] Task 📅 ${D}`);
	});
	it("appends the dataview format", () => {
		expect(withDueDate("- [ ] Task", D, "dataview")).toBe(`- [ ] Task [due:: ${D}]`);
	});
	it("handles indented tasks", () => {
		expect(withDueDate("  - [ ] Sub", D)).toBe(`  - [ ] Sub 📅 ${D}`);
	});
	it("trims trailing whitespace before appending", () => {
		expect(withDueDate("- [ ] Task   \t", D)).toBe(`- [ ] Task 📅 ${D}`);
	});

	describe("already dated", () => {
		const dated = [
			"- [ ] Task 📅 2025-05-05",
			"- [ ] Task [due:: 2025-05-05]",
			"- [ ] Task (due:: 2025-05-05)",
			"- [ ] Task due:: 2025-05-05",
		];
		for (const line of dated) {
			for (const format of ["emoji", "dataview"] as const) {
				it(`skips "${line}" in ${format} format`, () => {
					expect(withDueDate(line, D, format)).toBe(line);
				});
			}
		}
		it("does not treat other dataview fields as a due date", () => {
			expect(withDueDate("- [ ] Task [start:: 2025-05-05]", D, "dataview")).toContain("[due::");
		});
	});

	describe("lines left alone", () => {
		for (const line of ["* [ ] Task", "- [x] Done", "Some text", "- bullet", ""]) {
			it(`ignores "${line}"`, () => {
				expect(withDueDate(line, D)).toBe(line);
			});
		}
	});

	it("is idempotent", () => {
		const once = withDueDate("- [ ] A", D, "dataview");
		expect(withDueDate(once, D, "dataview")).toBe(once);
	});
});

describe("formatLocalDate", () => {
	it("formats in local time, zero-padded", () => {
		expect(formatLocalDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
	});
});
