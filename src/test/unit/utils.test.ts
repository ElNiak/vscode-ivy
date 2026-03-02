import * as assert from "assert";
import { escapeHtml, formatDuration, getNonce } from "../../utils";

describe("escapeHtml", () => {
    it("escapes & < > \"", () => {
        assert.strictEqual(
            escapeHtml('a & b < c > d "e"'),
            "a &amp; b &lt; c &gt; d &quot;e&quot;",
        );
    });

    it("returns empty string unchanged", () => {
        assert.strictEqual(escapeHtml(""), "");
    });

    it("returns safe text unchanged", () => {
        assert.strictEqual(escapeHtml("hello world"), "hello world");
    });

    it("escapes single quotes", () => {
        assert.strictEqual(escapeHtml("it's"), "it&#x27;s");
    });
});

describe("getNonce", () => {
    it("returns a 32-character string", () => {
        assert.strictEqual(getNonce().length, 32);
    });

    it("contains only alphanumeric characters", () => {
        assert.ok(/^[A-Za-z0-9]+$/.test(getNonce()));
    });

    it("generates different values", () => {
        assert.notStrictEqual(getNonce(), getNonce());
    });
});

describe("formatDuration", () => {
    it("formats seconds only", () => {
        assert.strictEqual(formatDuration(45), "45s");
    });

    it("formats minutes and seconds", () => {
        assert.strictEqual(formatDuration(125), "2m 5s");
    });

    it("formats hours and minutes", () => {
        assert.strictEqual(formatDuration(3725), "1h 2m");
    });

    it("handles zero", () => {
        assert.strictEqual(formatDuration(0), "0s");
    });
});
