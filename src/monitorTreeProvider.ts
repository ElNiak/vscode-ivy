/** Tree data provider for the Ivy LSP Monitor sidebar view. */

import * as vscode from "vscode";
import { LspStateTracker } from "./lspStateTracker";
import { formatDuration } from "./utils";

/** A tree item with a section identifier for child resolution. */
export class MonitorItem extends vscode.TreeItem {
    /** Optional payload for child resolution (e.g. file path for test features). */
    public data?: string;

    constructor(
        label: string,
        public readonly sectionId: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        this.contextValue = sectionId;
    }
}

export class MonitorTreeProvider
    implements vscode.TreeDataProvider<MonitorItem>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        MonitorItem | undefined
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private readonly _trackerSubscription: vscode.Disposable;

    constructor(private readonly tracker: LspStateTracker) {
        this._trackerSubscription = tracker.onDidChange(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    dispose(): void {
        this._trackerSubscription.dispose();
        this._onDidChangeTreeData.dispose();
    }

    getTreeItem(element: MonitorItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: MonitorItem): Promise<MonitorItem[]> {
        if (!element) {
            return this._getRootSections();
        }
        switch (element.sectionId) {
            case "server":
                return this._getServerChildren();
            case "indexing":
                return this._getIndexingChildren();
            case "analysisPipeline":
                return this._getAnalysisPipelineChildren();
            case "pipelineT3":
                return this._getPipelineT3Children();
            case "features":
                return this._getFeaturesChildren();
            case "operations":
                return this._getOperationsChildren();
            case "recent":
                return this._getRecentChildren();
            case "deepIndex":
                return this._getDeepIndexChildren();
            case "testFeatures":
                return this._getTestFeaturesChildren();
            case "diagnostics":
                return this._getDiagnosticsChildren();
            case "testFeatureItem":
                return this._getTestFeatureDetailChildren(element);
            case "configuration":
                return this._getConfigurationChildren();
            default:
                return [];
        }
    }

    private _getRootSections(): MonitorItem[] {
        return [
            new MonitorItem(
                "Server",
                "server",
                vscode.TreeItemCollapsibleState.Expanded
            ),
            new MonitorItem(
                "Indexing",
                "indexing",
                vscode.TreeItemCollapsibleState.Expanded
            ),
            new MonitorItem(
                "Analysis Pipeline",
                "analysisPipeline",
                vscode.TreeItemCollapsibleState.Expanded
            ),
            new MonitorItem(
                "Features",
                "features",
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            new MonitorItem(
                "Deep Index",
                "deepIndex",
                vscode.TreeItemCollapsibleState.Expanded
            ),
            new MonitorItem(
                "Test Features",
                "testFeatures",
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            new MonitorItem(
                "Operations",
                "operations",
                vscode.TreeItemCollapsibleState.Expanded
            ),
            new MonitorItem(
                "Recent",
                "recent",
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            new MonitorItem(
                "Diagnostics",
                "diagnostics",
                vscode.TreeItemCollapsibleState.Collapsed
            ),
            new MonitorItem(
                "Configuration",
                "configuration",
                vscode.TreeItemCollapsibleState.Collapsed
            ),
        ];
    }

    private _getServerChildren(): MonitorItem[] {
        const s = this.tracker.serverStatus;
        if (!s) {
            const item = new MonitorItem("Not connected", "serverItem");
            item.iconPath = new vscode.ThemeIcon("warning");
            return [item];
        }

        const mode = new MonitorItem(
            `Mode: ${s.mode === "full" ? "Full (z3)" : "Light"}`,
            "serverItem"
        );
        mode.iconPath = new vscode.ThemeIcon(
            s.mode === "full" ? "verified" : "warning"
        );

        const version = new MonitorItem(`Version: ${s.version}`, "serverItem");
        version.iconPath = new vscode.ThemeIcon("tag");

        const uptime = new MonitorItem(
            `Uptime: ${formatDuration(s.uptimeSeconds)}`,
            "serverItem"
        );
        uptime.iconPath = new vscode.ThemeIcon("clock");

        const tools: string[] = [];
        if (s.toolAvailability.ivyCheck) {
            tools.push("check");
        }
        if (s.toolAvailability.ivyc) {
            tools.push("ivyc");
        }
        if (s.toolAvailability.ivyShow) {
            tools.push("show");
        }
        const toolItem = new MonitorItem(
            `Tools: ${tools.join(", ") || "none"}`,
            "serverItem"
        );
        toolItem.iconPath = new vscode.ThemeIcon("tools");

        return [mode, version, uptime, toolItem];
    }

    private _getIndexingChildren(): MonitorItem[] {
        const s = this.tracker.serverStatus;
        const stats = this.tracker.indexerStats;

        const stateLabel = !s
            ? "Waiting for server..."
            : s.indexingState === "indexing"
                ? "Indexing..."
                : s.indexingState === "error"
                    ? `Error: ${s.indexingError}`
                    : "Complete";
        const stateIcon = !s
            ? "circle-outline"
            : s.indexingState === "indexing"
                ? "sync~spin"
                : s.indexingState === "error"
                    ? "error"
                    : "pass";

        const status = new MonitorItem(
            `Status: ${stateLabel}`,
            "indexingItem"
        );
        status.iconPath = new vscode.ThemeIcon(stateIcon);

        const items = [status];
        if (stats) {
            const files = new MonitorItem(
                `Files: ${stats.fileCount.toLocaleString()}`,
                "indexingItem"
            );
            files.iconPath = new vscode.ThemeIcon("files");
            items.push(files);

            const symbols = new MonitorItem(
                `Symbols: ${stats.symbolCount.toLocaleString()}`,
                "indexingItem"
            );
            symbols.iconPath = new vscode.ThemeIcon("symbol-class");
            items.push(symbols);

            const stale = new MonitorItem(
                `Stale: ${stats.staleFiles.length} files`,
                "indexingItem"
            );
            stale.iconPath = new vscode.ThemeIcon(
                stats.staleFiles.length > 0 ? "warning" : "check"
            );
            items.push(stale);

            if (stats.lastIndexDuration != null) {
                const ago = stats.lastIndexTime
                    ? timeAgo(stats.lastIndexTime)
                    : "?";
                const last = new MonitorItem(
                    `Last: ${ago} (${stats.lastIndexDuration.toFixed(1)}s)`,
                    "indexingItem"
                );
                last.iconPath = new vscode.ThemeIcon("history");
                items.push(last);
            }
        }
        return items;
    }

    private _getOperationsChildren(): MonitorItem[] {
        const ops = this.tracker.serverStatus?.activeOperations ?? [];
        if (ops.length === 0) {
            const idle = new MonitorItem(
                "No active operations",
                "operationItem"
            );
            idle.iconPath = new vscode.ThemeIcon("check");
            return [idle];
        }
        return ops.map((op) => {
            const label = `${op.type}${op.file ? " " + basename(op.file) : ""} ${op.elapsed.toFixed(1)}s`;
            const item = new MonitorItem(label, "activeOperation");
            item.iconPath = new vscode.ThemeIcon("sync~spin");
            return item;
        });
    }

    private _getRecentChildren(): MonitorItem[] {
        const ops = this.tracker.operationHistory?.operations ?? [];
        if (ops.length === 0) {
            return [new MonitorItem("No history", "recentItem")];
        }
        return ops.slice(0, 5).map((op) => {
            const icon = op.success ? "pass" : "error";
            const status = op.success ? "OK" : "FAIL";
            const file = op.file ? " " + basename(op.file) : "";
            const label = `${status} ${op.type}${file} ${op.duration.toFixed(1)}s`;
            const item = new MonitorItem(label, "recentItem");
            item.iconPath = new vscode.ThemeIcon(icon);
            return item;
        });
    }

    private _getDiagnosticsChildren(): MonitorItem[] {
        const diags = vscode.languages.getDiagnostics();
        let errors = 0;
        let warnings = 0;
        let hints = 0;
        for (const [uri, fileDiags] of diags) {
            if (!uri.path.endsWith(".ivy")) {
                continue;
            }
            for (const d of fileDiags) {
                if (d.severity === vscode.DiagnosticSeverity.Error) {
                    errors++;
                } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
                    warnings++;
                } else {
                    hints++;
                }
            }
        }
        return [
            diagItem("Errors", errors, "error"),
            diagItem("Warnings", warnings, "warning"),
            diagItem("Hints", hints, "info"),
        ];
    }

    private _getAnalysisPipelineChildren(): MonitorItem[] {
        const pd = this.tracker.pipelineDetail;
        if (!pd) {
            const item = new MonitorItem("Waiting for server...", "pipelineItem");
            item.iconPath = new vscode.ThemeIcon("loading~spin");
            return [item];
        }

        const items: MonitorItem[] = [];

        // Tier counts
        const tierItem = new MonitorItem(
            `Tiers: T1=${pd.tiers.t1}  T2=${pd.tiers.t2}  T3=${pd.tiers.t3}`,
            "pipelineItem"
        );
        tierItem.iconPath = new vscode.ThemeIcon("layers");
        items.push(tierItem);

        // T3 status
        const t3 = pd.tier3;
        if (t3.running && t3.currentFile) {
            const t3Item = new MonitorItem(
                `T3: Compiling ${basename(t3.currentFile)}`,
                "pipelineItem"
            );
            t3Item.iconPath = new vscode.ThemeIcon("sync~spin");
            items.push(t3Item);
        } else if (t3.fileCount > 0) {
            const agoStr = t3.lastCompletedAt
                ? timeAgo(new Date(t3.lastCompletedAt * 1000).toISOString())
                : "";
            const label = t3.failed > 0
                ? `T3: ${t3.succeeded} passed, ${t3.failed} failed${agoStr ? ` (${agoStr})` : ""}`
                : `T3: ${t3.succeeded} passed${agoStr ? ` (${agoStr})` : ""}`;
            const t3Item = new MonitorItem(
                label,
                "pipelineT3",
                vscode.TreeItemCollapsibleState.Collapsed
            );
            t3Item.iconPath = new vscode.ThemeIcon(
                t3.failed > 0 ? "warning" : "pass"
            );
            items.push(t3Item);
        } else {
            const t3Item = new MonitorItem("T3: No results yet", "pipelineItem");
            t3Item.iconPath = new vscode.ThemeIcon("circle-outline");
            items.push(t3Item);
        }

        // Bulk T1+T2 progress
        if (pd.bulk.running) {
            const pct = pd.bulk.total > 0
                ? Math.round((pd.bulk.completed / pd.bulk.total) * 100)
                : 0;
            const bulkItem = new MonitorItem(
                `Bulk T1+T2: ${pd.bulk.completed}/${pd.bulk.total} (${pct}%)`,
                "pipelineItem"
            );
            bulkItem.iconPath = new vscode.ThemeIcon("sync~spin");
            items.push(bulkItem);
        }

        // Compilation status
        const comp = pd.compilation;
        if (comp.running) {
            const pct = comp.total > 0
                ? Math.round((comp.completed / comp.total) * 100)
                : 0;
            const compItem = new MonitorItem(
                `Compilation: ${comp.completed}/${comp.total} (${pct}%)`,
                "pipelineItem"
            );
            compItem.iconPath = new vscode.ThemeIcon("sync~spin");
            items.push(compItem);
        } else if (comp.cachedFiles > 0) {
            const compItem = new MonitorItem(
                `Compilation: ${comp.cachedFiles} cached`,
                "pipelineItem"
            );
            compItem.iconPath = new vscode.ThemeIcon("archive");
            items.push(compItem);
        }

        // Semantic model
        const sm = pd.semanticModel;
        if (sm.ready) {
            const smItem = new MonitorItem(
                `Semantic: ${sm.nodeCount} nodes, ${sm.edgeCount} edges`,
                "pipelineItem"
            );
            smItem.iconPath = new vscode.ThemeIcon("database");
            items.push(smItem);
        }

        return items;
    }

    private _getPipelineT3Children(): MonitorItem[] {
        // Use the T3 data from featureStatus pipeline state for per-file detail
        const ps = this.tracker.featureStatus?.analysisPipeline;
        if (!ps) {
            return [];
        }
        // Per-file results are not yet available in the polled data
        // (would require includeFileResults=true). Show summary info instead.
        const pd = this.tracker.pipelineDetail;
        if (!pd || !pd.tier3.lastFile) {
            return [];
        }
        const items: MonitorItem[] = [];
        // Show last completed file as a representative entry
        if (pd.tier3.lastFile) {
            const lastItem = new MonitorItem(
                `Last: ${basename(pd.tier3.lastFile)}`,
                "pipelineT3Item"
            );
            lastItem.iconPath = new vscode.ThemeIcon("history");
            items.push(lastItem);
        }
        return items;
    }

    private _getFeaturesChildren(): MonitorItem[] {
        const fs = this.tracker.featureStatus;
        if (!fs) {
            const item = new MonitorItem("Waiting for server...", "featureItem");
            item.iconPath = new vscode.ThemeIcon("loading~spin");
            return [item];
        }

        const items: MonitorItem[] = [];
        for (const f of fs.features) {
            const icon = featureStatusIcon(f.status);
            const label = `${f.name}: ${capitalize(f.status)}`;
            const item = new MonitorItem(label, "featureItem");
            item.iconPath = new vscode.ThemeIcon(icon);
            item.tooltip = f.reason;
            if (f.dependsOn && f.dependsOn.length > 0) {
                item.description = `depends on: ${f.dependsOn.join(", ")}`;
            }
            items.push(item);
        }

        return items;
    }

    private _getDeepIndexChildren(): MonitorItem[] {
        const p = this.tracker.deepIndexProgress;
        if (!p) {
            return [new MonitorItem("Waiting for server...", "deepIndexItem")];
        }
        if (!p.running && p.totalTests === 0) {
            const item = new MonitorItem(
                "Not started (light mode?)",
                "deepIndexItem"
            );
            item.iconPath = new vscode.ThemeIcon("circle-outline");
            return [item];
        }
        const items: MonitorItem[] = [];

        // Progress summary
        const pct =
            p.totalTests > 0
                ? Math.round((p.completedTests / p.totalTests) * 100)
                : 0;
        const label = p.running
            ? `Progress: ${p.completedTests}/${p.totalTests} (${pct}%)`
            : `Complete: ${p.completedTests}/${p.totalTests}`;
        const summary = new MonitorItem(label, "deepIndexItem");
        summary.iconPath = new vscode.ThemeIcon(
            p.running ? "sync~spin" : "pass"
        );
        items.push(summary);

        // Current file
        if (p.running && p.currentFile) {
            const cur = new MonitorItem(
                `Parsing: ${basename(p.currentFile)}`,
                "deepIndexItem"
            );
            cur.iconPath = new vscode.ThemeIcon("file-code");
            items.push(cur);
        }

        // Per-file statuses
        for (const fs of p.fileStatuses ?? []) {
            const icon = fs.deepParseSucceeded
                ? "pass"
                : fs.deepParseAttempted
                  ? "error"
                  : fs.shallowIndexed
                    ? "circle-outline"
                    : "question";
            const status = fs.deepParseSucceeded
                ? "deep"
                : fs.deepParseAttempted
                  ? "failed"
                  : "shallow";
            const item = new MonitorItem(
                `${basename(fs.file)} [${status}]`,
                "deepIndexFileItem"
            );
            item.iconPath = new vscode.ThemeIcon(icon);
            if (fs.parseError) {
                item.tooltip = fs.parseError;
            }
            items.push(item);
        }
        return items;
    }

    private _getTestFeaturesChildren(): MonitorItem[] {
        const m = this.tracker.testFeatureMatrix;
        if (!m || m.tests.length === 0) {
            return [new MonitorItem("No test data", "testFeatureItem")];
        }
        return m.tests.map((t) => {
            const readyCount = Object.values(t.features).filter(
                (s) => s === "ready"
            ).length;
            const total = Object.keys(t.features).length;
            const item = new MonitorItem(
                `${basename(t.file)} (${readyCount}/${total} ready)`,
                "testFeatureItem"
            );
            item.iconPath = new vscode.ThemeIcon(
                readyCount === total ? "pass" : "warning"
            );
            item.collapsibleState =
                vscode.TreeItemCollapsibleState.Collapsed;
            item.data = t.file;
            return item;
        });
    }

    private _getTestFeatureDetailChildren(element: MonitorItem): MonitorItem[] {
        const m = this.tracker.testFeatureMatrix;
        if (!m) {
            return [];
        }
        const entry = m.tests.find((t) => t.file === element.data);
        if (!entry) {
            return [];
        }
        return Object.entries(entry.features).map(([name, status]) => {
            const icon = featureStatusIcon(status);
            const item = new MonitorItem(
                `${capitalize(name)}: ${capitalize(status)}`,
                "testFeatureDetail"
            );
            item.iconPath = new vscode.ThemeIcon(icon);
            return item;
        });
    }

    private _getConfigurationChildren(): MonitorItem[] {
        const config = vscode.workspace.getConfiguration("ivy.lsp");
        const include =
            (config.get<string[]>("includePaths") ?? []).join(", ") ||
            "(default)";
        const exclude =
            (config.get<string[]>("excludePaths") ?? []).join(", ") ||
            "(default)";

        const inc = new MonitorItem(`Include: ${include}`, "configItem");
        inc.iconPath = new vscode.ThemeIcon("folder-opened");
        const exc = new MonitorItem(`Exclude: ${exclude}`, "configItem");
        exc.iconPath = new vscode.ThemeIcon("folder");
        return [inc, exc];
    }
}

// --- Helpers ---

function timeAgo(isoTime: string): string {
    const diff = (Date.now() - new Date(isoTime).getTime()) / 1000;
    if (diff < 60) {
        return `${Math.floor(diff)}s ago`;
    }
    if (diff < 3600) {
        return `${Math.floor(diff / 60)}m ago`;
    }
    return `${Math.floor(diff / 3600)}h ago`;
}

function basename(path: string): string {
    return path.split(/[/\\]/).pop() ?? path;
}

function diagItem(label: string, count: number, icon: string): MonitorItem {
    const item = new MonitorItem(`${label}: ${count}`, "diagnosticItem");
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
}

function featureStatusIcon(status: string): string {
    switch (status) {
        case "ready":
            return "pass";
        case "degraded":
            return "warning";
        case "unavailable":
            return "error";
        case "loading":
            return "sync~spin";
        default:
            return "question";
    }
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
