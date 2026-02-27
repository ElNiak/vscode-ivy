import * as assert from "assert";
import { LspStateTracker } from "../../lspStateTracker";

suite("LspStateTracker", () => {
    test("initial state is null", () => {
        const tracker = new LspStateTracker(null as any);
        assert.strictEqual(tracker.serverStatus, null);
        assert.strictEqual(tracker.indexerStats, null);
        assert.strictEqual(tracker.operationHistory, null);
    });

    test("setVisible(false) does not start polling", () => {
        const tracker = new LspStateTracker(null as any);
        tracker.setVisible(false);
        assert.strictEqual(tracker.isPolling, false);
    });

    test("dispose stops all timers", () => {
        const tracker = new LspStateTracker(null as any);
        tracker.dispose();
        assert.strictEqual(tracker.isPolling, false);
    });

    test("sendReindex returns null when no client", async () => {
        const tracker = new LspStateTracker(null as any);
        const result = await tracker.sendReindex();
        assert.strictEqual(result, null);
    });

    test("sendClearCache returns null when no client", async () => {
        const tracker = new LspStateTracker(null as any);
        const result = await tracker.sendClearCache();
        assert.strictEqual(result, null);
    });
});
