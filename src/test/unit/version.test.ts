import * as assert from "assert";
import { isOlderVersion } from "../../version";

describe("isOlderVersion", () => {
    it("detects patch bump as older", () => {
        assert.strictEqual(isOlderVersion("0.5.3", "0.5.5"), true);
    });

    it("same version is not older", () => {
        assert.strictEqual(isOlderVersion("0.5.5", "0.5.5"), false);
    });

    it("newer patch is not older", () => {
        assert.strictEqual(isOlderVersion("0.5.6", "0.5.5"), false);
    });

    it("detects minor bump as older", () => {
        assert.strictEqual(isOlderVersion("0.4.9", "0.5.0"), true);
    });

    it("newer major is not older", () => {
        assert.strictEqual(isOlderVersion("1.0.0", "0.5.5"), false);
    });

    it("detects major bump as older", () => {
        assert.strictEqual(isOlderVersion("0.9.9", "1.0.0"), true);
    });

    it("handles two-part versions gracefully", () => {
        assert.strictEqual(isOlderVersion("0.5", "0.5.1"), true);
    });
});
