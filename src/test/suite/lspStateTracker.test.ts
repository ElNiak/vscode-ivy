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

    test("initial featureStatus is null", () => {
        const tracker = new LspStateTracker(null as any);
        assert.strictEqual(tracker.featureStatus, null);
    });

    test("setClient resets featureStatus to null", () => {
        const tracker = new LspStateTracker(null as any);
        (tracker as any).featureStatus = { features: [], analysisPipeline: {} };
        tracker.setClient(null);
        assert.strictEqual(tracker.featureStatus, null);
    });

    test("initial pipelineDetail is null", () => {
        const tracker = new LspStateTracker(null as any);
        assert.strictEqual(tracker.pipelineDetail, null);
    });

    test("setClient resets pipelineDetail to null", () => {
        const tracker = new LspStateTracker(null as any);
        (tracker as any).pipelineDetail = { tiers: { t1: 1, t2: 0, t3: 0 } };
        tracker.setClient(null);
        assert.strictEqual(tracker.pipelineDetail, null);
    });
});
