import * as assert from "assert";
import { RequirementTreeProvider } from "../../requirements/requirementTreeProvider";
import { ModelDataProvider } from "../../modelDataProvider";
import { ActionBoundary, RequirementDetail } from "../../requirements/requirementTypes";

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

    function makeRequirement(overrides: Partial<RequirementDetail> = {}): RequirementDetail {
        return {
            id: "req-1",
            kind: "require",
            mixin_kind: "before",
            formulaText: "pkt.seq > 0",
            line: 5,
            file: "/path/test.ivy",
            bracketTags: [],
            stateVarsRead: [],
            nctClassification: null,
            ...overrides,
        };
    }

    function makeAction(overrides: Partial<ActionBoundary> = {}): ActionBoundary {
        return {
            actionName: "send_pkt",
            qualifiedName: "quic.send_pkt",
            file: "/path/test.ivy",
            line: 10,
            direction: "GENERATED",
            monitors: { before: [], after: [], around: [], implement: [], direct: [] },
            stateVarsRead: [],
            stateVarsWritten: [],
            rfcTags: [],
            counts: { require: 0, ensure: 0, assume: 0, assert: 0, total: 0 },
            ...overrides,
        };
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

    test("shows scope indicator when scopeInfo.scoped is true", () => {
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
                    ],
                    scopeInfo: { testFile: "/path/to/quic_server_test.ivy", scoped: true },
                },
            })
        );
        const roots = tree.getChildren(undefined);
        // First item should be the scope indicator, followed by the action.
        assert.ok(roots.length >= 2, `Expected >= 2 items, got ${roots.length}`);
        assert.ok(
            roots[0].label?.toString().includes("Scoped"),
            `Expected 'Scoped' in first item, got '${roots[0].label}'`
        );
    });

    test("dispose cleans up event emitter", () => {
        const tree = new RequirementTreeProvider(makeProvider());
        // Should not throw.
        tree.dispose();
    });

    test("expanding action with before+around+after shows 3 monitor groups", () => {
        const tree = new RequirementTreeProvider(makeProvider({
            actionRequirements: {
                modelReady: true,
                actions: [makeAction({
                    monitors: {
                        before: [makeRequirement({ mixin_kind: "before" })],
                        around: [makeRequirement({ mixin_kind: "around", kind: "ensure" })],
                        after: [makeRequirement({ mixin_kind: "after", kind: "assume" })],
                        implement: [],
                        direct: [],
                    },
                    counts: { require: 1, ensure: 1, assume: 1, assert: 0, total: 3 },
                })],
                scopeInfo: { testFile: null, scoped: false },
            },
        }));
        const roots = tree.getChildren(undefined);
        const actionItem = roots.find((r: any) => r.action !== undefined);
        assert.ok(actionItem, "Should find an ActionItem");

        const groups = tree.getChildren(actionItem);
        assert.strictEqual(groups.length, 3, "Should show Before, Around, After groups");
        const labels = groups.map((g) => g.label?.toString());
        assert.ok(labels.includes("Before"));
        assert.ok(labels.includes("Around"));
        assert.ok(labels.includes("After"));
    });

    test("expanding action with only implement monitors shows Implement group", () => {
        const tree = new RequirementTreeProvider(makeProvider({
            actionRequirements: {
                modelReady: true,
                actions: [makeAction({
                    monitors: {
                        before: [],
                        around: [],
                        after: [],
                        implement: [makeRequirement({ mixin_kind: "implement" })],
                        direct: [],
                    },
                    counts: { require: 1, ensure: 0, assume: 0, assert: 0, total: 1 },
                })],
                scopeInfo: { testFile: null, scoped: false },
            },
        }));
        const roots = tree.getChildren(undefined);
        const actionItem = roots.find((r: any) => r.action !== undefined);
        assert.ok(actionItem);

        const groups = tree.getChildren(actionItem);
        assert.strictEqual(groups.length, 1);
        assert.ok(groups[0].label?.toString().includes("Implement"));
    });

    test("expanding action with all empty monitor arrays shows 'No monitors'", () => {
        const tree = new RequirementTreeProvider(makeProvider({
            actionRequirements: {
                modelReady: true,
                actions: [makeAction()],
                scopeInfo: { testFile: null, scoped: false },
            },
        }));
        const roots = tree.getChildren(undefined);
        const actionItem = roots.find((r: any) => r.action !== undefined);
        assert.ok(actionItem);

        const groups = tree.getChildren(actionItem);
        assert.strictEqual(groups.length, 1);
        assert.ok(groups[0].label?.toString().includes("No monitors"));
    });

    test("expanding monitor group returns requirement items with correct labels", () => {
        const req1 = makeRequirement({ id: "r1", kind: "require", formulaText: "x > 0" });
        const req2 = makeRequirement({ id: "r2", kind: "ensure", formulaText: "y < 10" });
        const tree = new RequirementTreeProvider(makeProvider({
            actionRequirements: {
                modelReady: true,
                actions: [makeAction({
                    monitors: {
                        before: [req1, req2],
                        around: [], after: [], implement: [], direct: [],
                    },
                    counts: { require: 1, ensure: 1, assume: 0, assert: 0, total: 2 },
                })],
                scopeInfo: { testFile: null, scoped: false },
            },
        }));
        const roots = tree.getChildren(undefined);
        const actionItem = roots.find((r: any) => r.action !== undefined);
        assert.ok(actionItem);

        const groups = tree.getChildren(actionItem);
        assert.strictEqual(groups.length, 1, "Only Before group has items");

        const requirements = tree.getChildren(groups[0]);
        assert.strictEqual(requirements.length, 2);
        assert.ok(requirements[0].label?.toString().includes("require: x > 0"));
        assert.ok(requirements[1].label?.toString().includes("ensure: y < 10"));
    });

    test("requirement item description includes bracket tags and classification", () => {
        const req = makeRequirement({
            bracketTags: ["rfc9000:4.1"],
            nctClassification: "GUARANTEE",
            stateVarsRead: ["conn_state"],
        });
        const tree = new RequirementTreeProvider(makeProvider({
            actionRequirements: {
                modelReady: true,
                actions: [makeAction({
                    monitors: {
                        before: [req],
                        around: [], after: [], implement: [], direct: [],
                    },
                    counts: { require: 1, ensure: 0, assume: 0, assert: 0, total: 1 },
                })],
                scopeInfo: { testFile: null, scoped: false },
            },
        }));
        const roots = tree.getChildren(undefined);
        const actionItem = roots.find((r: any) => r.action !== undefined);
        assert.ok(actionItem);

        const groups = tree.getChildren(actionItem);
        const items = tree.getChildren(groups[0]);
        assert.strictEqual(items.length, 1);
        const desc = (items[0] as any).description as string;
        assert.ok(desc.includes("rfc9000:4.1"), `Expected RFC tag in description, got: ${desc}`);
        assert.ok(desc.includes("GUARANTEE"), `Expected classification in description, got: ${desc}`);
        assert.ok(desc.includes("conn_state"), `Expected state var in description, got: ${desc}`);
    });
});
