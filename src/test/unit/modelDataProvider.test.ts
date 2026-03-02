import * as assert from "assert";
import { ModelDataProvider } from "../../modelDataProvider";

suite("ModelDataProvider", () => {
    test("setClient(null) resets all cached data", () => {
        const mdp = new ModelDataProvider(null as any);
        (mdp as any).actionRequirements = { modelReady: true, actions: [] };
        (mdp as any).modelSummary = { rows: [] };
        mdp.setClient(null);
        assert.strictEqual(mdp.actionRequirements, null);
        assert.strictEqual(mdp.modelSummary, null);
        assert.strictEqual(mdp.coverageGaps, null);
        assert.strictEqual(mdp.dependencyGraph, null);
        assert.strictEqual(mdp.stateMachine, null);
        assert.strictEqual(mdp.layeredOverview, null);
        assert.strictEqual(mdp.endpointErrors.size, 0);
    });

    test("isRefreshing getter reflects internal state", () => {
        const mdp = new ModelDataProvider(null as any);
        assert.strictEqual(mdp.isRefreshing, false);
    });

    test("dispose sets _disposed and stops polling", () => {
        const mdp = new ModelDataProvider(null as any);
        mdp.dispose();
        assert.strictEqual((mdp as any)._disposed, true);
    });

    test("_onPollSuccess resets backoff", () => {
        const mdp = new ModelDataProvider(null as any);
        (mdp as any)._backoff = 3;
        (mdp as any)._skipCount = 3;
        (mdp as any)._onPollSuccess();
        assert.strictEqual((mdp as any)._backoff, 0);
        assert.strictEqual((mdp as any)._skipCount, 0);
    });

    test("_onPollFailure increments backoff up to cap", () => {
        const mdp = new ModelDataProvider(null as any);
        (mdp as any)._onPollFailure();
        assert.strictEqual((mdp as any)._backoff, 1);
        (mdp as any)._onPollFailure();
        assert.strictEqual((mdp as any)._backoff, 2);
        // Run to cap
        for (let i = 0; i < 10; i++) {
            (mdp as any)._onPollFailure();
        }
        assert.strictEqual((mdp as any)._backoff, 5, "Backoff should cap at 5");
    });

    test("_shouldSkip decrements skip count", () => {
        const mdp = new ModelDataProvider(null as any);
        (mdp as any)._skipCount = 2;
        assert.strictEqual((mdp as any)._shouldSkip(), true);
        assert.strictEqual((mdp as any)._skipCount, 1);
        assert.strictEqual((mdp as any)._shouldSkip(), true);
        assert.strictEqual((mdp as any)._skipCount, 0);
        assert.strictEqual((mdp as any)._shouldSkip(), false);
    });
});
