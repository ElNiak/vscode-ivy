/** Tree data provider for the Ivy LSP Monitor sidebar view. */

import * as vscode from "vscode";
import { LspStateTracker } from "./lspStateTracker";

/** A tree item with a section identifier for child resolution. */
export class MonitorItem extends vscode.TreeItem {
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
    implements vscode.TreeDataProvider<MonitorItem>
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        MonitorItem | undefined
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly tracker: LspStateTracker) {
        tracker.onDidChange(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
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

        const stateLabel =
            s?.indexingState === "indexing"
                ? "Indexing..."
                : s?.indexingState === "error"
                  ? `Error: ${s.indexingError}`
                  : "Complete";
        const stateIcon =
            s?.indexingState === "indexing"
                ? "sync~spin"
                : s?.indexingState === "error"
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

        // Pipeline summary item
        const ps = fs.analysisPipeline;
        const pipelineLabel = ps.tier3Running
            ? "Pipeline: T3 running..."
            : ps.semanticModelReady
              ? `Pipeline: ${ps.semanticNodeCount} nodes`
              : "Pipeline: No data";
        const pipelineItem = new MonitorItem(pipelineLabel, "featureItem");
        pipelineItem.iconPath = new vscode.ThemeIcon(
            ps.tier3Running
                ? "sync~spin"
                : ps.semanticModelReady
                  ? "database"
                  : "circle-slash"
        );
        pipelineItem.tooltip =
            `T1: ${ps.tier1FileCount} files | ` +
            `T2: ${ps.tier2FileCount} files | ` +
            `T3: ${ps.tier3FileCount} files`;
        items.push(pipelineItem);

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
        for (const fs of p.fileStatuses) {
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

function formatDuration(seconds: number): string {
    if (seconds < 60) {
        return `${Math.floor(seconds)}s`;
    }
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    }
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

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
