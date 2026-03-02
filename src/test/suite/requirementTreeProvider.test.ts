import * as assert from "assert";
import { RequirementTreeProvider } from "../../requirements/requirementTreeProvider";
import { ModelDataProvider } from "../../modelDataProvider";

suite("RequirementTreeProvider", () => {
    function makeProvider(
        overrides: Partial<{
            actionRequirements: any;
        }> = {}
    ): ModelDataProvider {
        const provider = new ModelDataProvider(null as any);
        if (overrides.actionRequirements !== undefined) {
            provider.actionRequirements = overrides.actionRequirements;
        }
        return provider;
    }

    test("shows 'Waiting for server...' when data is null", () => {
        const tree = new RequirementTreeProvider(makeProvider());
        const roots = tree.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.ok(roots[0].label?.toString().includes("Waiting for server"));
    });

    test("shows 'Indexing workspace...' when modelReady=false", () => {
        const tree = new RequirementTreeProvider(
            makeProvider({
                actionRequirements: { modelReady: false, actions: [] },
            })
        );
        const roots = tree.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.ok(roots[0].label?.toString().includes("Indexing workspace"));
    });

    test("shows 'No actions found' when actions array is empty", () => {
        const tree = new RequirementTreeProvider(
            makeProvider({
                actionRequirements: { modelReady: true, actions: [] },
            })
        );
        const roots = tree.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.ok(roots[0].label?.toString().includes("No actions found"));
    });

    test("renders ActionItem per action", () => {
        const tree = new RequirementTreeProvider(
            makeProvider({
                actionRequirements: {
                    modelReady: true,
                    actions: [
                        {
                            actionName: "send_pkt",
                            qualifiedName: "quic.send_pkt",
                            file: "/path/test.ivy",
                            line: 10,
                            direction: "GENERATED",
                            monitors: { before: [], after: [], direct: [] },
                            stateVarsRead: [],
                            stateVarsWritten: [],
                            rfcTags: [],
                            counts: { require: 0, ensure: 0, assume: 0, assert: 0, total: 0 },
                        },
                        {
                            actionName: "recv_pkt",
                            qualifiedName: "quic.recv_pkt",
                            file: "/path/test.ivy",
                            line: 20,
                            direction: "RECEIVED",
                            monitors: { before: [], after: [], direct: [] },
                            stateVarsRead: [],
                            stateVarsWritten: [],
                            rfcTags: [],
                            counts: { require: 0, ensure: 0, assume: 0, assert: 0, total: 0 },
                        },
                    ],
                },
            })
        );
        const roots = tree.getChildren(undefined);
        assert.strictEqual(roots.length, 2);
        assert.ok(roots[0].label?.toString().includes("send_pkt"));
        assert.ok(roots[1].label?.toString().includes("recv_pkt"));
    });

    test("handles null monitors without throwing", () => {
        const tree = new RequirementTreeProvider(
            makeProvider({
                actionRequirements: {
                    modelReady: true,
                    actions: [
                        {
                            actionName: "broken_action",
                            qualifiedName: "quic.broken_action",
                            file: "/path/test.ivy",
                            line: 5,
                            direction: null,
                            monitors: null as any,
                            stateVarsRead: [],
                            stateVarsWritten: [],
                            rfcTags: [],
                            counts: { require: 0, ensure: 0, assume: 0, assert: 0, total: 0 },
                        },
                    ],
                },
            })
        );
        const roots = tree.getChildren(undefined);
        assert.strictEqual(roots.length, 1, "Should have one ActionItem");

        // Expanding the action should not throw; it should yield "No monitors".
        const children = tree.getChildren(roots[0]);
        assert.strictEqual(children.length, 1);
        assert.ok(
            children[0].label?.toString().includes("No monitors"),
            `Expected 'No monitors', got '${children[0].label}'`
        );
    });

    test("shows error state when endpoint has error and no cached data", () => {
        const mdp = makeProvider();
        mdp.endpointErrors.set("actionRequirements", "Connection refused");
        const tree = new RequirementTreeProvider(mdp);
        const roots = tree.getChildren(undefined);
        assert.strictEqual(roots.length, 1);
        assert.ok(
            roots[0].label?.toString().includes("Error"),
            `Expected 'Error' in label, got '${roots[0].label}'`
        );
    });

    test("dispose cleans up event emitter", () => {
        const tree = new RequirementTreeProvider(makeProvider());
        // Should not throw.
        tree.dispose();
    });
});
