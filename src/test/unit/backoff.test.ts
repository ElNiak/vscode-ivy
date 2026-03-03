import * as assert from "assert";

describe("Backoff state machine", () => {
    function makeManager() {
        const backoffs: Record<
            string,
            { backoff: number; skipCount: number }
        > = {};
        const get = (ep: string) => {
            if (!backoffs[ep])
                backoffs[ep] = { backoff: 0, skipCount: 0 };
            return backoffs[ep];
        };
        return {
            onSuccess(ep: string) {
                const s = get(ep);
                s.backoff = 0;
                s.skipCount = 0;
            },
            onFailure(ep: string) {
                const s = get(ep);
                s.backoff = Math.min(s.backoff + 1, 5);
                s.skipCount = s.backoff;
            },
            shouldSkip(ep: string): boolean {
                const s = get(ep);
                if (s.skipCount > 0) {
                    s.skipCount--;
                    return true;
                }
                return false;
            },
            state(ep: string) {
                return get(ep);
            },
        };
    }

    it("does not skip initially", () =>
        assert.strictEqual(makeManager().shouldSkip("s"), false));

    it("skips after 1 failure", () => {
        const m = makeManager();
        m.onFailure("s");
        assert.ok(m.shouldSkip("s"));
        assert.ok(!m.shouldSkip("s"));
    });

    it("skips more after multiple failures", () => {
        const m = makeManager();
        m.onFailure("s");
        m.onFailure("s");
        assert.strictEqual(m.state("s").skipCount, 2);
    });

    it("caps at 5", () => {
        const m = makeManager();
        for (let i = 0; i < 10; i++) m.onFailure("s");
        assert.strictEqual(m.state("s").backoff, 5);
    });

    it("resets on success", () => {
        const m = makeManager();
        m.onFailure("s");
        m.onSuccess("s");
        assert.strictEqual(m.state("s").backoff, 0);
        assert.ok(!m.shouldSkip("s"));
    });

    it("isolates endpoints", () => {
        const m = makeManager();
        m.onFailure("a");
        assert.ok(m.shouldSkip("a"));
        assert.ok(!m.shouldSkip("b"));
    });
});
