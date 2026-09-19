import { describe, expect, it } from "vitest";
import { parseCommandOverrides, stripCommandIdPrefix } from "../../src/commandOverrides";
import { errorNoticeText, plural } from "../../src/format";

describe("stripCommandIdPrefix", () => {
	it("removes the plugin prefix", () => {
		expect(stripCommandIdPrefix("rule-engine:generate-auto-moc")).toBe("generate-auto-moc");
	});
	it("leaves short ids alone", () => {
		expect(stripCommandIdPrefix("check-rules")).toBe("check-rules");
	});
});

describe("parseCommandOverrides", () => {
	it("returns nothing without frontmatter", () => {
		expect(parseCommandOverrides(undefined)).toEqual({});
	});
	it("ignores keys that aren't ore overrides", () => {
		expect(parseCommandOverrides({ title: "x", "ore:only-id": 1 })).toEqual({});
	});
	it("reads enabled as a boolean from true, 'true' and 1", () => {
		for (const value of [true, "true", 1]) {
			expect(parseCommandOverrides({ "ore:cmd:enabled": value })).toEqual({ cmd: { enabled: true } });
		}
		expect(parseCommandOverrides({ "ore:cmd:enabled": "no" })).toEqual({ cmd: { enabled: false } });
	});
	it("keeps other settings raw under params", () => {
		expect(parseCommandOverrides({ "ore:cmd:minCount": "3", "ore:cmd:heading": "Links" })).toEqual({
			cmd: { params: { minCount: "3", heading: "Links" } },
		});
	});
	it("groups settings per command", () => {
		const out = parseCommandOverrides({ "ore:a:enabled": false, "ore:b:mode": "all" });
		expect(out).toEqual({ a: { enabled: false }, b: { params: { mode: "all" } } });
	});
});

describe("errorNoticeText", () => {
	it("prefixes the message", () => {
		expect(errorNoticeText(new Error("boom"))).toBe("⛔ boom");
	});
	it("falls back to the name when the message is empty", () => {
		expect(errorNoticeText(new TypeError(""))).toBe("⛔ TypeError");
	});
});

describe("plural", () => {
	it("only omits the s for one", () => {
		expect(plural(1, "rule")).toBe("1 rule");
		expect(plural(0, "rule")).toBe("0 rules");
		expect(plural(2, "rule")).toBe("2 rules");
	});
});
