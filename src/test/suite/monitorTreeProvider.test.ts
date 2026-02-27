import * as assert from "assert";
import { MonitorTreeProvider, MonitorItem } from "../../monitorTreeProvider";
import { LspStateTracker } from "../../lspStateTracker";

suite("MonitorTreeProvider", () => {
    function makeTracker(
        overrides: Partial<{
            serverStatus: any;
            indexerStats: any;
            operationHistory: any;
            featureStatus: any;
            deepIndexProgress: any;
            testFeatureMatrix: any;
        }> = {}
    ): LspStateTracker {
        const tracker = new LspStateTracker(null as any);
        if (overrides.serverStatus !== undefined) {
            tracker.serverStatus = overrides.serverStatus;
        }
        if (overrides.indexerStats !== undefined) {
            tracker.indexerStats = overrides.indexerStats;
        }
        if (overrides.operationHistory !== undefined) {
            tracker.operationHistory = overrides.operationHistory;
        }
        if (overrides.featureStatus !== undefined) {
            (tracker as any).featureStatus = overrides.featureStatus;
        }
        if (overrides.deepIndexProgress !== undefined) {
            tracker.deepIndexProgress = overrides.deepIndexProgress;
        }
        if (overrides.testFeatureMatrix !== undefined) {
            tracker.testFeatureMatrix = overrides.testFeatureMatrix;
        }
        return tracker;
    }

    test("getChildren returns root sections when no element", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const children = await provider.getChildren(undefined);
        assert.ok(
            children.length >= 4,
            "Should have at least 4 root sections"
        );
    });

    test("root sections include Server, Indexing, Operations, Recent", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const children = await provider.getChildren(undefined);
        const ids = children.map((c: MonitorItem) => c.sectionId);
        assert.ok(ids.includes("server"));
        assert.ok(ids.includes("indexing"));
        assert.ok(ids.includes("operations"));
        assert.ok(ids.includes("recent"));
    });

    test("server section shows 'Not connected' when no data", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const roots = await provider.getChildren(undefined);
        const server = roots.find((r) => r.sectionId === "server");
        assert.ok(server);
        const children = await provider.getChildren(server);
        assert.ok(children.length > 0);
        assert.ok(children[0].label?.toString().includes("Not connected"));
    });

    test("server section shows status when data available", async () => {
        const provider = new MonitorTreeProvider(
            makeTracker({
                serverStatus: {
                    mode: "full",
                    version: "0.8.0",
                    uptimeSeconds: 60,
                    indexingState: "idle",
                    toolAvailability: {
                        ivyCheck: true,
                        ivyc: true,
                        ivyShow: false,
                    },
                    activeOperations: [],
                },
            })
        );
        const roots = await provider.getChildren(undefined);
        const server = roots.find((r) => r.sectionId === "server");
        assert.ok(server);
        const children = await provider.getChildren(server);
        assert.ok(
            children.length >= 3,
            "Should have mode, version, uptime, tools"
        );
        const labels = children.map((c) => c.label?.toString() ?? "");
        assert.ok(labels.some((l) => l.includes("Full")));
        assert.ok(labels.some((l) => l.includes("0.8.0")));
    });

    test("operations section shows idle when no active ops", async () => {
        const provider = new MonitorTreeProvider(
            makeTracker({
                serverStatus: {
                    mode: "full",
                    version: "0.8.0",
                    uptimeSeconds: 10,
                    indexingState: "idle",
                    toolAvailability: {
                        ivyCheck: true,
                        ivyc: false,
                        ivyShow: false,
                    },
                    activeOperations: [],
                },
            })
        );
        const roots = await provider.getChildren(undefined);
        const ops = roots.find((r) => r.sectionId === "operations");
        assert.ok(ops);
        const children = await provider.getChildren(ops);
        assert.ok(
            children[0].label?.toString().includes("No active operations")
        );
    });

    test("root sections include features", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const children = await provider.getChildren(undefined);
        const ids = children.map((c: MonitorItem) => c.sectionId);
        assert.ok(ids.includes("features"), "Should have features section");
    });

    test("features section shows waiting when no data", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const roots = await provider.getChildren(undefined);
        const features = roots.find((r) => r.sectionId === "features");
        assert.ok(features);
        const children = await provider.getChildren(features);
        assert.ok(children.length > 0);
        assert.ok(
            children[0].label?.toString().includes("Waiting"),
            "Should show waiting message"
        );
    });

    test("features section shows feature items when data available", async () => {
        const tracker = makeTracker();
        (tracker as any).featureStatus = {
            features: [
                { id: "codeLens", name: "Code Lens", status: "ready", reason: "OK" },
                { id: "diagnostics", name: "Diagnostics", status: "degraded", reason: "Light" },
            ],
            analysisPipeline: {
                tier1FileCount: 5, tier2FileCount: 3, tier3FileCount: 0,
                tier3Running: false, semanticNodeCount: 42,
                semanticEdgeCount: 10, semanticModelReady: true,
            },
        };
        const provider = new MonitorTreeProvider(tracker);
        const roots = await provider.getChildren(undefined);
        const features = roots.find((r) => r.sectionId === "features");
        assert.ok(features);
        const children = await provider.getChildren(features);
        // 2 features + 1 pipeline summary = 3
        assert.ok(children.length >= 3, `Expected >= 3, got ${children.length}`);
        const labels = children.map((c) => c.label?.toString() ?? "");
        assert.ok(labels.some((l) => l.includes("Code Lens")));
        assert.ok(labels.some((l) => l.includes("Pipeline")));
    });

    test("root sections include deepIndex and testFeatures", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const children = await provider.getChildren(undefined);
        const ids = children.map((c: MonitorItem) => c.sectionId);
        assert.ok(ids.includes("deepIndex"), "Should have deepIndex section");
        assert.ok(ids.includes("testFeatures"), "Should have testFeatures section");
    });

    test("deepIndex section shows waiting when no data", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const roots = await provider.getChildren(undefined);
        const deepIndex = roots.find((r) => r.sectionId === "deepIndex");
        assert.ok(deepIndex);
        const children = await provider.getChildren(deepIndex);
        assert.ok(children.length > 0);
        assert.ok(
            children[0].label?.toString().includes("Waiting"),
            "Should show waiting message when no deep index data"
        );
    });

    test("deepIndex section shows progress when data available", async () => {
        const provider = new MonitorTreeProvider(
            makeTracker({
                deepIndexProgress: {
                    running: true,
                    totalTests: 10,
                    completedTests: 4,
                    currentFile: "/path/to/quic_server_test.ivy",
                    startedAt: new Date().toISOString(),
                    fileStatuses: [
                        { file: "/path/quic_server_test.ivy", shallowIndexed: true, deepParseAttempted: true, deepParseSucceeded: true, parseError: null },
                        { file: "/path/quic_client_test.ivy", shallowIndexed: true, deepParseAttempted: true, deepParseSucceeded: false, parseError: "parse error" },
                    ],
                },
            })
        );
        const roots = await provider.getChildren(undefined);
        const deepIndex = roots.find((r) => r.sectionId === "deepIndex");
        assert.ok(deepIndex);
        const children = await provider.getChildren(deepIndex);
        assert.ok(children.length >= 2, `Expected >= 2, got ${children.length}`);
        const labels = children.map((c) => c.label?.toString() ?? "");
        assert.ok(labels.some((l) => l.includes("4/10")), "Should show progress fraction");
    });

    test("testFeatures section shows 'No test data' when empty", async () => {
        const provider = new MonitorTreeProvider(makeTracker());
        const roots = await provider.getChildren(undefined);
        const testFeatures = roots.find((r) => r.sectionId === "testFeatures");
        assert.ok(testFeatures);
        const children = await provider.getChildren(testFeatures);
        assert.ok(children.length === 1);
        assert.ok(
            children[0].label?.toString().includes("No test data"),
            "Should show 'No test data' when no matrix"
        );
    });

    test("testFeatures section shows test entries with ready counts", async () => {
        const provider = new MonitorTreeProvider(
            makeTracker({
                testFeatureMatrix: {
                    tests: [
                        {
                            file: "/path/quic_server_test.ivy",
                            features: { completion: "ready", definition: "ready", hover: "degraded" },
                        },
                        {
                            file: "/path/quic_client_test.ivy",
                            features: { completion: "ready", definition: "unavailable", hover: "unavailable" },
                        },
                    ],
                },
            })
        );
        const roots = await provider.getChildren(undefined);
        const testFeatures = roots.find((r) => r.sectionId === "testFeatures");
        assert.ok(testFeatures);
        const children = await provider.getChildren(testFeatures);
        assert.strictEqual(children.length, 2, "Should have 2 test entries");
        const labels = children.map((c) => c.label?.toString() ?? "");
        assert.ok(labels.some((l) => l.includes("quic_server_test.ivy") && l.includes("2/3")));
        assert.ok(labels.some((l) => l.includes("quic_client_test.ivy") && l.includes("1/3")));
    });

    test("testFeature items expand to show individual features", async () => {
        const provider = new MonitorTreeProvider(
            makeTracker({
                testFeatureMatrix: {
                    tests: [
                        {
                            file: "/path/quic_server_test.ivy",
                            features: { completion: "ready", definition: "degraded", hover: "unavailable" },
                        },
                    ],
                },
            })
        );
        const roots = await provider.getChildren(undefined);
        const testFeatures = roots.find((r) => r.sectionId === "testFeatures");
        assert.ok(testFeatures);
        const testItems = await provider.getChildren(testFeatures);
        assert.strictEqual(testItems.length, 1);

        // Expand the test item — this was Bug 1
        const details = await provider.getChildren(testItems[0]);
        assert.strictEqual(details.length, 3, "Should show 3 feature details");
        const detailLabels = details.map((d) => d.label?.toString() ?? "");
        assert.ok(detailLabels.some((l) => l.includes("Completion") && l.includes("Ready")));
        assert.ok(detailLabels.some((l) => l.includes("Definition") && l.includes("Degraded")));
        assert.ok(detailLabels.some((l) => l.includes("Hover") && l.includes("Unavailable")));
    });

    test("recent section shows history entries", async () => {
        const provider = new MonitorTreeProvider(
            makeTracker({
                operationHistory: {
                    operations: [
                        {
                            type: "verify",
                            file: "/path/test.ivy",
                            startTime: new Date().toISOString(),
                            duration: 2.5,
                            success: true,
                            message: "OK",
                        },
                    ],
                },
            })
        );
        const roots = await provider.getChildren(undefined);
        const recent = roots.find((r) => r.sectionId === "recent");
        assert.ok(recent);
        const children = await provider.getChildren(recent);
        assert.ok(children.length === 1);
        assert.ok(children[0].label?.toString().includes("OK"));
        assert.ok(children[0].label?.toString().includes("verify"));
    });
});
