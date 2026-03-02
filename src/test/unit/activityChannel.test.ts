import * as assert from "assert";

describe("ActivityChannel parse logic", () => {
    const TAG_RE = /^\[(\w{3})(?::(\w+))?\]\s+(.*)/;

    function parse(raw: string) {
        const tagMatch = raw.match(TAG_RE);
        if (!tagMatch) {
            return {
                category: null,
                phase: null,
                humanMessage: raw,
                payload: null,
                raw,
            };
        }
        const [, cat, phase, rest] = tagMatch;
        const pipeIdx = rest.lastIndexOf(" | {");
        let humanMessage: string;
        let payload: Record<string, unknown> | null = null;
        if (pipeIdx >= 0) {
            humanMessage = rest.substring(0, pipeIdx);
            try {
                payload = JSON.parse(rest.substring(pipeIdx + 3));
            } catch {
                humanMessage = rest;
            }
        } else {
            humanMessage = rest;
        }
        return {
            category: cat,
            phase: phase ?? null,
            humanMessage,
            payload,
            raw,
        };
    }

    it("parses tagged line with category and phase", () => {
        const r = parse("[MIL:indexing] Indexing 5 files");
        assert.strictEqual(r.category, "MIL");
        assert.strictEqual(r.phase, "indexing");
        assert.strictEqual(r.humanMessage, "Indexing 5 files");
    });

    it("parses tagged line without phase", () => {
        const r = parse("[DIA] Some diagnostic");
        assert.strictEqual(r.category, "DIA");
        assert.strictEqual(r.phase, null);
    });

    it("extracts JSON payload after pipe", () => {
        const r = parse('[ACT:deep_index] Parsed | {"file":"test.ivy"}');
        assert.strictEqual(r.humanMessage, "Parsed");
        assert.deepStrictEqual(r.payload, { file: "test.ivy" });
    });

    it("falls back when JSON is malformed", () => {
        const r = parse("[MIL:idx] msg | {bad");
        assert.strictEqual(r.humanMessage, "msg | {bad");
        assert.strictEqual(r.payload, null);
    });

    it("returns null category for untagged lines", () => {
        assert.strictEqual(parse("plain log").category, null);
    });

    it("handles empty string", () => {
        assert.strictEqual(parse("").category, null);
    });
});

describe("ActivityChannel shouldShow logic", () => {
    function shouldShow(
        category: string | null,
        enabled: Set<string>,
        granularity: "phase" | "file"
    ): boolean {
        if (!category || !enabled.has(category)) return false;
        if (granularity === "phase" && category === "ACT") return false;
        return true;
    }

    it("shows enabled category", () =>
        assert.ok(shouldShow("MIL", new Set(["MIL"]), "phase")));
    it("hides disabled category", () =>
        assert.ok(!shouldShow("PER", new Set(["MIL"]), "phase")));
    it("hides null category", () =>
        assert.ok(!shouldShow(null, new Set(["MIL"]), "phase")));
    it("suppresses ACT in phase mode", () =>
        assert.ok(!shouldShow("ACT", new Set(["ACT"]), "phase")));
    it("allows ACT in file mode", () =>
        assert.ok(shouldShow("ACT", new Set(["ACT"]), "file")));
});
